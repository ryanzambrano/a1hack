/**
 * Finding past cakes that match what a caller is describing.
 *
 * The customer's own examples are tag lookups, not semantic search — Even
 * Dough asked for "she said rainbow, boom, send her seven rainbow cakes we
 * made". So matching is attribute-first over a vocabulary read out of the
 * archive itself, with a lexical pass for anything the tags miss. That keeps
 * a bad match explainable: every option carries the reasons it was chosen.
 *
 * The vocabulary is derived from the data rather than hardcoded, so importing
 * a real bakery's archive widens what the agent can understand without a code
 * change.
 *
 * Scale path: at a few hundred cakes, loading the archive and scoring in
 * memory is faster than round-tripping SQL, and it keeps the scoring readable.
 * Past ~10k, push the attribute filters into Postgres and add a caption
 * embedding to `archive_cakes.embedding` — `scoreDesign` already treats the
 * lexical term as one signal among several, so it becomes a blend rather than
 * a rewrite.
 */

import { adminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";

export type ArchiveCake = Tables<"archive_cakes">;

export interface DesignBrief {
  occasion: string | null;
  themes: string[];
  colors: string[];
  techniques: string[];
  guests: number | null;
  budgetCents: number | null;
  /** The caller's own words, kept for the lexical pass and for the record. */
  text: string;
}

export interface ScoredDesign {
  cake: ArchiveCake;
  score: number;
  /** Why this was shown. Surfaced to whoever approves the quote. */
  reasons: string[];
}

const CACHE_MS = 60_000;
let cache: { cakes: ArchiveCake[]; at: number } | null = null;

export function invalidateArchive(): void {
  cache = null;
}

export async function loadArchive(bakeryId = "default", now = Date.now()): Promise<ArchiveCake[]> {
  if (cache && now - cache.at < CACHE_MS) return cache.cakes;

  const { data, error } = await adminClient()
    .from("archive_cakes")
    .select("*")
    .eq("bakery_id", bakeryId)
    .eq("active", true);

  if (error) throw new Error(`loadArchive: ${error.message}`);
  cache = { cakes: data ?? [], at: now };
  return cache.cakes;
}

/* ------------------------------- vocabulary ------------------------------- */

export interface Vocabulary {
  themes: string[];
  colors: string[];
  techniques: string[];
  occasions: string[];
}

export function vocabularyOf(archive: ArchiveCake[]): Vocabulary {
  const collect = (get: (c: ArchiveCake) => string[]) =>
    [...new Set(archive.flatMap(get))].filter(Boolean).sort();
  return {
    themes: collect((c) => c.themes),
    colors: collect((c) => c.colors),
    techniques: collect((c) => c.techniques),
    occasions: collect((c) => c.occasion),
  };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const squash = (s: string) => s.replace(/[^a-z0-9]/g, "");

/**
 * Tolerant tag matching. Callers do not spell character names the way a
 * catalogue does: the archive holds "spider-man" and "paw patrol", and people
 * say "spiderman" and "pawpatrol". Plurals vary too ("bears" for "bear").
 * Missing those costs a whole retrieval, so both spacing and plural forms are
 * accepted.
 */
function mentions(haystack: string, term: string): boolean {
  const t = normalize(term);
  if (!t) return false;
  // \s* rather than \s+ so "spider man" also matches a spoken "spiderman".
  if (new RegExp(`\\b${t.replace(/\s+/g, "\\s*")}(?:s|es)?\\b`).test(haystack)) return true;
  // The other direction, guarded by length so short tags cannot match inside
  // unrelated words.
  const squashed = squash(t);
  return squashed.length >= 5 && squash(haystack).includes(squashed);
}

/**
 * Turn what the caller said into a brief, using the archive's own vocabulary.
 * Anything not recognised stays in `text` and is handled by the lexical pass.
 */
export function briefFromText(
  text: string,
  archive: ArchiveCake[],
  extras: { occasion?: string | null; guests?: number | null; budgetCents?: number | null } = {}
): DesignBrief {
  const haystack = normalize(text);
  const vocab = vocabularyOf(archive);

  return {
    text,
    themes: vocab.themes.filter((t) => mentions(haystack, t)),
    colors: vocab.colors.filter((c) => mentions(haystack, c)),
    techniques: vocab.techniques.filter((t) => mentions(haystack, t)),
    occasion:
      extras.occasion ?? vocab.occasions.find((o) => mentions(haystack, o)) ?? null,
    guests: extras.guests ?? null,
    budgetCents: extras.budgetCents ?? null,
  };
}

/* -------------------------------- scoring --------------------------------- */

const WEIGHTS = {
  theme: 50,
  occasion: 15,
  color: 8,
  technique: 10,
  servings: 15,
  budget: 12,
  lexical: 10,
};

export function scoreDesign(cake: ArchiveCake, brief: DesignBrief): ScoredDesign {
  let score = 0;
  const reasons: string[] = [];

  const themeHits = brief.themes.filter((t) => cake.themes.includes(t));
  if (themeHits.length) {
    score += WEIGHTS.theme * Math.min(1, themeHits.length / Math.max(1, brief.themes.length));
    reasons.push(`${themeHits.join(" and ")} theme`);
  }

  if (brief.occasion && cake.occasion.includes(brief.occasion)) {
    score += WEIGHTS.occasion;
    reasons.push(`made for a ${brief.occasion}`);
  }

  const colorHits = brief.colors.filter((c) => cake.colors.includes(c));
  if (colorHits.length) {
    score += Math.min(WEIGHTS.color * colorHits.length, WEIGHTS.color * 2);
    reasons.push(`${colorHits.join(" and ")}`);
  }

  const techHits = brief.techniques.filter((t) => cake.techniques.includes(t));
  if (techHits.length) {
    score += Math.min(WEIGHTS.technique * techHits.length, WEIGHTS.technique * 2);
    reasons.push(techHits.join(" and "));
  }

  // A design that cannot feed the party is the wrong design, however pretty.
  if (brief.guests && cake.servings) {
    if (cake.servings >= brief.guests) {
      const overshoot = cake.servings / brief.guests;
      score += WEIGHTS.servings * (overshoot <= 1.6 ? 1 : 0.5);
      reasons.push(`serves ${cake.servings}`);
    } else {
      score -= WEIGHTS.servings;
    }
  }

  if (brief.budgetCents && cake.price_cents) {
    const ratio = cake.price_cents / brief.budgetCents;
    // Comfortably inside budget scores best; far above is not excluded here
    // because one deliberate stretch option is chosen later.
    if (ratio <= 1) score += WEIGHTS.budget * (0.6 + 0.4 * ratio);
    else score += Math.max(0, WEIGHTS.budget * (1 - (ratio - 1)));
  }

  if (brief.text) {
    const words = new Set(normalize(brief.text).split(" ").filter((w) => w.length > 3));
    const target = normalize(`${cake.title} ${cake.spoken_description}`);
    const hits = [...words].filter((w) => target.includes(w)).length;
    if (hits) score += Math.min(WEIGHTS.lexical, hits * 3);
  }

  return { cake, score, reasons };
}

/* ------------------------------- selection -------------------------------- */

export const COATINGS = ["fondant", "buttercream", "whipped cream"];

/** Bigger cakes cost less per serving; a linear scale overprices them. */
export const SIZE_EXPONENT = 0.9;

/**
 * What a past cake would cost at the size being discussed.
 *
 * Everything that reasons about price — choosing options, flagging the
 * stretch option, the band shown on the page — must use this same number.
 * Mixing scaled and unscaled prices produces options labelled "above budget"
 * while displaying a price below it.
 */
export function scaledPriceCents(cake: ArchiveCake, servings: number | null): number | null {
  if (cake.price_cents === null) return null;
  if (!servings || !cake.servings) return cake.price_cents;
  return Math.round(cake.price_cents * Math.pow(servings / cake.servings, SIZE_EXPONENT));
}

/**
 * Two near-identical cakes are one option, not two.
 *
 * Size is deliberately not part of this. A design is size-independent — the
 * same rainbow drip cake can be made for twelve or for thirty — so offering
 * "the same cake, twice, in two sizes" wastes one of only four slots.
 */
function signature(cake: ArchiveCake): string {
  const coating = cake.techniques.find((t) => COATINGS.includes(t)) ?? "";
  const decorations = cake.techniques.filter((t) => !COATINGS.includes(t)).sort().join("+");
  return `${cake.themes[0] ?? ""}|${coating}|${decorations}`;
}

const DECORATION_PHRASES: Record<string, string> = {
  sculpted: "sculpted detail",
  "hand-painted": "hand-painted detail",
  drip: "a drip finish",
  "edible print": "an edible print",
  piping: "piped detail",
  "gold leaf": "gold leaf",
  "fresh flowers": "fresh flowers",
};

/**
 * Describe a design at the size actually being discussed.
 *
 * The stored description mentions the size the cake was originally made at,
 * which is not the size the caller wants. Saying "serving about 12" to
 * someone feeding thirty, next to a price computed for thirty, is the kind of
 * contradiction a caller notices immediately.
 */
export function describeDesign(cake: ArchiveCake, servings: number | null): string {
  const coating = cake.techniques.find((t) => COATINGS.includes(t));
  const decorations = cake.techniques.filter((t) => !COATINGS.includes(t));
  const theme = cake.themes[0] ?? "celebration";
  const size = servings ?? cake.servings;
  // Tier count belongs to the design and is visible in the photograph; the
  // serving count comes from the caller. Deriving tiers from servings tells
  // someone looking at a single-tier round cake that it is two-tier.
  const tierWord = ["", "single-tier", "two-tier", "three-tier", "four-tier"][
    Math.min(4, Math.max(1, cake.tiers))
  ];

  // These are spoken aloud, so a bare tag like "sculpted" has to become
  // something a person would actually say.
  const spoken = decorations.map((d) => DECORATION_PHRASES[d] ?? d);
  const noun = /cakes?$/.test(theme) ? theme : `${theme} cake`;
  const decor = spoken.length
    ? ` with ${
        spoken.length === 1
          ? spoken[0]
          : `${spoken.slice(0, -1).join(", ")} and ${spoken[spoken.length - 1]}`
      }`
    : "";

  return `A ${tierWord} ${coating ?? "buttercream"} ${noun}${decor}${
    size ? `, for about ${size}` : ""
  }.`;
}

export interface OptionSet {
  options: ScoredDesign[];
  /** The deliberate stretch option, if one was included. */
  aboveBudget: ScoredDesign | null;
}

/**
 * Pick what to show. Distinct designs, mostly inside budget, plus at most one
 * deliberately above it.
 *
 * Sweet Lady Jane's reason for the stretch option: a caller who says $200 and
 * wants a four-tier fondant cake is asking for a $2,000 cake, and the fix is
 * showing what each budget actually buys before a person spends an hour on
 * it. Seeing one step up is also how an undecided caller discovers what they
 * actually want.
 */
export function selectOptions(
  archive: ArchiveCake[],
  brief: DesignBrief,
  limit = 4
): OptionSet {
  const ranked = archive
    .map((c) => scoreDesign(c, brief))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const priceAt = (s: ScoredDesign) => scaledPriceCents(s.cake, brief.guests);

  const withinBudget = brief.budgetCents
    ? ranked.filter((s) => {
        const price = priceAt(s);
        return price === null || price <= brief.budgetCents! * 1.1;
      })
    : ranked;

  const chosen: ScoredDesign[] = [];
  const seen = new Set<string>();
  for (const candidate of withinBudget) {
    const sig = signature(candidate.cake);
    if (seen.has(sig)) continue;
    seen.add(sig);
    chosen.push(candidate);
    if (chosen.length >= limit - (brief.budgetCents ? 1 : 0)) break;
  }

  // Backfill from anything left if the archive was too thin to fill the set.
  if (chosen.length < limit - (brief.budgetCents ? 1 : 0)) {
    for (const candidate of withinBudget) {
      if (chosen.includes(candidate)) continue;
      chosen.push(candidate);
      if (chosen.length >= limit - (brief.budgetCents ? 1 : 0)) break;
    }
  }

  let aboveBudget: ScoredDesign | null = null;
  if (brief.budgetCents) {
    aboveBudget =
      ranked.find((s) => {
        const price = priceAt(s);
        return (
          price !== null &&
          price > brief.budgetCents! * 1.15 &&
          price <= brief.budgetCents! * 2.2 &&
          !seen.has(signature(s.cake))
        );
      }) ?? null;
    if (aboveBudget) chosen.push(aboveBudget);
  }

  return { options: chosen.slice(0, limit), aboveBudget };
}
