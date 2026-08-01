/**
 * Choosing which cakes to ask the bakery to price.
 *
 * An imported archive has no prices. Someone at the bakery has to supply them,
 * and how many we ask for is the whole adoption question — thirty is a
 * coffee's worth of work, three hundred is a project nobody will start.
 *
 * So the thirty have to be the right thirty. Picking at random over-samples
 * whatever the bakery makes most (nine variations of a birthday sponge) and
 * misses the sculpted, the four-tier and the hand-painted — exactly the cakes
 * whose premiums the pricing model most needs to learn. This selects for
 * spread instead: start from the most typical cake, then repeatedly add
 * whichever cake is least like everything chosen so far.
 *
 * `learningCurve` in backtest.ts is the other half — it says how many is
 * enough for this particular archive, so the ask is a specific number rather
 * than "as many as you can".
 */

import { COATINGS, type ArchiveCake } from "./retrieval";

/** Tag set used for similarity: design attributes, not size or price. */
function tagsOf(cake: ArchiveCake): Set<string> {
  return new Set([
    ...cake.themes.map((t) => `theme:${t}`),
    ...cake.techniques.map((t) => `${COATINGS.includes(t) ? "coating" : "decor"}:${t}`),
    ...cake.occasion.map((o) => `occasion:${o}`),
    `tiers:${cake.tiers}`,
  ]);
}

/** 0 = identical, 1 = nothing in common. */
function distance(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return 1 - shared / (a.size + b.size - shared);
}

export interface CalibrationPick {
  cake: ArchiveCake;
  /** Why it is on the list, for the covering email to the bakery. */
  reason: string;
}

export function selectCalibrationSet(archive: ArchiveCake[], count = 30): CalibrationPick[] {
  const candidates = archive.filter((c) => c.active && c.price_cents === null);
  if (!candidates.length) return [];

  const tags = new Map<number, Set<string>>(candidates.map((c) => [c.id, tagsOf(c)]));

  // Frequency of every tag, so "typical" and "unusual" mean something.
  const frequency = new Map<string, number>();
  for (const set of tags.values()) {
    for (const t of set) frequency.set(t, (frequency.get(t) ?? 0) + 1);
  }
  const typicality = (cake: ArchiveCake) => {
    const set = tags.get(cake.id) as Set<string>;
    if (!set.size) return 0;
    let total = 0;
    for (const t of set) total += frequency.get(t) ?? 0;
    return total / set.size;
  };

  // Anchor on the most representative cake: its price calibrates the base rate.
  const sorted = [...candidates].sort((a, b) => typicality(b) - typicality(a));
  const chosen: CalibrationPick[] = [
    { cake: sorted[0], reason: "most typical of the archive — sets the base rate" },
  ];
  const remaining = new Set(candidates.filter((c) => c.id !== sorted[0].id).map((c) => c.id));
  const byId = new Map(candidates.map((c) => [c.id, c]));

  while (chosen.length < count && remaining.size) {
    let best: { id: number; score: number } | null = null;

    for (const id of remaining) {
      const set = tags.get(id) as Set<string>;
      // Farthest-point: maximise the distance to the nearest already-chosen
      // cake, which fills the gaps rather than crowding one corner.
      let nearest = Infinity;
      for (const picked of chosen) {
        const d = distance(set, tags.get(picked.cake.id) as Set<string>);
        if (d < nearest) nearest = d;
      }
      if (!best || nearest > best.score) best = { id, score: nearest };
    }
    if (!best) break;

    remaining.delete(best.id);
    const cake = byId.get(best.id) as ArchiveCake;
    const unusual = [...(tags.get(best.id) as Set<string>)]
      .filter((t) => (frequency.get(t) ?? 0) <= Math.max(2, candidates.length * 0.06))
      .map((t) => t.split(":")[1]);

    chosen.push({
      cake,
      reason: unusual.length
        ? `covers ${unusual.slice(0, 3).join(", ")}, rare in the archive`
        : "fills a gap in the range already covered",
    });
  }

  return chosen;
}

/** How much of the design space the priced cakes actually cover. */
export function coverageReport(archive: ArchiveCake[]): {
  priced: number;
  total: number;
  uncoveredTechniques: string[];
  uncoveredThemes: string[];
} {
  const priced = archive.filter((c) => c.price_cents !== null);
  const covered = new Set(priced.flatMap((c) => [...c.techniques, ...c.themes]));

  const allTechniques = new Set(archive.flatMap((c) => c.techniques));
  const allThemes = new Set(archive.flatMap((c) => c.themes));

  return {
    priced: priced.length,
    total: archive.length,
    uncoveredTechniques: [...allTechniques].filter((t) => !covered.has(t)),
    uncoveredThemes: [...allThemes].filter((t) => !covered.has(t)),
  };
}
