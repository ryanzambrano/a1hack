import { gatherSpeech, sayAndHangup, sendSms, texml } from "@/lib/server/a1";
import {
  appendTranscript,
  chatHistory,
  getBakery,
  getSession,
  markSessionDone,
  updateLead,
} from "@/lib/server/db";
import { agentTurn } from "@/lib/server/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Handles each speech turn of an in-progress call. */
export async function POST(req: Request) {
  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? "");
  const speech = String(form.get("SpeechResult") ?? "").trim();

  try {
    const session = await getSession(callSid);
    if (!session || session.done) {
      return texml(sayAndHangup("Thanks for calling. Goodbye!"));
    }

    if (!speech) {
      const reprompt = "Sorry, I didn't catch that — could you say it again?";
      return texml(gatherSpeech(reprompt, "/api/voice/turn"));
    }

    // Store the caller's line first: the agent's chat history is derived from
    // the transcript, so it has to be there before we ask for the next turn.
    await appendTranscript(session.leadId, [
      { speaker: "customer", text: speech },
    ]);

    const [bakery, messages] = await Promise.all([
      getBakery(),
      chatHistory(session.leadId),
    ]);

    const turn = await agentTurn(bakery, messages);

    await appendTranscript(session.leadId, [
      { speaker: "agent", text: turn.say },
    ]);

    if (turn.done) {
      await markSessionDone(callSid);
      await updateLead(session.leadId, {
        ...(turn.customerName ? { name: turn.customerName } : {}),
        status: "qualified",
        order: turn.order ?? null,
        callOutcome:
          "Completed — caller answered the qualifying questions and confirmed the summary.",
        nextAction: turn.order?.callbackTime
          ? `Call customer back: ${turn.order.callbackTime}`
          : "Call customer back with a quote",
      });

      // Best-effort SMS receipt — only delivers if the caller's number is OTP-verified.
      const bakeryName = bakery?.name ?? "The bakery";
      void sendSms(
        session.from,
        `${bakeryName}: thanks${turn.customerName ? ` ${turn.customerName}` : ""}! We got your cake request${
          turn.order ? ` (${turn.order.flavor}, ${turn.order.eventDate})` : ""
        } and will call you back ${turn.order?.callbackTime?.toLowerCase() ?? "soon"} with a quote. 🎂`
      );

      return texml(sayAndHangup(turn.say));
    }

    return texml(gatherSpeech(turn.say, "/api/voice/turn"));
  } catch (err) {
    console.error("voice turn failed", err);
    return texml(
      sayAndHangup("Sorry, something went wrong on our end. Please call back in a moment.")
    );
  }
}
