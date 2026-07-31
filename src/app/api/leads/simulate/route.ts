import { upsertLead } from "@/lib/server/db";
import { generateLeadPersona } from "@/lib/server/llm";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Creates a lead through the same pipeline a real ad submission would use.
 * The phone defaults to SIMULATED_LEAD_PHONE (a real, OTP-verified test line)
 * so the "Trigger AI call" button places an actual call.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string };

  const persona = await generateLeadPersona();
  const phone =
    body.phone?.trim() ||
    process.env.SIMULATED_LEAD_PHONE ||
    `+1555${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;

  const lead: Lead = {
    id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: persona?.name ?? `Test Lead ${new Date().toLocaleTimeString()}`,
    phone,
    source: "Meta lead ad (simulated)",
    createdAt: Date.now(),
    status: "new",
    transcript: [],
    callOutcome: null,
    order: null,
    nextAction: null,
  };
  await upsertLead(lead);
  return Response.json({ lead });
}
