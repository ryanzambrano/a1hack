import { gatherSpeech, sayAndHangup, sendSms, texml } from "@/lib/server/a1";
import { agentTurn } from "@/lib/server/llm";
import {
  getBakery,
  getLead,
  getSession,
  saveSession,
  upsertLead,
} from "@/lib/server/state";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Handles each speech turn of an in-progress call. */
export async function POST(req: Request) {
  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? "");
  const speech = String(form.get("SpeechResult") ?? "").trim();

  const session = await getSession(callSid);
  if (!session || session.done) {
    return texml(sayAndHangup("Thanks for calling. Goodbye!"));
  }
  const lead = await getLead(session.leadId);

  if (!speech) {
    const reprompt = "Sorry, I didn't catch that — could you say it again?";
    return texml(gatherSpeech(reprompt, "/api/voice/turn"));
  }

  session.messages.push({ role: "user", content: speech });
  lead?.transcript.push({ speaker: "customer", text: speech });

  const bakery = await getBakery();
  const turn = await agentTurn(bakery, session.messages);

  session.messages.push({ role: "assistant", content: turn.say });
  lead?.transcript.push({ speaker: "agent", text: turn.say });

  if (turn.done) {
    session.done = true;
    if (lead) {
      if (turn.customerName) lead.name = turn.customerName;
      lead.status = "qualified";
      lead.order = turn.order ?? null;
      lead.callOutcome =
        "Completed — caller answered the qualifying questions and confirmed the summary.";
      lead.nextAction = turn.order?.callbackTime
        ? `Call customer back: ${turn.order.callbackTime}`
        : "Call customer back with a quote";
    }
    await saveSession(session);
    if (lead) await upsertLead(lead);

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

  await saveSession(session);
  if (lead) await upsertLead(lead);
  return texml(gatherSpeech(turn.say, "/api/voice/turn"));
}
