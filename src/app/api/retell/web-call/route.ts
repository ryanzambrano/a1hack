import {
  resolveAgentId,
  retellConfigured,
  retellFetch,
} from "@/lib/server/retell";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Creates a Retell web call so the agent can be tested from the browser mic. */
export async function POST() {
  if (!retellConfigured()) {
    return Response.json(
      { error: "RETELL_API_KEY is not set — paste it into .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  try {
    const agentId = await resolveAgentId();
    const call = await retellFetch<{ access_token: string; call_id: string }>(
      "/v2/create-web-call",
      { method: "POST", body: JSON.stringify({ agent_id: agentId }) }
    );
    return Response.json({ accessToken: call.access_token, callId: call.call_id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
