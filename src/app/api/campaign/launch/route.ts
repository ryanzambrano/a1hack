import { getBakery, getCampaign, saveCampaign } from "@/lib/server/db";
import { pixeroTool } from "@/lib/server/pixero";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * Launch = hand the staged campaign to Pixero's agent to build creative and
 * publish into the connected Meta ad account. Returns ids to poll via GET.
 */
export async function POST() {
  const [bakery, campaign] = await Promise.all([getBakery(), getCampaign()]);
  if (!bakery || !campaign) {
    return Response.json(
      { error: "Set up the bakery and generate a campaign first." },
      { status: 400 }
    );
  }

  const instruction = `Build and publish a Meta lead-generation campaign for the brand "${bakery.name}" (${bakery.location}; ${bakery.cakeTypes.join(", ")} cakes; $${bakery.priceMin}–$${bakery.priceMax}; ${bakery.fulfillment.join(" and ")}; hours ${bakery.hours}).

Approved creative:
- Headline: ${campaign.headline}
- Primary text: ${campaign.body}
- CTA: ${campaign.cta} (lead form — collect name + phone)
- Targeting: ${campaign.audience}
- Budget: $${campaign.dailyBudget}/day

Generate an appetizing hero image for the ad, stage the launch plan, and PUBLISH it to the connected Meta ad account (create it paused — do not activate delivery). Finish with a short report: Meta campaign id, ad account id, and status.`;

  try {
    const task = await pixeroTool<{ threadId: string; runId: string }>(
      "run_pixero_task",
      { instruction }
    );
    await saveCampaign({ ...campaign, status: "active", launchedAt: Date.now() });
    return Response.json({ threadId: task.threadId, runId: task.runId });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}

/** Poll the Pixero deploy task: /api/campaign/launch?threadId=…&runId=… */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId");
  const runId = url.searchParams.get("runId");
  if (!threadId || !runId) {
    return Response.json({ error: "threadId and runId required" }, { status: 400 });
  }
  try {
    const status = await pixeroTool("get_task_status", { threadId, runId });
    return Response.json(status);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
