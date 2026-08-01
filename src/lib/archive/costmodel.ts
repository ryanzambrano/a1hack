/**
 * A bakery's pricing formula, learned from a handful of examples.
 *
 * WHY THIS EXISTS, AND NOT JUST COMPS
 *
 * Comparables work when the archive has prices. A real archive arrives as a
 * folder of photographs with no price and no size attached — so on day one
 * there is nothing to compare against, and asking a bakery to price two
 * thousand old cakes is not a thing anyone will do.
 *
 * What they will do is price about thirty. That is too sparse for
 * nearest-neighbour lookup, but it is plenty to fit a formula — because we are
 * not guessing at the shape of the formula. Sweet Lady Jane described it
 * outright: a standardised cost by size and tier, plus chef hours for the
 * decoration work, plus accessories. We are only fitting the coefficients of a
 * structure the trade already uses.
 *
 * The fit is on log(price), so premiums come out multiplicative — "fondant is
 * about 23% more", "sculpted work adds about 80%" — which is how bakers
 * actually talk about their own pricing, and which keeps every prediction
 * positive. Ridge regularisation keeps a coefficient from running away when a
 * technique only appears twice in the calibration set.
 *
 * The model is a fallback, never a replacement: `estimate()` prefers real
 * comparables when enough close ones exist, because a price the bakery
 * actually charged beats a price a regression inferred.
 */

import { COATINGS, type ArchiveCake } from "./retrieval";

export interface LabeledCake {
  id: number;
  servings: number;
  tiers: number;
  techniques: string[];
  priceCents: number;
  laborHours: number | null;
}

export interface CostModel {
  /** Index-aligned with `coefficients`; index 0 is the intercept. */
  features: string[];
  coefficients: number[];
  /** Means of the centred continuous features, needed at prediction time. */
  centers: { lnServings: number; tiers: number };
  baselineCoating: string;
  n: number;
  lambda: number;
  /** Same design matrix, fitted against log(hours). Null if hours are absent. */
  hourCoefficients: number[] | null;
  /** Human-readable premiums, for the bakery to sanity-check their own model. */
  explain: Array<{ feature: string; effect: string }>;
}

/** A technique seen once is noise, not a premium. */
const MIN_OCCURRENCES = 2;
const DEFAULT_LAMBDA = 1.0;

/* ---------------------------- linear algebra ------------------------------ */

/** Solve Ax = b by Gauss-Jordan with partial pivoting. Null if singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];

    const d = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= d;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/** Ridge on every coefficient except the intercept. */
function ridgeFit(X: number[][], y: number[], lambda: number): number[] | null {
  const p = X[0].length;
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);

  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  // Penalising the intercept would drag every prediction toward zero.
  for (let a = 1; a < p; a++) XtX[a][a] += lambda;

  return solve(XtX, Xty);
}

/* -------------------------------- features -------------------------------- */

function decorationsOf(techniques: string[]): string[] {
  return techniques.filter((t) => !COATINGS.includes(t));
}

function coatingOf(techniques: string[]): string | null {
  return techniques.find((t) => COATINGS.includes(t)) ?? null;
}

interface Design {
  servings: number;
  tiers: number;
  techniques: string[];
}

function rowFor(model: Pick<CostModel, "features" | "centers" | "baselineCoating">, d: Design): number[] {
  const coating = coatingOf(d.techniques);
  const decorations = new Set(decorationsOf(d.techniques));
  const lnServings = Math.log(Math.max(1, d.servings));

  return model.features.map((f) => {
    if (f === "(base)") return 1;
    if (f === "ln(servings)") return lnServings - model.centers.lnServings;
    if (f === "tiers") return d.tiers - model.centers.tiers;
    if (f.startsWith("coating:")) return coating === f.slice(8) ? 1 : 0;
    if (f.startsWith("decor:")) return decorations.has(f.slice(6)) ? 1 : 0;
    return 0;
  });
}

/* ---------------------------------- fit ----------------------------------- */

