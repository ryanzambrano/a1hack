import { getBakery, getCampaign } from "@/lib/server/db";
import { pixeroTool } from "@/lib/server/pixero";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const AD_ACCOUNT =
  process.env.PIXERO_AD_ACCOUNT_ID ?? "act_848168424406226";

/**
 * Launch = hand the staged campaign to Pixero's agent to build creative and
 * publish into the connected Meta ad account. Returns ids to poll via GET.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

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

EXECUTE every step — do not plan, do not ask, do not stop early. The user gives EXPLICIT GO-AHEAD to publish (create the campaign PAUSED — no delivery, no spend). In order:
1. Create a NEW brief in this conversation for this campaign (a task session cannot access pre-existing briefs) and work out the strategy on it.
2. generate_image: ONE appetizing custom-cake static ad (4:5, headline text baked in, Meta-safe centered layout). Approve it.
3. IMMEDIATELY CALL stage_campaign_plan for this brief — do not pre-judge whether it will work, CALL IT. If it errors, retry once, then copy the EXACT error text.
4. If staged, IMMEDIATELY CALL execute_launch_plan targeting ad account ${AD_ACCOUNT}, paused. Explicit go-ahead is given. If it errors, copy the EXACT error text.
5. Final report MUST state: each call made, verbatim error text for any failure, and on success the Meta campaign id, ad account id, and status.`;

  try {
    const task = await pixeroTool<{ threadId: string; runId: string }>(
      "run_pixero_task",
      { instruction }
    );
    // Deliberately NOT marking the campaign active here — that happens only
    // after the stream verifies a deployed campaign (see launch/stream).
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
