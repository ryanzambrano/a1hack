import { NextResponse } from "next/server";

import { getMetaCampaigns } from "@/lib/server/pixero-mcp";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The ads and campaigns visible through the workspace's Pixero connection. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const campaigns = await getMetaCampaigns();
    return NextResponse.json({ campaigns });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pixero MCP failed" },
      { status: 502 }
    );
  }
}
