/**
 * Does the estimator actually work?
 *
 * Sweet Lady Jane told us plainly that he expects AI to fail at costing:
 * "the actual judgment call of how much something will cost in terms of hours
 * and money, that's where they fail." The only useful reply to that is a
 * number measured on his own history, not an argument.
 *
 * This holds out cakes the bakery has already priced, predicts them from the
 * rest, and reports the error. Three methods are measured separately so it is
 * clear which one is carrying the result:
 *
 *   comps   — nearest priced cakes (what the agent prefers)
 *   model   — the fitted pricing formula (the fallback when comps are thin)
 *   blended — comps when confident, model otherwise (what actually ships)
 *
 * The learning curve is the other half, and it is the number that matters for
 * a bakery handing us a folder of unpriced photographs: how many cakes do they
 * have to price by hand before the estimate is good enough? Measuring it beats
 * guessing, and it turns an open-ended data-entry ask into a specific one.
 */

import { estimateFromComps } from "./comps";
import { type CostModel, type LabeledCake, fitCostModel, labeledFrom, predictCents } from "./costmodel";
import type { ArchiveCake } from "./retrieval";

export interface MethodStats {
  /** Fraction of held-out cakes this method could price at all. */
  coverage: number;
  /** Mean absolute percentage error, over the cakes it priced. */
  mape: number;
  medianApe: number;
  within10: number;
  within15: number;
  within25: number;
  /** Positive means the method overprices on average. */
  bias: number;
  n: number;
}

export type Method = "comps" | "model" | "average";

export interface BacktestResult {
  labelled: number;
  comps: MethodStats;
  model: MethodStats;
  /** Mean of the two, when both produced a number. */
  average: MethodStats;
  /** What the estimator ships with today. */
  blended: MethodStats;
  /** Which method actually won, by MAPE over cakes it could price. */
  recommended: Method;
  /** Premiums the model learned, for the bakery to sanity-check. */
  modelExplain: CostModel["explain"];
  notes: string[];
}

function stats(errors: Array<{ predicted: number; actual: number }>, attempted: number): MethodStats {
  if (!errors.length) {
    return { coverage: 0, mape: 0, medianApe: 0, within10: 0, within15: 0, within25: 0, bias: 0, n: 0 };
  }
  const apes = errors.map((e) => Math.abs(e.predicted - e.actual) / e.actual).sort((a, b) => a - b);
  const signed = errors.map((e) => (e.predicted - e.actual) / e.actual);
  const share = (limit: number) => apes.filter((a) => a <= limit).length / apes.length;

  return {
    coverage: errors.length / Math.max(1, attempted),
    mape: apes.reduce((s, a) => s + a, 0) / apes.length,
    medianApe: apes[Math.floor(apes.length / 2)],
    within10: share(0.1),
    within15: share(0.15),
    within25: share(0.25),
    bias: signed.reduce((s, a) => s + a, 0) / signed.length,
    n: errors.length,
  };
}

