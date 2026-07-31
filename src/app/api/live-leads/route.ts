import { serverState } from "@/lib/server/state";

export const dynamic = "force-dynamic";

/** Polled by the UI: real phone-call leads plus whether the server knows the bakery yet. */
export async function GET() {
  return Response.json({
    leads: Array.from(serverState.leads.values()),
    hasBakery: serverState.bakery !== null,
    agentNumber: process.env.NEXT_PUBLIC_AGENT_NUMBER ?? null,
  });
}
