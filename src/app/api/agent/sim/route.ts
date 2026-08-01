import { runAll } from "@/lib/agent/sim";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Runs the golden scenarios against the live agent. Development only — it
 * writes real leads and orders (then removes them), so it must not be
 * reachable in production.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "not available in production" }, { status: 404 });
  }

  const keep = new URL(req.url).searchParams.get("keep") === "1";
  const summary = await runAll({ keep });

  return Response.json(summary, { status: summary.failed ? 500 : 200 });
}
