import { gatherSpeech, texml } from "@/lib/server/a1";
import { serverState, upsertLead } from "@/lib/server/state";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Telnyx TeXML voice webhook — fires when someone calls our number. */
export async function POST(req: Request) {
  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? `call-${Date.now()}`);
  const from = String(form.get("From") ?? "unknown");

  const bakery = serverState.bakery;
  const leadId = `call-${callSid}`;

  const lead: Lead = {
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
  };
  upsertLead(lead);

  serverState.sessions.set(callSid, {
    callSid,
    from,
    leadId,
    messages: [],
    startedAt: Date.now(),
    done: false,
  });

  const greeting = `Hi! You've reached the cake request line for ${
    bakery?.name ?? "our bakery"
  }. I'm the AI assistant, and I'll take down your order details so the team can get you a quote. First off, what's your name?`;

  const session = serverState.sessions.get(callSid)!;
  session.messages.push({ role: "assistant", content: greeting });
  lead.transcript.push({ speaker: "agent", text: greeting });

  return texml(gatherSpeech(greeting, "/api/voice/turn"));
}
