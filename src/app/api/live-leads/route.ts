import { getBakery, listLeads } from "@/lib/server/state";

export const dynamic = "force-dynamic";

/** Polled by the UI: real phone-call leads plus whether the server knows the bakery yet. */
export async function GET() {
  const [leads, bakery] = await Promise.all([listLeads(), getBakery()]);
  return Response.json({
    leads,
    hasBakery: bakery !== null,
    agentNumber: process.env.NEXT_PUBLIC_AGENT_NUMBER ?? null,
  });
}
