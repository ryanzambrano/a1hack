// Critical-path tests ported from bakery-platform/test/domain.test.js: price
// calculation with options, pickup-date rules, order validation and the status
// board. Run with `npm test`.
//
// The original opened an in-memory SQLite database per test. Here the rules are
// pure, so the tests build products straight from the seed catalog and need no
// database at all. The bakery is an explicit fixture rather than the seed row,
// matching the original's hours (open 8-16, closed Sunday, 12:00 cutoff) so
// every assertion below is the original's, with prices scaled from øre to
// cents.
//
// Imports carry the .ts extension because Node runs this file directly with its
// built-in TypeScript stripping.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DomainError,
  allowedTransitions,
  assertStatusTransition,
  buildOrderDraft,
  earliestPickupDate,
  formatUsd,
  pickupSlots,
  resolveSelection,
  unitPriceCents,
} from "./pricing.ts";
import { seedProducts } from "./seed-data.ts";
import type { OrderInput, OrderStatus, Product, ShopBakery } from "./types.ts";

/* -------------------------------- fixtures -------------------------------- */

const BAKERY: ShopBakery = {
  id: "default",
  slug: "test-bakery",
  name: "Test Bakery",
  description: "",
  address: "",
  phone: "",
  email: "",
  currency: "USD",
  orderCutoffHour: 12,
  openHour: 8,
  closeHour: 16,
  closedWeekdays: [0], // Sunday
};

// Build the catalog the way the database would: products numbered from 1,
// options numbered continuously across all products so a foreign option id is
// a real id belonging to a different product.
let nextOptionId = 1;
const PRODUCTS: Product[] = seedProducts.map((p, i) => {
  const groups: Product["optionGroups"] = [];
  for (const o of p.options) {
    let g = groups.find((x) => x.name === o.groupName);
    if (!g) {
      g = { name: o.groupName, options: [] };
      groups.push(g);
    }
    g.options.push({
      id: nextOptionId++,
      value: o.valueName,
      priceDeltaCents: o.priceDeltaCents,
      isDefault: Boolean(o.isDefault),
    });
  }
  return {
    id: i + 1,
    bakeryId: "default",
    name: p.name,
    description: p.description,
    category: p.category,
    imageUrl: p.imageUrl,
    basePriceCents: p.basePriceCents,
    leadTimeDays: p.leadTimeDays,
    canHaveCakeText: p.canHaveCakeText,
    cakeTextPriceCents: p.cakeTextPriceCents,
    active: true,
    sortOrder: i + 1,
    optionGroups: groups,
  };
});

const BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));

function byName(name: string): Product {
  const p = PRODUCTS.find((x) => x.name === name);
  assert.ok(p, `seed product missing: ${name}`);
  return p;
}

function optionId(product: Product, group: string, value: string): number {
  const g = product.optionGroups.find((x) => x.name === group);
  const o = g?.options.find((x) => x.value === value);
  assert.ok(o, `option missing: ${group}/${value}`);
  return o.id;
}

// Tue 2026-07-21 09:00 local, before the 12:00 cutoff.
const NOW = new Date(2026, 6, 21, 9, 0, 0);

/* --------------------------- price calculation ---------------------------- */

test("default selection prices at base price", () => {
  const cake = byName("Chocolate Fudge Cake");
  const chosen = resolveSelection(cake, []);
  assert.equal(unitPriceCents(cake, chosen), 4900);
  // defaults resolved for every group
  assert.deepEqual(chosen.map((c) => c.group).sort(), ["Filling", "Size"]);
});

test("size option adds its delta on top of the base price", () => {
  const cake = byName("Chocolate Fudge Cake");
  const id12 = optionId(cake, "Size", "12 slices");
  const chosen = resolveSelection(cake, [id12]);
  assert.equal(unitPriceCents(cake, chosen), 6900); // $49 + $20 = $69
});

test("cake text adds the surcharge only when the product allows it", () => {
  const cake = byName("Chocolate Fudge Cake");
  const chosen = resolveSelection(cake, []);
  assert.equal(unitPriceCents(cake, chosen, "Congrats Mia"), 4900 + 800);

  const celebration = byName("Celebration Cake");
  const cChosen = resolveSelection(celebration, []);
  assert.equal(unitPriceCents(celebration, cChosen, "Hooray"), 7800); // included
});

test("selection validation: rejects foreign ids and double picks in a group", () => {
  const cake = byName("Chocolate Fudge Cake");
  const bread = byName("Sourdough Loaf");

  const foreign = optionId(bread, "Slicing", "Whole");
  assert.throws(() => resolveSelection(cake, [foreign]), DomainError);

  const a = optionId(cake, "Size", "8 slices");
  const b = optionId(cake, "Size", "12 slices");
  assert.throws(() => resolveSelection(cake, [a, b]), DomainError);
});

test("prices render as US dollars", () => {
  assert.equal(formatUsd(4900), "$49.00");
  assert.equal(formatUsd(420), "$4.20");
});

/* ---------------------------- pickup date rules --------------------------- */

test("earliest pickup: lead time, cutoff and closed Sunday", () => {
  // lead 2, before cutoff: Tue 21 + 2 = Thu 23
  assert.equal(earliestPickupDate(BAKERY, 2, NOW), "2026-07-23");

  // after the 12:00 cutoff, one extra day
  const late = new Date(2026, 6, 21, 13, 0, 0);
  assert.equal(earliestPickupDate(BAKERY, 2, late), "2026-07-24");

  // Sat 25 + lead 1 = Sun 26 (closed) -> Mon 27
  const sat = new Date(2026, 6, 25, 9, 0, 0);
  assert.equal(earliestPickupDate(BAKERY, 1, sat), "2026-07-27");
});

