/**
 * The Daymaker network price benchmark, parsed from PRICING.md.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * PRICING.md is a snapshot of what 86 bakeries across ten countries actually
 * charge — per size, and per delivery ring. It is a *market* prior. It is not
 * this bakery's price list, and the agent must never quote a market median to
 * a caller as though the baker had agreed to it.
 *
 * Where it genuinely helps:
 *
 *   1. Cold start. Before a bakery has priced anything of their own, we can
 *      say where a cake of that size sits in the market — useful on the
 *      dashboard, and to sanity-check calibration input that looks wrong.
 *   2. Delivery, which we could not price at all. The network data shows a
 *      clean structure: equal-width rings with a constant per-ring increment.
 *   3. Turning the calibration ask from "fill in 30 blank prices" into
 *      "confirm or correct 30 suggested ones", which is a far smaller favour
 *      to ask of a busy bakery.
 *
 * The document is parsed at runtime rather than copied into code, so there is
 * one source of truth and editing the doc updates the app.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type SizeCode = "6in" | "8in" | "10in" | "12in" | "half_sheet" | "sheet";

export const SIZE_ORDER: SizeCode[] = ["6in", "8in", "10in", "12in", "half_sheet", "sheet"];

/** Servings each size feeds, from PRICING.md §2. Used to map our guest counts. */
export const SIZE_SERVINGS: Record<SizeCode, { label: string; min: number; max: number }> = {
  "6in": { label: '6" round', min: 6, max: 8 },
  "8in": { label: '8" round', min: 10, max: 14 },
  "10in": { label: '10" round', min: 18, max: 24 },
  "12in": { label: '12" round', min: 28, max: 40 },
  half_sheet: { label: "Half sheet", min: 41, max: 60 },
  sheet: { label: "Sheet", min: 61, max: 120 },
};

export interface BenchmarkBakery {
  name: string;
  country: string;
  currency: string;
  status: string;
  /** Local-currency units, not cents. Absent = size not offered. */
  prices: Partial<Record<SizeCode, number>>;
  usd8in: number | null;
  zones: number | null;
  feeLo: number | null;
  feeMed: number | null;
  feeHi: number | null;
}

export interface BenchmarkZone {
  bakery: string;
  country: string;
  /** As drawn, e.g. "Within 10 km" or "10–20 km". */
  zone: string;
  feeUsd: number | null;
  /** Outer edge in km, parsed out of the zone name where it says one. */
  outerKm: number | null;
}

export interface Benchmark {
  bakeries: BenchmarkBakery[];
  zones: BenchmarkZone[];
  /** The document's own per-size USD distribution for active bakeries. */
  bands: MarketBand[];
  snapshot: string | null;
}

/* --------------------------------- parsing -------------------------------- */