/** Leave-one-out over every cake with a recorded price. */
export function backtest(archive: ArchiveCake[]): BacktestResult {
  const labelled = labeledFrom(archive);
  const notes: string[] = [];

  if (labelled.length < 12) {
    notes.push(
      `Only ${labelled.length} cakes carry a price — too few to measure anything. Price more of the calibration set first.`
    );
    const none = stats([], 0);
    return {
      labelled: labelled.length,
      comps: none,
      model: none,
      average: none,
      blended: none,
      recommended: "model",
      modelExplain: [],
      notes,
    };
  }

  const compErrors: Array<{ predicted: number; actual: number }> = [];
  const modelErrors: Array<{ predicted: number; actual: number }> = [];
  const averageErrors: Array<{ predicted: number; actual: number }> = [];
  const blendErrors: Array<{ predicted: number; actual: number }> = [];

  for (const held of labelled) {
    const trainArchive = archive.filter((c) => c.id !== held.id);
    const trainLabelled = labelled.filter((c) => c.id !== held.id);
    const source = archive.find((c) => c.id === held.id) as ArchiveCake;

    const comps = estimateFromComps(
      {
        themes: source.themes,
        colors: source.colors,
        techniques: source.techniques,
        occasion: source.occasion[0] ?? null,
        servings: held.servings,
      },
      trainArchive
    );

    const model = fitCostModel(trainLabelled);
    const modelPrediction = model
      ? predictCents(model, {
          servings: held.servings,
          tiers: held.tiers,
          techniques: held.techniques,
        })
      : null;

    if (comps.ok && comps.midCents > 0) {
      compErrors.push({ predicted: comps.midCents, actual: held.priceCents });
    }
    if (modelPrediction) {
      modelErrors.push({ predicted: modelPrediction, actual: held.priceCents });
    }

    if (comps.ok && comps.midCents > 0 && modelPrediction) {
      averageErrors.push({
        predicted: Math.round((comps.midCents + modelPrediction) / 2),
        actual: held.priceCents,
      });
    }

    // What ships today: trust real comparables when there are enough close
    // ones, otherwise fall back to the fitted formula.
    const useComps = comps.ok && comps.confidence !== "low";
    const blended = useComps ? comps.midCents : modelPrediction;
    if (blended) blendErrors.push({ predicted: blended, actual: held.priceCents });
  }

  const fullModel = fitCostModel(labelled);
  const n = labelled.length;

  if (compErrors.length < n * 0.6) {
    notes.push(
      `Comparables could only price ${compErrors.length} of ${n}. The archive is thin in places; the fitted model covers the rest.`
    );
  }

  const compStats = stats(compErrors, n);
  const modelStats = stats(modelErrors, n);
  const averageStats = stats(averageErrors, n);

  // Let the measurement pick, rather than assuming comparables always win.
  // A method that could only price a third of the archive is not a winner
  // however low its error on that third.
  const candidates: Array<[Method, MethodStats]> = [
    ["comps", compStats],
    ["model", modelStats],
    ["average", averageStats],
  ];
  const viable = candidates.filter(([, s]) => s.n > 0 && s.coverage >= 0.6);
  const recommended = (viable.length ? viable : candidates)
    .slice()
    .sort((a, b) => a[1].mape - b[1].mape)[0][0];

  if (recommended !== "comps" && compStats.n > 0) {
    notes.push(
      `Comparables are not the most accurate method here (${(compStats.mape * 100).toFixed(1)}% vs ${(
        (recommended === "model" ? modelStats : averageStats).mape * 100
      ).toFixed(1)}% for ${recommended}). Set the estimator policy to "${recommended}".`
    );
  }

  return {
    labelled: n,
    comps: compStats,
    model: modelStats,
    average: averageStats,
    blended: stats(blendErrors, n),
    recommended,
    modelExplain: fullModel?.explain ?? [],
    notes,
  };
}

/* ------------------------------ learning curve ----------------------------- */

export interface CurvePoint {
  trainSize: number;
  mape: number;
  within15: number;
  /** How many random splits were averaged. */
  trials: number;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * How accurate the fitted model is as a function of how many cakes were
 * priced by hand. This is the answer to "how much work is this going to be?"
 */
export function learningCurve(
  archive: ArchiveCake[],
  sizes = [10, 15, 20, 30, 40, 60],
  trials = 12
): CurvePoint[] {
  const labelled = labeledFrom(archive);
  const rnd = mulberry32(42);
  const points: CurvePoint[] = [];

  for (const size of sizes) {
    // Leave a meaningful test set behind.
    if (labelled.length < size + 10) continue;

    const apes: number[] = [];
    let ran = 0;
    for (let t = 0; t < trials; t++) {
      const order = shuffled(labelled, rnd);
      const train = order.slice(0, size);
      const test = order.slice(size);
      const model = fitCostModel(train);
      if (!model) continue;
      ran++;
      for (const held of test) {
        const predicted = predictCents(model, {
          servings: held.servings,
          tiers: held.tiers,
          techniques: held.techniques,
        });
        apes.push(Math.abs(predicted - held.priceCents) / held.priceCents);
      }
    }
    if (!apes.length) continue;

    points.push({
      trainSize: size,
      mape: apes.reduce((s, a) => s + a, 0) / apes.length,
      within15: apes.filter((a) => a <= 0.15).length / apes.length,
      trials: ran,
    });
  }

  return points;
}

/** Convenience for the route: both halves of the report in one call. */
export function fullReport(archive: ArchiveCake[]): {
  backtest: BacktestResult;
  curve: CurvePoint[];
  labelledFraction: number;
} {
  const labelled = labeledFrom(archive as ArchiveCake[]) as LabeledCake[];
  return {
    backtest: backtest(archive),
    curve: learningCurve(archive),
    labelledFraction: archive.length ? labelled.length / archive.length : 0,
  };
}
