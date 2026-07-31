import { replaceTranscript, updateLead, type LeadPatch } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import type { TranscriptMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

type Body = LeadPatch & { transcript?: TranscriptMessage[] };

export async function PATCH(
  req: Request,
  ctx: RouteContext<"/api/leads/[id]">
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { transcript, ...patch } = (await req.json()) as Body;

    if (Object.keys(patch).length > 0) await updateLead(id, patch);
    if (transcript) await replaceTranscript(id, transcript);

    return { ok: true };
  });
}
