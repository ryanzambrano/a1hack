import {
  resolveAgentId,
  resolveFromNumber,
  retellConfigured,
  retellFetch,
} from "@/lib/server/retell";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Kicks off an outbound Retell call to the given number. */
export async function POST(req: Request) {
  if (!retellConfigured()) {
    return Response.json(
      { error: "RETELL_API_KEY is not set — paste it into .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  const { to } = (await req.json().catch(() => ({}))) as { to?: string };
  const toNumber = (to ?? "").replace(/[^\d+]/g, "");
  if (!/^\+1\d{10}$/.test(toNumber)) {
    return Response.json(
      { error: "Enter a US number in +1XXXXXXXXXX format." },
      { status: 400 }
    );
  }

  try {
    const [agentId, fromNumber] = await Promise.all([
      resolveAgentId(),
      resolveFromNumber(),
    ]);
    const call = await retellFetch<{ call_id: string; call_status: string }>(
      "/v2/create-phone-call",
      {
        method: "POST",
        body: JSON.stringify({
          from_number: fromNumber,
          to_number: toNumber,
          override_agent_id: agentId,
        }),
      }
    );
    return Response.json({
      callId: call.call_id,
      status: call.call_status,
      from: fromNumber,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
