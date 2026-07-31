import { listLeads, replaceTranscript, upsertLead } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({ leads: await listLeads() }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const lead = (await req.json()) as Lead;
    await upsertLead(lead);
    if (lead.transcript?.length) {
      await replaceTranscript(lead.id, lead.transcript);
    }
    return { ok: true };
  });
}
