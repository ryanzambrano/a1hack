import { NextResponse } from "next/server";

import { listPixeroTools } from "@/lib/server/pixero-mcp";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Lists the Pixero MCP tools available to the workspace connection. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const tools = await listPixeroTools();
    return NextResponse.json({ tools });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pixero MCP failed" },
      { status: 502 }
    );
  }
}