test("pickup slots derive from opening hours", () => {
  const slots = pickupSlots(BAKERY);
  assert.equal(slots[0], "08:00-09:00");
  assert.equal(slots[slots.length - 1], "15:00-16:00");
  assert.equal(slots.length, 8);
});

/* ----------------------------- order creation ----------------------------- */

const CUSTOMER = {
  name: "Kari Nordmann",
  phone: "512 555 0148",
  email: "kari@example.com",
};

test("builds an order from a cart: recomputed totals and frozen snapshots", () => {
  const cake = byName("Chocolate Fudge Cake");
  const croissant = byName("Butter Croissant");
  const id12 = optionId(cake, "Size", "12 slices");
  const cookies = optionId(cake, "Filling", "Cookies and cream");

  const draft = buildOrderDraft(
    BAKERY,
    BY_ID,
    {
      customer: CUSTOMER,
      pickupDate: "2026-07-23",
      pickupSlot: "10:00-11:00",
      note: "Will call when we arrive",
      lines: [
        { productId: cake.id, qty: 1, optionIds: [id12, cookies], cakeText: "Congrats Ola" },
        { productId: croissant.id, qty: 4 },
      ],
    },
    NOW
  );

  // $69 + $8 text = $77; 4 x $4.20 = $16.80
  assert.equal(draft.totalCents, 7700 + 1680);
  assert.equal(draft.lines.length, 2);

  const cakeLine = draft.lines[0];
  assert.equal(cakeLine.unitPriceCents, 7700);
  assert.equal(cakeLine.cakeText, "Congrats Ola");
  assert.equal(
    cakeLine.options.find((o) => o.group === "Filling")?.value,
    "Cookies and cream"
  );
  // The server fills in defaults, so every group is on the frozen line.
  assert.deepEqual(cakeLine.options.map((o) => o.group).sort(), ["Filling", "Size"]);
});

test("rejects a pickup date earlier than the strictest lead time in the cart", () => {
  const cake = byName("Chocolate Fudge Cake"); // lead 2
  const croissant = byName("Butter Croissant"); // lead 0

  assert.throws(
    () =>
      buildOrderDraft(
        BAKERY,
        BY_ID,
        {
          customer: CUSTOMER,
          pickupDate: "2026-07-22", // only the croissant would allow this
          pickupSlot: "10:00-11:00",
          lines: [
            { productId: croissant.id, qty: 1 },
            { productId: cake.id, qty: 1 },
          ],
        },
        NOW
      ),
    (err: unknown) =>
      err instanceof DomainError && /earliest pickup day/.test(err.message)
  );
});

test("rejects: empty cart, closed day, bad slot, bad qty, cake text where not allowed", () => {
  const croissant = byName("Butter Croissant");
  const base: OrderInput = {
    customer: CUSTOMER,
    pickupDate: "2026-07-21",
    pickupSlot: "10:00-11:00",
    lines: [{ productId: croissant.id, qty: 1 }],
  };
  const build = (patch: Partial<typeof base>) =>
    buildOrderDraft(BAKERY, BY_ID, { ...base, ...patch }, NOW);

  assert.throws(() => build({ lines: [] }), DomainError);
  assert.throws(
    () => build({ pickupDate: "2026-07-26" }), // Sunday
    (e: unknown) => e instanceof DomainError && /closed/.test(e.message)
  );
  assert.throws(
    () => build({ pickupSlot: "07:00-08:00" }),
    (e: unknown) => e instanceof DomainError && /pickup time/.test(e.message)
  );
  assert.throws(
    () => build({ lines: [{ productId: croissant.id, qty: 0 }] }),
    DomainError
  );
  assert.throws(
    () => build({ lines: [{ productId: croissant.id, qty: 1, cakeText: "Hi" }] }),
    (e: unknown) => e instanceof DomainError && /cannot have text/.test(e.message)
  );
});

test("rejects an incomplete customer", () => {
  const croissant = byName("Butter Croissant");
  const line = { productId: croissant.id, qty: 1 };
  const build = (customer: Record<string, string>) =>
    buildOrderDraft(
      BAKERY,
      BY_ID,
      { customer, pickupDate: "2026-07-21", pickupSlot: "10:00-11:00", lines: [line] },
      NOW
    );

  assert.throws(() => build({ ...CUSTOMER, name: "" }), DomainError);
  assert.throws(() => build({ ...CUSTOMER, phone: "123" }), DomainError);
  assert.throws(() => build({ ...CUSTOMER, email: "not-an-email" }), DomainError);
});

/* -------------------------------- statuses -------------------------------- */

test("order status walks the board and blocks illegal jumps", () => {
  assert.throws(() => assertStatusTransition("new", "picked_up"), DomainError);

  const walk: OrderStatus[] = ["new", "confirmed", "ready", "picked_up"];
  for (let i = 0; i < walk.length - 1; i++) {
    assert.doesNotThrow(() => assertStatusTransition(walk[i], walk[i + 1]));
  }

  // picked_up is terminal: nothing follows it, not even cancel.
  assert.deepEqual(allowedTransitions("picked_up"), []);
  assert.throws(() => assertStatusTransition("picked_up", "cancelled"), DomainError);

  // cancel is legal from every non-terminal state
  for (const s of ["new", "confirmed", "ready"] as OrderStatus[]) {
    assert.doesNotThrow(() => assertStatusTransition(s, "cancelled"));
  }
});
