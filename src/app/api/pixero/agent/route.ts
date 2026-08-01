import { NextResponse } from "next/server";

import { runPixeroAgent } from "@/lib/server/pixero-agent";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// Video generation / campaign tasks can take a while.
export const maxDuration = 300;

/**
 * The site's Pixero agent: POST {"prompt": "..."} and the gateway LLM runs a
 * tool loop against Pixero's MCP endpoint using the workspace connection.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let prompt: string;
  try {
    const body = (await req.json()) as { prompt?: string };
    prompt = body.prompt?.trim() ?? "";
  } catch {
    prompt = "";
  }
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    const run = await runPixeroAgent(prompt);
    return NextResponse.json(run);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pixero agent failed" },
      { status: 502 }
    );
  }
}
