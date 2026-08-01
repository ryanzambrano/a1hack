import { after } from "next/server";
import { openingLine } from "@/lib/agent/brain";
import { emptyState } from "@/lib/agent/ontology";
import { gatherSpeech, sayAndHangup, texml } from "@/lib/server/a1";
import { loadShop } from "@/lib/server/catalog";
import { appendTranscript, createSession, getSession, upsertLead } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * TeXML voice webhook — someone dialled the bakery.
 *
 * The greeting is fixed text rather than a model call, so the phone is
 * answered immediately instead of after a round trip to an LLM.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? `call-${Date.now()}`);
  const from = String(form.get("From") ?? "unknown");
  const leadId = `call-${callSid}`;

  try {
    const shop = await loadShop();

    // Telephony providers retry webhooks. A retry has to re-greet the caller
    // without creating a second lead or wiping the live call's state.
    const existing = await getSession(callSid);
    if (!existing) {
      await upsertLead({
        id: leadId,
        name: `Caller ${from.slice(-4)}`,
        phone: from,
        source: "Live phone call",
        createdAt: Date.now(),
        status: "calling",
        transcript: [],
        callOutcome: null,
        order: emptyState(),
        nextAction: null,
      });
      await createSession({ callSid, leadId, from });
    }

    const greeting = openingLine(shop);

    // The dashboard reads the transcript; the call does not. Writing it after
    // the response keeps it off the caller's clock.
    if (!existing) {
      after(() => appendTranscript(leadId, [{ speaker: "agent", text: greeting }]));
    }

    return texml(gatherSpeech(greeting, "/api/voice/turn"));
  } catch (err) {
    console.error("voice webhook failed", err);
    return texml(
      sayAndHangup(
        "Sorry, we're having trouble taking calls right now. Please try again in a few minutes."
      )
    );
  }
}
