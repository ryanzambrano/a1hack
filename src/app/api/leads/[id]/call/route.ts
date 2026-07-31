import { getLead, updateLead } from "@/lib/server/db";
import {
  resolveAgentId,
  resolveFromNumber,
  retellConfigured,
  retellFetch,
} from "@/lib/server/retell";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Places a real outbound Retell call to this lead. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!retellConfigured()) {
    return Response.json({ error: "Retell is not configured." }, { status: 500 });
  }

  const lead = await getLead(id);
  if (!lead) {
    return Response.json({ error: "Lead not found." }, { status: 404 });
  }

  const toNumber = lead.phone.replace(/[^\d+]/g, "");
  if (!/^\+1\d{10}$/.test(toNumber)) {
    return Response.json(
      { error: `Can't call ${lead.phone} — needs a +1XXXXXXXXXX number.` },
      { status: 400 }
    );
  }

  try {
    const [agentId, fromNumber] = await Promise.all([
      resolveAgentId(),
      resolveFromNumber(),
    ]);
    const call = await retellFetch<{ call_id: string }>("/v2/create-phone-call", {
      method: "POST",
      body: JSON.stringify({
        from_number: fromNumber,
        to_number: toNumber,
        override_agent_id: agentId,
        metadata: { lead_id: lead.id },
      }),
    });

    await updateLead(lead.id, {
      status: "calling",
      callOutcome: null,
      nextAction: null,
    });
    return Response.json({ callId: call.call_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateLead(lead.id, {
      callOutcome: `Call could not be placed: ${message.slice(0, 200)}`,
    });
    return Response.json({ error: message }, { status: 502 });
  }
}
