/**
 * Everything the archive knows about itself, computed live.
 *
 * Deliberately derived from the database on every request rather than written
 * down anywhere: a dashboard of hardcoded numbers is a slide, and it goes
 * stale the moment anyone imports another folder. Every figure here can be
 * traced back to rows.
 */

import { loadArchive, vocabularyOf, COATINGS } from "@/lib/archive/retrieval";
import { labeledFrom } from "@/lib/archive/costmodel";

export const dynamic = "force-dynamic";

function tally(values: string[], limit: number): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

export async function GET() {
  const archive = await loadArchive();
  const real = archive.filter((c) => c.source !== "seed");
  const vocab = vocabularyOf(real);
  const labelled = labeledFrom(real);

  const photos = real.reduce((sum, c) => sum + (c.photos_represented ?? 1), 0);
  const dates = real.map((c) => c.made_on).filter((d): d is string => Boolean(d)).sort();

  const byYear = new Map<string, number>();
  for (const d of dates) {
    const year = d.slice(0, 4);
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }

  const decorations = real.flatMap((c) => c.techniques.filter((t) => !COATINGS.includes(t)));
  const coatings = real.flatMap((c) => c.techniques.filter((t) => COATINGS.includes(t)));

  return Response.json({
    pipeline: {
      photos,
      cakes: real.length,
      // Bursts of the same cake collapse to one design; this is the ratio.
      shotsPerCake: real.length ? photos / real.length : 0,
      captioned: real.filter((c) => c.themes.length > 0).length,
      withDate: dates.length,
    },
    span: {
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      years: dates.length ? Number(dates[dates.length - 1].slice(0, 4)) - Number(dates[0].slice(0, 4)) + 1 : 0,
    },
    vocabulary: {
      themes: vocab.themes.length,
      colors: vocab.colors.length,
      techniques: vocab.techniques.length,
    },
    topThemes: tally(real.flatMap((c) => c.themes), 14),
    occasions: tally(real.flatMap((c) => c.occasion), 6),
    decorations: tally(decorations, 8),
    coatings: tally(coatings, 3),
    shapes: tally(real.map((c) => c.shape ?? "unknown"), 5),
    byYear: [...byYear.entries()].sort().map(([year, count]) => ({ label: year, count })),
    privacy: {
      withCustomerName: real.filter((c) => c.has_name_text).length,
    },
    pricing: {
      priced: labelled.length,
      total: real.length,
      // With nothing priced the estimator refuses to quote, by design.
      quotingEnabled: labelled.length >= 12,
    },
  });
}
