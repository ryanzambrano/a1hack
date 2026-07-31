import { escapeXml, texml } from "@/lib/server/a1";
import { getBakery, saveSession, upsertLead } from "@/lib/server/state";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

// Where inbound calls get bridged. A sip: URI needs a registered softphone;
// a +E164 number must be OTP-verified with the platform first.
const INTAKE_DIAL =
  process.env.INTAKE_DIAL ?? "sip:hackteam000484f2@sip.telnyx.com";

/** Telnyx TeXML voice webhook — bridges the caller straight to a human for intake. */
export async function POST(req: Request) {
  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? `call-${Date.now()}`);
  const from = String(form.get("From") ?? "unknown");

  const lead: Lead = {
    id: `call-${callSid}`,
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
  await upsertLead(lead);
  await saveSession({
    callSid,
    from,
    leadId: lead.id,
    messages: [],
    startedAt: Date.now(),
    done: false,
  });

  const bakery = await getBakery();
  const bakeryName = bakery?.name ?? "our bakery";
  const target = INTAKE_DIAL.startsWith("sip:")
    ? `<Sip>${escapeXml(INTAKE_DIAL)}</Sip>`
    : `<Number>${escapeXml(INTAKE_DIAL)}</Number>`;

  return texml(
    `<Say voice="Polly.Joanna">${escapeXml(
      `Thanks for calling ${bakeryName}! Connecting you to the team now.`
    )}</Say>` +
      `<Dial action="/api/voice/after" method="POST" timeout="25">${target}</Dial>`
  );
}
