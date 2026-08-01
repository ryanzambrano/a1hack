import {
  SIZE_SERVINGS,
  deliveryFor,
  fitDeliveryModel,
  loadBenchmark,
  marketBands,
} from "@/lib/pricing/benchmark";

export const dynamic = "force-dynamic";

/** The network price benchmark, parsed from PRICING.md at request time. */
export async function GET() {
  const benchmark = await loadBenchmark();
  const active = benchmark.bakeries.filter((b) => b.status === "active");
  const delivery = fitDeliveryModel(benchmark);

  const byCountry = new Map<string, { bakeries: number; prices: number[] }>();
  for (const b of active) {
    const entry = byCountry.get(b.country) ?? { bakeries: 0, prices: [] };
    entry.bakeries += 1;
    if (b.usd8in) entry.prices.push(b.usd8in);
    byCountry.set(b.country, entry);
  }

  return Response.json({
    snapshot: benchmark.snapshot,
    totals: {
      bakeries: benchmark.bakeries.length,
      active: active.length,
      countries: byCountry.size,
      zones: benchmark.zones.length,
      currencies: new Set(active.map((b) => b.currency)).size,
    },
    bands: marketBands(benchmark).map((b) => ({
      ...b,
      feeds: `${SIZE_SERVINGS[b.size].min}–${SIZE_SERVINGS[b.size].max}`,
    })),
    countries: [...byCountry.entries()]
      .map(([code, v]) => ({
        code,
        bakeries: v.bakeries,
        median8in: v.prices.length
          ? [...v.prices].sort((a, b) => a - b)[Math.floor(v.prices.length / 2)]
          : null,
      }))
      .sort((a, b) => b.bakeries - a.bakeries),
    delivery: {
      ...delivery,
      // The ladder the network actually charges, rendered as rings.
      ladder: Array.from({ length: 6 }, (_, i) =>
        deliveryFor(delivery, (i + 1) * delivery.ringKm)
      ),
    },
  });
}
