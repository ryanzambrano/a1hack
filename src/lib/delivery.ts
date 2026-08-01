/**
 * The delivery zone, and what a delivery inside it costs.
 *
 * The bakery draws its own zone in /setup: how far it will drive, and what it
 * charges per mile once it does. Every consumer reads the same three answers
 * from here — the agent quoting a fee on a call, the order engine adding it to
 * a total, and the setup form showing the baker what a six-mile drop will cost
 * before they save.
 *
 * Deliberately pure and free of imports beyond the profile shape, so the
 * client form and the phone agent cannot drift apart on the arithmetic, and so
 * the rules can be tested without a database (see delivery.test.ts).
 */

import type { Bakery, DeliveryPricing } from "./types";

export interface DeliveryZone {
  /** How far from the shop they will drive, straight-line, like a map circle. */
  radiusMiles: number;
  pricing: DeliveryPricing;
  /** Charged per mile driven, when pricing is "per_mile". */
  perMileUsd: number;
  /** Added on top of the per-mile rate — the cost of getting a van moving. */
  baseFeeUsd: number;
  /** The single fee for the whole zone, when pricing is "flat". */
  flatFeeUsd: number;
  /** Order value below which they will not drive at all. 0 means no minimum. */
  minimumOrderUsd: number;
}

export function zoneFromProfile(b: Bakery): DeliveryZone {
  return {
    radiusMiles: b.deliveryRadiusMiles,
    pricing: b.deliveryPricing,
    perMileUsd: b.deliveryPerMileUsd,
    baseFeeUsd: b.deliveryBaseFeeUsd,
    flatFeeUsd: b.deliveryFeeUsd,
    minimumOrderUsd: b.deliveryMinimumUsd,
  };
}

/**
 * Straight-line miles under-count what a van actually drives — a river, a
 * one-way system or a freeway junction all add distance a compass does not
 * see. A bakery quoting "$2 a mile" means road miles, so the fee is computed
 * on an inflated figure while the ZONE is still measured straight-line,
 * because that is what the circle on the map means.
 *
 * 1.2 is the low end of the usual 1.2–1.4 planar-to-road ratio for US metros:
 * under-charging the bakery slightly is a smaller problem than a caller being
 * quoted more than the map they are looking at suggests.
 */
export const ROAD_FACTOR = 1.2;

/** Billable distance: straight-line miles, inflated to estimate road miles. */
export function roadMiles(straightLineMiles: number): number {
  return Math.round(straightLineMiles * ROAD_FACTOR * 10) / 10;
}

/**
 * Fees are rounded UP to the nearest fifty cents. Per-mile arithmetic lands on
 * figures like $12.63, which is both awkward to say out loud and awkward to
 * defend; rounding up keeps the bakery whole.
 */
function roundFee(cents: number): number {
  return Math.ceil(cents / 50) * 50;
}

export interface DeliveryQuote {
  /** True only when we will actually drive it for this order. */
  ok: boolean;
  /** Straight-line miles from the shop — what the radius is measured in. */
  miles: number;
  /** Billable miles: `miles` inflated by ROAD_FACTOR. */
  billableMiles: number;
  feeCents: number;
  outsideZone: boolean;
  belowMinimum: boolean;
  /** How much more they would have to order to reach the minimum. */
  shortfallCents: number;
  /** Why not, in words the agent can say as-is. Empty when ok. */
  reason: string;
}

/**
 * Price one delivery.
 *
 * `subtotalCents` is the cake total so far, used only for the minimum-order
 * check; pass null when nothing has been priced yet and the minimum is simply
 * not tested rather than failed.
 */
export function quoteDelivery(
  zone: DeliveryZone,
  miles: number,
  subtotalCents: number | null = null
): DeliveryQuote {
  const straight = Math.round(Math.max(0, miles) * 10) / 10;
  const billable = roadMiles(straight);

  const feeCents =
    zone.pricing === "free"
      ? 0
      : zone.pricing === "flat"
        ? Math.round(zone.flatFeeUsd * 100)
        : roundFee(Math.round((zone.baseFeeUsd + zone.perMileUsd * billable) * 100));

  const outsideZone = zone.radiusMiles > 0 && straight > zone.radiusMiles;
  const minimumCents = Math.round(zone.minimumOrderUsd * 100);
  const belowMinimum =
    minimumCents > 0 && subtotalCents !== null && subtotalCents < minimumCents;

  return {
    ok: !outsideZone && !belowMinimum,
    miles: straight,
    billableMiles: billable,
    feeCents,
    outsideZone,
    belowMinimum,
    shortfallCents: belowMinimum ? minimumCents - (subtotalCents ?? 0) : 0,
    reason: outsideZone
      ? `that is about ${straight} miles out and we only deliver within ${zone.radiusMiles}`
      : belowMinimum
        ? `we deliver on orders over $${zone.minimumOrderUsd}`
        : "",
  };
}

/** The zone in one sentence — briefed to the agent and shown in /setup. */
export function describeZone(zone: DeliveryZone): string {
  const cost =
    zone.pricing === "free"
      ? "free"
      : zone.pricing === "flat"
        ? `$${zone.flatFeeUsd} a delivery`
        : `$${zone.perMileUsd} per mile driven${
            zone.baseFeeUsd > 0 ? ` plus a $${zone.baseFeeUsd} call-out` : ""
          }`;
  const minimum =
    zone.minimumOrderUsd > 0 ? `, on orders over $${zone.minimumOrderUsd}` : "";
  return `Delivery goes out ${zone.radiusMiles} miles from the shop, ${cost}${minimum}.`;
}
