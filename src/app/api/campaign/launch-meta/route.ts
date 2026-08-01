import { NextResponse } from "next/server";

import { publishCampaignToMeta } from "@/lib/server/pixero-launch";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// Staging the launch plan via Pixero's agent takes a few minutes.
export const maxDuration = 300;

/** Stages + publishes the current campaign to Meta via Pixero (created PAUSED). */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await publishCampaignToMeta();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publish failed" },
      { status: 502 }
    );
  }
}
