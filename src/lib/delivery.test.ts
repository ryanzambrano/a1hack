// The delivery zone rules. Pure arithmetic, so no database and no fixtures —
// run with `npm test`.
//
// Imports carry the .ts extension because Node runs this file directly with
// its built-in TypeScript stripping.

import { test } from "node:test";
import assert from "node:assert/strict";

import { type DeliveryZone, describeZone, quoteDelivery, roadMiles } from "./delivery.ts";

const PER_MILE: DeliveryZone = {
  radiusMiles: 10,
  pricing: "per_mile",
  perMileUsd: 2,
  baseFeeUsd: 5,
  flatFeeUsd: 0,
  minimumOrderUsd: 75,
};

const FLAT: DeliveryZone = { ...PER_MILE, pricing: "flat", flatFeeUsd: 20 };
const FREE: DeliveryZone = { ...PER_MILE, pricing: "free" };

test("per-mile fee is base plus rate times road miles, rounded up to 50c", () => {
  // 5 straight-line miles -> 6.0 road miles -> $5 + $12 = $17.
  const quote = quoteDelivery(PER_MILE, 5, 12_000);
  assert.equal(quote.ok, true);
  assert.equal(quote.billableMiles, 6);
  assert.equal(quote.feeCents, 1700);
});

test("an awkward per-mile figure rounds up rather than to a fraction of a cent", () => {
  // 3.7 straight-line -> 4.4 road -> $5 + $8.80 = $13.80 -> $14.
  const quote = quoteDelivery(PER_MILE, 3.7, 12_000);
  assert.equal(quote.feeCents, 1400);
});

test("the zone edge is measured straight-line, not on the inflated road miles", () => {
  // 10 miles is exactly the radius: inside, even though road miles are 12.
  const edge = quoteDelivery(PER_MILE, 10, 12_000);
  assert.equal(edge.ok, true);
  assert.equal(edge.outsideZone, false);

  const past = quoteDelivery(PER_MILE, 10.4, 12_000);
  assert.equal(past.ok, false);
  assert.equal(past.outsideZone, true);
  assert.match(past.reason, /only deliver within 10/);
});

test("an order under the minimum is refused with the minimum, not the distance", () => {
  const quote = quoteDelivery(PER_MILE, 4, 5_000);
  assert.equal(quote.ok, false);
  assert.equal(quote.belowMinimum, true);
  assert.equal(quote.outsideZone, false);
  assert.equal(quote.shortfallCents, 2_500);
  assert.match(quote.reason, /over \$75/);
});

test("no subtotal yet means the minimum is untested rather than failed", () => {
  const quote = quoteDelivery(PER_MILE, 4, null);
  assert.equal(quote.ok, true);
  assert.equal(quote.belowMinimum, false);
});

test("a flat zone charges the same fee at any distance inside it", () => {
  assert.equal(quoteDelivery(FLAT, 1, 12_000).feeCents, 2000);
  assert.equal(quoteDelivery(FLAT, 9.5, 12_000).feeCents, 2000);
  assert.equal(quoteDelivery(FLAT, 11, 12_000).ok, false);
});

test("free delivery is free, and still bounded by the radius", () => {
  assert.equal(quoteDelivery(FREE, 9, 12_000).feeCents, 0);
  assert.equal(quoteDelivery(FREE, 12, 12_000).ok, false);
});

test("a zone with no radius set never refuses on distance", () => {
  const unbounded = quoteDelivery({ ...PER_MILE, radiusMiles: 0 }, 40, 12_000);
  assert.equal(unbounded.outsideZone, false);
});

test("road miles inflate straight-line distance and stay to one decimal", () => {
  assert.equal(roadMiles(5), 6);
  assert.equal(roadMiles(3.7), 4.4);
});

test("the zone reads as one spoken sentence", () => {
  assert.equal(
    describeZone(PER_MILE),
    "Delivery goes out 10 miles from the shop, $2 per mile driven plus a $5 call-out, on orders over $75."
  );
  assert.match(describeZone(FREE), /free/);
  assert.match(describeZone({ ...FLAT, minimumOrderUsd: 0 }), /\$20 a delivery\.$/);
});
