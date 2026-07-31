import { getBakery, getCampaign, saveCampaign } from "@/lib/server/db";
import { generateCampaignCopy } from "@/lib/server/llm";
import type { Campaign } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Generates (or regenerates) the ad campaign draft with the LLM. */
export async function POST() {
  const bakery = await getBakery();
  if (!bakery) {
    return Response.json({ error: "Set up the bakery first." }, { status: 400 });
  }

  const copy = await generateCampaignCopy(bakery);
  if (!copy) {
    return Response.json(
      { error: "Campaign generation failed — the AI gateway is unavailable. Try again." },
      { status: 502 }
    );
  }

  const existing = await getCampaign();
  const campaign: Campaign = {
    id: existing?.id ?? "camp-1",
    headline: copy.headline,
    body: copy.body,
    cta: copy.cta,
    audience: copy.audience,
    dailyBudget: Math.max(5, Math.round(bakery.monthlyBudget / 30)),
    status: "draft",
    launchedAt: null,
  };
  await saveCampaign(campaign);
  return Response.json({ campaign });
}
