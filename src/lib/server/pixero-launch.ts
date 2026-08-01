import { getBakery, getCampaign } from "./db";
import { toolResultText, withPixeroMcp } from "./pixero-mcp";

// User-confirmed target: everything publishes to this Meta ad account.
export const PIXERO_AD_ACCOUNT_ID =
  process.env.PIXERO_AD_ACCOUNT_ID ?? "act_848168424406226";

interface Canvas {
  id: string;
  name: string;
  created_at?: string;
}

export interface MetaPublishResult {
  canvasId: string;
  staging: string;
  publish: string;
  adAccountId: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Stages a Meta launch plan for the current campaign via Pixero's agent, then
 * publishes it (Meta creates the campaign PAUSED — activating spend is a
 * separate, explicit step).
 */
export async function publishCampaignToMeta(): Promise<MetaPublishResult> {
  const [bakery, campaign] = await Promise.all([getBakery(), getCampaign()]);
  if (!bakery || !campaign) {
    throw new Error("Set up the bakery and generate a campaign first.");
  }

  return withPixeroMcp(async (client) => {
    const listCanvases = async (): Promise<Canvas[]> => {
      const raw = toolResultText(
        await client.callTool({ name: "list_canvases", arguments: {} })
      );
      return (JSON.parse(raw) as { canvases?: Canvas[] }).canvases ?? [];
    };

    const before = await listCanvases();
    const nameMatch = (c: Canvas) =>
      c.name.toLowerCase().includes(bakery.name.toLowerCase()) ||
      c.name.toLowerCase().includes("bakery");
    let canvas = before.find(nameMatch) ?? null;

    const publishPlan = async (canvasId: string) =>
      toolResultText(
        await client.callTool({
          name: "meta_launch_action",
          arguments: {
            canvasId,
            action: "publish",
            adAccountId: PIXERO_AD_ACCOUNT_ID,
            confirm: true,
          },
        })
      );

    // A plan may already be staged (e.g. a previous attempt timed out after
    // staging finished) — publish it directly instead of staging again. Skip
    // plans that were already published to avoid duplicate Meta campaigns.
    if (canvas) {
      const status = toolResultText(
        await client.callTool({
          name: "meta_launch_action",
          arguments: { canvasId: canvas.id, action: "status" },
        })
      );
      if (!/request failed|no launch plan/i.test(status)) {
        if (/published|campaign.?id/i.test(status)) {
          return {
            canvasId: canvas.id,
            staging: "Launch plan already published — nothing to do.",
            publish: status.slice(0, 1500),
            adAccountId: PIXERO_AD_ACCOUNT_ID,
          };
        }
        const publish = await publishPlan(canvas.id);
        return {
          canvasId: canvas.id,
          staging: "Reused the launch plan already staged on the canvas.",
          publish: publish.slice(0, 1500),
          adAccountId: PIXERO_AD_ACCOUNT_ID,
        };
      }
    }

    const brief = `Lead-generation Meta campaign for ${bakery.name} (${bakery.location}), a bakery selling ${bakery.cakeTypes.join(", ")} at $${bakery.priceMin}–$${bakery.priceMax}. Ad copy — headline: "${campaign.headline}" body: "${campaign.body}" CTA: "${campaign.cta}". Target audience: ${campaign.audience}. Daily budget: $${campaign.dailyBudget}. Objective: lead form submissions (name + phone).`;

    // A delegated task session cannot access pre-existing briefs, and it won't
    // stage a plan without an approved creative — so it must create its own
    // brief and generate the creative itself.
    const instruction = `Create a NEW brief in this conversation named "${bakery.name} — SweetLeads Launch" and stage a Meta launch plan on it. Generate ONE static image ad creative (appetizing custom-cake photo style, headline text baked in, Meta-safe centered layout), approve it, and use it in the plan. Do not ask for confirmation. STAGE ONLY — do NOT publish, do NOT activate, do NOT spend. ${brief}`;

    const started = JSON.parse(
      toolResultText(
        await client.callTool({
          name: "run_pixero_task",
          arguments: { instruction },
        })
      )
    ) as { threadId: string; runId: string };

    let staging = "";
    const deadline = Date.now() + 210_000;
    for (;;) {
      if (Date.now() > deadline) {
        throw new Error(
          "Pixero is still staging the launch plan — try Publish again in a minute."
        );
      }
      await sleep(5000);
      const status = JSON.parse(
        toolResultText(
          await client.callTool({
            name: "get_task_status",
            arguments: { threadId: started.threadId, runId: started.runId },
          })
        )
      ) as { status: string; finalMessage?: string; error?: string };
      if (status.status === "success") {
        staging = status.finalMessage ?? "";
        break;
      }
      if (/error|failed/i.test(status.status)) {
        throw new Error(`Pixero staging failed: ${status.error ?? status.status}`);
      }
    }

    // The agent staged on a brief it created — find it by diffing the list.
    const after = await listCanvases();
    const beforeIds = new Set(before.map((c) => c.id));
    canvas =
      after.find((c) => !beforeIds.has(c.id) && nameMatch(c)) ??
      after.find((c) => !beforeIds.has(c.id)) ??
      null;
    if (!canvas) throw new Error("Staging finished but no new canvas was found.");

    const publish = await publishPlan(canvas.id);

    return {
      canvasId: canvas.id,
      staging: staging.slice(0, 1500),
      publish: publish.slice(0, 1500),
      adAccountId: PIXERO_AD_ACCOUNT_ID,
    };
  });
}
