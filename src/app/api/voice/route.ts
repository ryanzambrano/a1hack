import { gatherSpeech, sayAndHangup, texml } from "@/lib/server/a1";
import {
  appendTranscript,
  createSession,
  getBakery,
  upsertLead,
} from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Telnyx TeXML voice webhook — fires when someone calls our number. */
export async function POST(req: Request) {
  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? `call-${Date.now()}`);
  const from = String(form.get("From") ?? "unknown");
  const leadId = `call-${callSid}`;

  try {
    const bakery = await getBakery();

    await upsertLead({
      id: leadId,
      name: `Caller ${from.slice(-4)}`,
      phone: from,
      source: "Live phone call",
      createdAt: Date.now(),
      status: "calling",
      transcript: [],
      callOutcome: null,
      order: null,
      nextAction: null,
    });

    await createSession({ callSid, leadId, from });

    const greeting = `Hi! You've reached the cake request line for ${
      bakery?.name ?? "our bakery"
    }. I'm the AI assistant, and I'll take down your order details so the team can get you a quote. First off, what's your name?`;

    await appendTranscript(leadId, [{ speaker: "agent", text: greeting }]);

    return texml(gatherSpeech(greeting, "/api/voice/turn"));
  } catch (err) {
    console.error("voice webhook failed", err);
    return texml(
      sayAndHangup(
        "Sorry, we're having trouble taking your details right now. Please try again in a few minutes."
      )
    );
  }
}
