import { NextResponse } from "next/server";

import { getBakery } from "@/lib/server/db";
import { getMetaCampaigns } from "@/lib/server/pixero-mcp";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Case-insensitive match on any word of the bakery name or its slug. */
function belongsToBakery(campaignName: string, bakeryName: string): boolean {
  const c = campaignName.toLowerCase();
  const slug = bakeryName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (c.includes(slug)) return true;
  const words = bakeryName.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  return words.length > 0 && words.every((w) => c.includes(w));
}

/**
 * Only this bakery's campaigns. The Pixero connection can see the whole ad
 * account, but a tenant's dashboard must never surface other campaigns.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const [campaigns, bakery] = await Promise.all([
      getMetaCampaigns(),
      getBakery(),
    ]);
    const scoped = bakery
      ? campaigns.filter((c: { name: string }) => belongsToBakery(c.name, bakery.name))
      : [];
    return NextResponse.json({ campaigns: scoped });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pixero MCP failed" },
      { status: 502 }
    );
  }
}
