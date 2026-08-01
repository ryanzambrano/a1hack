import { getProposal } from "@/lib/archive/proposals";

export const dynamic = "force-dynamic";

/**
 * A proposal as JSON. The caller-facing page renders server-side, so this
 * exists for anything that needs the same data client-side — the archive
 * dashboard, and any later "did they open it?" tooling.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/proposals/[code]">) {
  const { code } = await ctx.params;
  const proposal = await getProposal(code);
  if (!proposal) return Response.json({ error: "No such proposal" }, { status: 404 });
  return Response.json(proposal);
}
