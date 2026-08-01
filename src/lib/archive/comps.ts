/**
 * Pricing a custom cake from comparable past work.
 *
 * Sweet Lady Jane's objection to AI quoting was specific and correct:
 *
 *   "The actual judgment call of how much something will cost in terms of
 *    hours and money, that's where they fail."
 *
 * So the agent does not judge. It looks up the closest cakes the bakery has
 * actually made and reads off what those took — the way an appraiser prices a
 * house from comps rather than from first principles. Their custom-cake
 * person already does this implicitly; this makes it explicit and fast.
 *
 * The honest part is the confidence score. Few comparables, or comparables
 * that disagree with each other, means the estimate is weak and a human has
 * to price it. That reproduces the split Sweet Lady Jane already runs, where
 * roughly 70% is quoted by the custom-cake person and the complicated 30%
 * goes to the kitchen to confirm.
 *
 * A band is returned, never a single number. Quoting a custom cake to the
 * dollar on a first call is how bakeries lose money on their own quotes.
 */

import { type ArchiveCake, type DesignBrief, scaledPriceCents, scoreDesign } from "./retrieval";

export interface Comparable {
  id: number;
  title: string;
  priceCents: number;
  laborHours: number | null;
  servings: number | null;
  /** The comparable's price scaled to the size being quoted. */
  adjustedCents: number;
  similarity: number;
  /** False for seeded demo data, which must not masquerade as real history. */
  real: boolean;
}

export type Confidence = "high" | "medium" | "low";

export interface CompsEstimate {
  ok: boolean;
  lowCents: number;
  highCents: number;
  midCents: number;
  hoursLow: number | null;
  hoursHigh: number | null;
  confidence: Confidence;
  comparables: Comparable[];
  realComparables: number;
  seedComparables: number;
  /** Plain-language explanation for whoever approves the quote. */
  rationale: string;
  /** True when the agent must not commit to a price on the call. */
  needsKitchenReview: boolean;
}

const MAX_COMPS = 8;

function weightedPercentile(
  sorted: Array<{ value: number; weight: number }>,
  fraction: number
): number {
  const total = sorted.reduce((s, x) => s + x.weight, 0);
  if (!total) return sorted.length ? sorted[0].value : 0;
  let seen = 0;
  for (const item of sorted) {
    seen += item.weight;
    if (seen >= total * fraction) return item.value;
  }
  return sorted[sorted.length - 1].value;
}

const roundTo = (cents: number, step = 500) => Math.round(cents / step) * step;

export interface CompsTarget {
  themes: string[];
  colors: string[];
  techniques: string[];
  occasion: string | null;
  servings: number | null;
}

export function estimateFromComps(
  target: CompsTarget,
  archive: ArchiveCake[]
): CompsEstimate {
  // Similarity is measured without any budget term — the budget is what is
  // being computed, so letting it influence the match would be circular.
  const brief: DesignBrief = {
    text: "",
    themes: target.themes,
    colors: target.colors,
    techniques: target.techniques,
    occasion: target.occasion,
    guests: null,
    budgetCents: null,
  };

  const priced = archive.filter((c) => c.price_cents !== null && c.price_cents > 0);
  const scored = priced
    .map((cake) => scoreDesign(cake, brief))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_COMPS);

  const empty: CompsEstimate = {
    ok: false,
    lowCents: 0,
    highCents: 0,
    midCents: 0,
    hoursLow: null,
    hoursHigh: null,
    confidence: "low",
    comparables: [],
    realComparables: 0,
    seedComparables: 0,
    rationale: "Nothing comparable in the archive — this one needs the kitchen to price.",
    needsKitchenReview: true,
  };
  if (!scored.length) return empty;

  const servings = target.servings ?? null;
  const comparables: Comparable[] = scored.map(({ cake, score }) => ({
    id: cake.id,
    title: cake.title,
    priceCents: cake.price_cents as number,
    laborHours: cake.labor_hours === null ? null : Number(cake.labor_hours),
    servings: cake.servings,
    adjustedCents: scaledPriceCents(cake, servings) as number,
    similarity: Math.round(score),
    real: cake.source !== "seed",
  }));

  const byPrice = [...comparables]
    .map((c) => ({ value: c.adjustedCents, weight: Math.max(1, c.similarity) }))
    .sort((a, b) => a.value - b.value);

  const low = roundTo(weightedPercentile(byPrice, 0.25));
  const mid = roundTo(weightedPercentile(byPrice, 0.5));
  const high = roundTo(weightedPercentile(byPrice, 0.75));

  const hours = comparables
    .map((c) => c.laborHours)
    .filter((h): h is number => h !== null)
    .sort((a, b) => a - b);

  // Spread is the honest signal: comparables that disagree mean the archive
  // does not actually know what this costs.
  const spread = mid > 0 ? (high - low) / mid : 1;
  const topSimilarity = comparables[0]?.similarity ?? 0;

  let confidence: Confidence = "low";
  if (comparables.length >= 5 && spread <= 0.3 && topSimilarity >= 55) confidence = "high";
  else if (comparables.length >= 3 && spread <= 0.55 && topSimilarity >= 35) confidence = "medium";

  const realComparables = comparables.filter((c) => c.real).length;
  const seedComparables = comparables.length - realComparables;
  const descriptor = [target.themes[0], target.techniques[0]].filter(Boolean).join(", ");

  return {
    ok: true,
    lowCents: low,
    highCents: Math.max(high, low),
    midCents: mid,
    hoursLow: hours.length ? hours[0] : null,
    hoursHigh: hours.length ? hours[hours.length - 1] : null,
    confidence,
    comparables,
    realComparables,
    seedComparables,
    needsKitchenReview: confidence === "low",
    rationale:
      `Closest to ${comparables.length} past cake${comparables.length === 1 ? "" : "s"}` +
      `${descriptor ? ` (${descriptor})` : ""}` +
      `${servings ? `, scaled to ${servings} servings` : ""}. ` +
      `They sold for $${(low / 100).toFixed(0)}-$${(high / 100).toFixed(0)}` +
      `${hours.length ? ` and took ${hours[0]}-${hours[hours.length - 1]} hours` : ""}. ` +
      `Confidence ${confidence}` +
      (seedComparables ? ` (${seedComparables} of these are seeded demo data).` : "."),
  };
}

/* ------------------------------- feasibility ------------------------------- */

const COATINGS = ["fondant", "buttercream", "whipped cream"];

/**
 * Combinations the kitchen cannot actually make. Straight from Sweet Lady
 * Jane: "you can't put fondant on buttercream, you can't put buttercream on
 * whipped cream". Callers ask for impossible cakes routinely, and catching it
 * in code costs nothing and saves an embarrassing walk-back later.
 */
export function checkFeasible(techniques: string[]): { ok: boolean; reason?: string } {
  const coatings = techniques.filter((t) => COATINGS.includes(t));
  if (coatings.length > 1) {
    return {
      ok: false,
      reason: `${coatings.join(" and ")} cannot go on the same cake — one coating only.`,
    };
  }
  if (techniques.includes("sculpted") && coatings[0] === "whipped cream") {
    return { ok: false, reason: "Sculpted work will not hold on whipped cream." };
  }
  if (techniques.includes("fresh flowers") && coatings[0] === "fondant" && techniques.includes("drip")) {
    return { ok: false, reason: "A drip finish does not work over fondant with fresh flowers." };
  }
  return { ok: true };
}