function cells(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Table rows only: skip the header and the |---|---| separator. */
function tableRows(section: string): string[][] {
  return section
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map(cells)
    .filter((c) => c.length > 2 && !/^-+:?$/.test(c[1] ?? ""))
    .slice(1);
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "Within 10 km" -> 10, "10–20 km" -> 20, "Zone 1" -> null. */
function outerKmOf(zoneName: string): number | null {
  const range = /(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*km/i.exec(zoneName);
  if (range) return Number(range[2]);
  const within = /(?:within|under|up to)\s*(\d+(?:\.\d+)?)\s*km/i.exec(zoneName);
  if (within) return Number(within[1]);
  const bare = /(\d+(?:\.\d+)?)\s*km/i.exec(zoneName);
  return bare ? Number(bare[1]) : null;
}

function sectionAfter(doc: string, heading: string): string {
  const start = doc.indexOf(heading);
  if (start === -1) return "";
  const rest = doc.slice(start + heading.length);
  const next = rest.indexOf("\n## ");
  return next === -1 ? rest : rest.slice(0, next);
}

export function parseBenchmark(doc: string): Benchmark {
  const snapshot = /\*\*Data snapshot:\*\*\s*([0-9-]+)/.exec(doc)?.[1] ?? null;

  const bakeries: BenchmarkBakery[] = tableRows(sectionAfter(doc, "## Appendix A"))
    .filter((c) => c.length >= 15 && c[0])
    .map((c) => {
      const prices: Partial<Record<SizeCode, number>> = {};
      SIZE_ORDER.forEach((size, i) => {
        const v = num(c[4 + i]);
        if (v !== null && v > 0) prices[size] = v;
      });
      return {
        name: c[0],
        country: c[1],
        currency: c[2],
        status: c[3],
        prices,
        usd8in: num(c[10]),
        zones: num(c[11]),
        feeLo: num(c[12]),
        feeMed: num(c[13]),
        feeHi: num(c[14]),
      };
    });

  const zones: BenchmarkZone[] = tableRows(sectionAfter(doc, "## Appendix B"))
    .filter((c) => c.length >= 6 && c[0])
    .map((c) => ({
      bakery: c[0],
      country: c[1],
      zone: c[3],
      feeUsd: num(c[5]),
      outerKm: outerKmOf(c[3] ?? ""),
    }));

  return { bakeries, zones, bands: parseBands(doc), snapshot };
}

/**
 * The "Active only (64)" table in §2 — the document's published per-size USD
 * distribution. Rows look like:
 *   | `6in` | 52 | $25.90 | $41.44 | $60.00 | $82.55 | $190.50 |
 */
function parseBands(doc: string): MarketBand[] {
  const start = doc.indexOf("**Active only");
  if (start === -1) return [];
  const section = doc.slice(start, start + 1200);

  const bands: MarketBand[] = [];
  for (const line of section.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const c = cells(line);
    const size = c[0]?.replace(/`/g, "").trim() as SizeCode;
    if (!SIZE_ORDER.includes(size)) continue;
    const [n, min, p25, median, p75, max] = c.slice(1, 7).map(num);
    if (n === null || median === null) continue;
    bands.push({
      size,
      label: SIZE_SERVINGS[size].label,
      n,
      min: min ?? 0,
      p25: p25 ?? 0,
      median,
      p75: p75 ?? 0,
      max: max ?? 0,
    });
  }
  return bands;
}

/* --------------------------------- loading -------------------------------- */

let cache: Benchmark | null = null;

export async function loadBenchmark(): Promise<Benchmark> {
  if (cache) return cache;
  // Read from the repo root. On Vercel this file needs to be traced into the
  // bundle (`outputFileTracingIncludes`) — locally it is simply there.
  const doc = await readFile(join(process.cwd(), "PRICING.md"), "utf8");
  cache = parseBenchmark(doc);
  return cache;
}

/* -------------------------------- analysis -------------------------------- */

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export interface MarketBand {
  size: SizeCode;
  label: string;
  n: number;
  p25: number;
  median: number;
  p75: number;
  min: number;
  max: number;
}

/**
 * What the network charges for a size, in USD.
 *
 * Read straight from the document's own published distribution ("Active only
 * (64)" in §2) rather than recomputed here. Deriving other sizes from each
 * bakery's size ladder compounds two approximations and lands a few dollars
 * away from the doc's figures — and a dashboard whose numbers disagree with
 * the reference it cites is worse than useless. Only the 8" column carries a
 * per-bakery USD conversion, so the doc is the authority for the rest.
 */
export function marketBands(benchmark: Benchmark): MarketBand[] {
  return benchmark.bands;
}

/** Smallest size in the network that feeds this many people. */
export function sizeForGuests(guests: number): SizeCode {
  return SIZE_ORDER.find((s) => SIZE_SERVINGS[s].max >= guests) ?? "sheet";
}

/* --------------------------------- delivery -------------------------------- */

export interface DeliveryModel {
  /** Median per-ring increment, USD. PRICING.md §3: "$2 to $20". */
  perRingUsd: number;
  /** Median ring width in km, from the zone names that state one. */
  ringKm: number;
  /** Furthest ring edge seen in the network. */
  maxKm: number;
  ringsObserved: number;
}

/**
 * Fit the network's delivery structure.
 *
 * PRICING.md §3 is explicit that fees resolve by point-in-polygon and not by
 * distance at price time — but the polygons are *drawn* as equal-width
 * concentric rings, and the fee ladder is a constant increment per ring. So
 * distance predicts the fee well even though distance is not what the
 * production code reads.
 */
export function fitDeliveryModel(benchmark: Benchmark): DeliveryModel {
  const byBakery = new Map<string, BenchmarkZone[]>();
  for (const z of benchmark.zones) {
    if (z.outerKm === null || z.feeUsd === null) continue;
    const list = byBakery.get(z.bakery) ?? [];
    list.push(z);
    byBakery.set(z.bakery, list);
  }

  const increments: number[] = [];
  const widths: number[] = [];
  let maxKm = 0;

  for (const zones of byBakery.values()) {
    const ordered = [...zones].sort((a, b) => (a.outerKm as number) - (b.outerKm as number));
    maxKm = Math.max(maxKm, ordered[ordered.length - 1].outerKm as number);
    for (let i = 1; i < ordered.length; i++) {
      const dFee = (ordered[i].feeUsd as number) - (ordered[i - 1].feeUsd as number);
      const dKm = (ordered[i].outerKm as number) - (ordered[i - 1].outerKm as number);
      if (dFee > 0) increments.push(dFee);
      if (dKm > 0) widths.push(dKm);
    }
    if (ordered.length === 1) widths.push(ordered[0].outerKm as number);
  }

  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? percentile(s, 0.5) : 0;
  };

  return {
    perRingUsd: Math.round((med(increments) || 8) * 100) / 100,
    ringKm: med(widths) || 5,
    maxKm: maxKm || 50,
    ringsObserved: increments.length,
  };
}

export interface DeliveryQuote {
  km: number;
  ring: number;
  feeUsd: number;
  outOfRange: boolean;
}

/** What the network would charge to deliver this far. */
export function deliveryFor(model: DeliveryModel, km: number): DeliveryQuote {
  const ring = Math.max(1, Math.ceil(km / model.ringKm));
  return {
    km,
    ring,
    feeUsd: Math.round(ring * model.perRingUsd * 100) / 100,
    outOfRange: km > model.maxKm,
  };
}
