/**
 * The single entry point for "what should this cake cost?".
 *
 * Two methods sit underneath: comparable past cakes, and a pricing formula
 * fitted from whatever has been priced by hand. Which one leads is not a
 * matter of taste — `backtest.ts` measures both against the bakery's own
 * history, and `ARCHIVE_PRICING_POLICY` selects the winner.
 *
 * The default is "auto": prefer comparables when there are enough close ones,
 * otherwise the model. That is the safe default for a bakery whose pricing has
 * per-cake judgment in it that no smooth formula will capture. Run the
 * backtest for a given archive and set the policy from the result.
 *
 * The fitted model is cached with the archive, because refitting on every turn
 * of a live phone call would be silly.
 */

import { type CompsEstimate, estimateFromComps } from "./comps";
import { type CostModel, fitCostModel, labeledFrom, predictCents, predictHours } from "./costmodel";
import { type ArchiveCake, loadArchive } from "./retrieval";
import { speakMoney } from "@/lib/agent/speech";

export type PricingPolicy = "auto" | "comps" | "model" | "average";

export function configuredPolicy(): PricingPolicy {
  const raw = (process.env.ARCHIVE_PRICING_POLICY ?? "auto").toLowerCase();
  return (["auto", "comps", "model", "average"] as const).includes(raw as PricingPolicy)
    ? (raw as PricingPolicy)
    : "auto";
}

let modelCache: { model: CostModel | null; signature: string } | null = null;

/** Refit only when the labelled set actually changes. */
function cachedModel(archive: ArchiveCake[]): CostModel | null {
  const labelled = labeledFrom(archive);
  const signature = `${labelled.length}:${labelled.reduce((s, c) => s + c.id + c.priceCents, 0)}`;
  if (modelCache?.signature === signature) return modelCache.model;
  const model = fitCostModel(labelled);
  modelCache = { model, signature };
  return model;
}

export function invalidatePricingModel(): void {
  modelCache = null;
}

export interface PriceEstimate extends CompsEstimate {
  /** Which method produced the number the agent will say. */
  method: "comps" | "model" | "average" | "none";
  modelHours: number | null;
}

export interface EstimateTarget {
  themes: string[];
  colors: string[];
  techniques: string[];
  occasion: string | null;
  servings: number | null;
  tiers: number;
}

/**
 * Widen a point prediction into a band. A custom cake quoted to the dollar on
 * a first call is how bakeries lose money on their own quotes, and a fitted
 * model deserves a wider band than real comparables do.
 */
function bandAround(cents: number, spread: number): { low: number; high: number } {
  const round = (v: number) => Math.round(v / 500) * 500;
  return { low: round(cents * (1 - spread)), high: round(cents * (1 + spread)) };
}

export async function estimatePrice(
  target: EstimateTarget,
  archive?: ArchiveCake[]
): Promise<PriceEstimate> {
  const cakes = archive ?? (await loadArchive());
  const comps = estimateFromComps(target, cakes);
  const model = cachedModel(cakes);

  const modelCents =
    model && target.servings
      ? predictCents(model, {
          servings: target.servings,
          tiers: target.tiers,
          techniques: target.techniques,
        })
      : null;
  const modelHours =
    model && target.servings
      ? predictHours(model, {
          servings: target.servings,
          tiers: target.tiers,
          techniques: target.techniques,
        })
      : null;

  const policy = configuredPolicy();
  const compsUsable = comps.ok && comps.confidence !== "low";

  let method: PriceEstimate["method"] = "none";
  if (policy === "comps") method = comps.ok ? "comps" : modelCents ? "model" : "none";
  else if (policy === "model") method = modelCents ? "model" : comps.ok ? "comps" : "none";
  else if (policy === "average") {
    method = comps.ok && modelCents ? "average" : comps.ok ? "comps" : modelCents ? "model" : "none";
  } else {
    method = compsUsable ? "comps" : modelCents ? "model" : comps.ok ? "comps" : "none";
  }

  if (method === "comps") {
    return { ...comps, method: "comps", modelHours: modelHours ?? comps.hoursLow };
  }

  if (method === "none") {
    return {
      ...comps,
      method: "none",
      modelHours: null,
      needsKitchenReview: true,
      rationale:
        comps.rationale ||
        "Nothing comparable and no fitted pricing model yet — this one needs the kitchen to price.",
    };
  }

  const point =
    method === "average" && modelCents && comps.ok
      ? Math.round((modelCents + comps.midCents) / 2)
      : (modelCents as number);

  // A formula-only estimate is a wider band than one backed by real sales, and
  // it says so out loud in the rationale rather than pretending otherwise.
  const spread = method === "average" ? 0.12 : 0.18;
  const { low, high } = bandAround(point, spread);

  return {
    ...comps,
    ok: true,
    method,
    lowCents: low,
    midCents: point,
    highCents: high,
    hoursLow: modelHours,
    hoursHigh: modelHours,
    modelHours,
    // A model fit on few examples is not something to quote confidently.
    confidence: model && model.n >= 25 ? "medium" : "low",
    needsKitchenReview: !model || model.n < 25,
    rationale:
      method === "average"
        ? `Comparables and the fitted pricing model agree on roughly ${speakMoney(point)} (model trained on ${model?.n ?? 0} priced cakes).`
        : `No close comparables, so this is the fitted pricing model (trained on ${model?.n ?? 0} priced cakes): about ${speakMoney(point)}${
            modelHours ? `, roughly ${modelHours} hours` : ""
          }.`,
  };
}
