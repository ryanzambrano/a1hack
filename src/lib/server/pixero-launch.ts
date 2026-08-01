import { createHash } from "node:crypto";

import { getBakery, getCampaign, saveCampaign } from "./db";
import { toolResultText, withPixeroMcp } from "./pixero-mcp";

// User-confirmed target: everything publishes to this Meta ad account.
export const PIXERO_AD_ACCOUNT_ID =
  process.env.PIXERO_AD_ACCOUNT_ID ?? "act_848168424406226";

export interface MetaPublishResult {
  canvasId: string;
  staging: string;
  publish: string;
  adAccountId: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs the campaign through Pixero's autopilot_launch_campaign — strategy,
 * creative, and publish in one call. activate stays false, so the Meta
 * campaign is created PAUSED; turning spend on is a separate, explicit step.
 */
export async function publishCampaignToMeta(): Promise<MetaPublishResult> {
  const [bakery, campaign] = await Promise.all([getBakery(), getCampaign()]);
  if (!bakery || !campaign) {
    throw new Error("Set up the bakery and generate a campaign first.");
  }
  if (!(campaign.dailyBudget > 0)) {
    throw new Error("Set a daily budget above $0 before launching.");
  }

  const brief = `Lead-generation Meta campaign for ${bakery.name} (${bakery.location}), a bakery selling ${bakery.cakeTypes.join(", ")} at $${bakery.priceMin}–$${bakery.priceMax}. Ad copy — headline: "${campaign.headline}" body: "${campaign.body}" CTA: "${campaign.cta}". Target audience: ${campaign.audience}. Creative: ONE static image ad, appetizing custom-cake photo style, headline text baked in, Meta-safe centered layout. Objective: lead form submissions (name + phone).`;

  // The campaign row id is a constant, so key on the creative content instead:
  // relaunching identical copy resumes/reuses the same Meta campaign, while a
  // regenerated campaign gets a fresh key (and a fresh launch).
  const fingerprint = createHash("sha256")
    .update(
      [
        campaign.headline,
        campaign.body,
        campaign.cta,
        campaign.audience,
        campaign.dailyBudget,
      ].join("|")
    )
    .digest("hex")
    .slice(0, 12);
  const idempotencyKey = `sweetleads-${campaign.id}-${fingerprint}`;

  return withPixeroMcp(async (client) => {
    const stages: string[] = [];
    let canvasId: string | null = null;
    // Stay under the route's 300s budget; the idempotency key lets the next
    // request resume where this one stopped.
    const deadline = Date.now() + 240_000;

    for (;;) {
      const raw = toolResultText(
        await client.callTool({
          name: "autopilot_launch_campaign",
          arguments: {
            brief,
            dailyBudget: campaign.dailyBudget,
            adAccountId: PIXERO_AD_ACCOUNT_ID,
            idempotencyKey,
            confirm: true,
            // Publish only — delivery stays OFF until spend is explicitly enabled.
            activate: false,
            ...(canvasId ? { canvasId } : {}),
          },
        })
      );
      if (raw.startsWith("TOOL ERROR:")) {
        throw new Error(`Pixero autopilot failed: ${raw.slice(0, 600)}`);
      }

      let parsed: {
        stage?: string;
        status?: string;
        canvasId?: string;
        campaignId?: string;
      } | null = null;
      try {
        const value = JSON.parse(raw) as unknown;
        if (value && typeof value === "object") parsed = value;
      } catch {
        /* plain-text report */
      }
      if (parsed?.canvasId) canvasId = parsed.canvasId;
      if (parsed?.stage) stages.push(parsed.stage);

      const done = parsed
        ? Boolean(parsed.campaignId) ||
          /published|live|active|complete|done/i.test(
            `${parsed.stage ?? ""} ${parsed.status ?? ""}`
          )
        : /published|live|campaign/i.test(raw);

      if (done) {
        await saveCampaign({
          ...campaign,
          status: "active",
          launchedAt: Date.now(),
        });
        return {
          canvasId: canvasId ?? "",
          staging: stages.join(" → ") || "Autopilot ran end to end.",
          publish: raw.slice(0, 1500),
          adAccountId: PIXERO_AD_ACCOUNT_ID,
        };
      }

      // Not terminal — the call hit Pixero's request time limit mid-build.
      if (Date.now() > deadline) {
        throw new Error(
          `Pixero autopilot is still building (${
            parsed?.stage ?? "in progress"
          }) — launch again to resume where it left off.`
        );
      }
      await sleep(2000);
    }
  });
}