export function fitCostModel(
  labeled: LabeledCake[],
  { lambda = DEFAULT_LAMBDA }: { lambda?: number } = {}
): CostModel | null {
  const usable = labeled.filter((c) => c.priceCents > 0 && c.servings > 0);
  // Below this the fit is not a model, it is an opinion with arithmetic.
  if (usable.length < 6) return null;

  const coatingCounts = new Map<string, number>();
  const decorationCounts = new Map<string, number>();
  for (const c of usable) {
    const coating = coatingOf(c.techniques);
    if (coating) coatingCounts.set(coating, (coatingCounts.get(coating) ?? 0) + 1);
    for (const d of new Set(decorationsOf(c.techniques))) {
      decorationCounts.set(d, (decorationCounts.get(d) ?? 0) + 1);
    }
  }

  // The most common coating is the baseline; the others become premiums
  // relative to it, which is how a baker would describe them.
  const baselineCoating =
    [...coatingCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "buttercream";

  const features = [
    "(base)",
    "ln(servings)",
    "tiers",
    ...[...coatingCounts.entries()]
      .filter(([name, n]) => name !== baselineCoating && n >= MIN_OCCURRENCES)
      .map(([name]) => `coating:${name}`),
    ...[...decorationCounts.entries()]
      .filter(([, n]) => n >= MIN_OCCURRENCES)
      .map(([name]) => `decor:${name}`),
  ];

  const lnServingsValues = usable.map((c) => Math.log(Math.max(1, c.servings)));
  const centers = {
    lnServings: lnServingsValues.reduce((s, v) => s + v, 0) / usable.length,
    tiers: usable.reduce((s, c) => s + c.tiers, 0) / usable.length,
  };

  const skeleton = { features, centers, baselineCoating };
  const X = usable.map((c) => rowFor(skeleton, c));
  const yPrice = usable.map((c) => Math.log(c.priceCents));

  const coefficients = ridgeFit(X, yPrice, lambda);
  if (!coefficients) return null;

  const withHours = usable.filter((c) => c.laborHours && c.laborHours > 0);
  let hourCoefficients: number[] | null = null;
  if (withHours.length >= 6) {
    hourCoefficients = ridgeFit(
      withHours.map((c) => rowFor(skeleton, c)),
      withHours.map((c) => Math.log(c.laborHours as number)),
      lambda
    );
  }

  const explain = features.slice(1).map((f, i) => {
    const b = coefficients[i + 1];
    if (f === "ln(servings)") {
      return { feature: "size", effect: `elasticity ${b.toFixed(2)} per log serving` };
    }
    if (f === "tiers") {
      return { feature: "each extra tier", effect: `${((Math.exp(b) - 1) * 100).toFixed(0)}%` };
    }
    const label = f.replace(/^coating:|^decor:/, "");
    return { feature: label, effect: `${((Math.exp(b) - 1) * 100).toFixed(0)}%` };
  });

  return {
    features,
    coefficients,
    centers,
    baselineCoating,
    n: usable.length,
    lambda,
    hourCoefficients,
    explain,
  };
}

/* -------------------------------- predict --------------------------------- */

export function predictCents(model: CostModel, design: Design): number {
  const row = rowFor(model, design);
  const logPrice = row.reduce((s, v, i) => s + v * model.coefficients[i], 0);
  return Math.round(Math.exp(logPrice));
}

export function predictHours(model: CostModel, design: Design): number | null {
  if (!model.hourCoefficients) return null;
  const row = rowFor(model, design);
  const logHours = row.reduce((s, v, i) => s + v * model.hourCoefficients![i], 0);
  return Math.round(Math.exp(logHours) * 2) / 2;
}

/** Every archive row that carries enough history to train on. */
export function labeledFrom(archive: ArchiveCake[]): LabeledCake[] {
  return archive
    .filter((c) => c.price_cents !== null && c.price_cents > 0 && c.servings)
    .map((c) => ({
      id: c.id,
      servings: c.servings as number,
      tiers: c.tiers,
      techniques: c.techniques,
      priceCents: c.price_cents as number,
      laborHours: c.labor_hours === null ? null : Number(c.labor_hours),
    }));
}
