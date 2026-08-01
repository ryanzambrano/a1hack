import { briefFromText, describeDesign, loadArchive, selectOptions } from "@/lib/archive/retrieval";

export const dynamic = "force-dynamic";

/**
 * Read-only design search.
 *
 * The dashboard used to call the agent's `find_designs` tool directly, which
 * was wrong twice over: that tool writes a proposal row and fires a text
 * message, so browsing the archive littered the database and burned SMS
 * sends. This runs the same retrieval and returns the same designs, with no
 * side effects and one round trip instead of two.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    query?: string;
    guests?: number;
    limit?: number;
  };

  const started = performance.now();
  const archive = await loadArchive();
  const guests = Number.isFinite(body.guests) ? Number(body.guests) : null;

  const brief = briefFromText(body.query ?? "", archive, { guests });
  const { options } = selectOptions(archive, brief, Math.min(8, Math.max(1, body.limit ?? 4)));

  return Response.json({
    matched: brief.themes,
    searched: archive.length,
    tookMs: Math.round(performance.now() - started),
    options: options.map((o, i) => ({
      number: i + 1,
      title: o.cake.title,
      description: describeDesign(o.cake, guests ?? o.cake.servings),
      photoUrl: o.cake.photo_url || `/api/archive/photo/${o.cake.id}`,
      madeOn: o.cake.made_on,
      reasons: o.reasons,
      hasNameText: o.cake.has_name_text,
    })),
  });
}
