import { publishCampaignToMeta } from "@/lib/server/pixero-launch";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// Autopilot builds strategy + creative and publishes — takes a few minutes.
export const maxDuration = 300;

/**
 * Launch = run Pixero's autopilot_launch_campaign end to end (strategy,
 * creative, publish). The Meta campaign is created PAUSED — no spend.
 * Resumable: retrying reuses the same idempotency key and picks up mid-build.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await publishCampaignToMeta();
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
