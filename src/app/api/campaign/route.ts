import { getCampaign, saveCampaign } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import type { Campaign } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await saveCampaign((await req.json()) as Campaign);
    return { ok: true };
  });
}

export async function GET() {
  return handle(async () => ({ campaign: await getCampaign() }));
}
