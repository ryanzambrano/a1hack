// Critical-path tests: price calculation with options, pickup-date rules and
// creating an order from a cart. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../lib/db.js";
import {
  resolveSelection,
  unitPriceCents,
  earliestPickupDate,
  pickupSlots,
  createOrder,
  setOrderStatus,
  listProducts,
  getBakery,
  DomainError,
} from "../lib/domain.js";
import { getPaymentProvider } from "../lib/payments.js";

function freshDb() {
  return openDb(":memory:");
}
function byName(db, name) {
  const p = listProducts(db).find((p) => p.name === name);
  assert.ok(p, `seed product missing: ${name}`);
  return p;
}
function optionId(product, group, value) {
  const g = product.optionGroups.find((g) => g.name === group);
  const o = g && g.options.find((o) => o.value === value);
  assert.ok(o, `option missing: ${group}/${value}`);
  return o.id;
}
// Tue 2026-07-21 09:00 local, before the 12:00 cutoff.
const NOW = new Date(2026, 6, 21, 9, 0, 0);

/* ------------------------- price calculation ------------------------- */

test("default selection prices at base price", () => {
  const db = freshDb();
  const cake = byName(db, "Sjokoladekake");
  const chosen = resolveSelection(cake, []);
  assert.equal(unitPriceCents(cake, chosen), 49000);
  // defaults resolved for every group
  assert.deepEqual(
    chosen.map((c) => c.group).sort(),
    ["Fyll", "Størrelse"]
  );
});

test("size option adds its delta; absolute price matches the Norwegian pattern", () => {
  const db = freshDb();
  const cake = byName(db, "Sjokoladekake");
  const id12 = optionId(cake, "Størrelse", "12 biter");
  const chosen = resolveSelection(cake, [id12]);
  assert.equal(unitPriceCents(cake, chosen), 69000); // 490 + 200 = kr 690
});

test("cake text adds the surcharge only when the product allows it", () => {
  const db = freshDb();
  const cake = byName(db, "Sjokoladekake");
  const chosen = resolveSelection(cake, []);
  assert.equal(unitPriceCents(cake, chosen, "Gratulerer Mia"), 49000 + 8000);
  const festkake = byName(db, "Festkake med hilsen");
  const fChosen = resolveSelection(festkake, []);
  assert.equal(unitPriceCents(festkake, fChosen, "Hurra"), 78000); // included
});

test("selection validation: rejects foreign ids and double picks in a group", () => {
  const db = freshDb();
  const cake = byName(db, "Sjokoladekake");
  const bread = byName(db, "Surdeigsbrød");
  const foreign = optionId(bread, "Skjæring", "Hel");
  assert.throws(() => resolveSelection(cake, [foreign]), DomainError);
  const a = optionId(cake, "Størrelse", "8 biter");
  const b = optionId(cake, "Størrelse", "12 biter");
  assert.throws(() => resolveSelection(cake, [a, b]), DomainError);
});

/* ------------------------- pickup date rules ------------------------- */

test("earliest pickup: lead time, cutoff and closed Sunday", () => {
  const db = freshDb();
  const bakery = getBakery(db);
  // lead 2, before cutoff: Tue 21 + 2 = Thu 23
  assert.equal(earliestPickupDate(bakery, 2, NOW), "2026-07-23");
  // after the 12:00 cutoff one extra day
  const late = new Date(2026, 6, 21, 13, 0, 0);
  assert.equal(earliestPickupDate(bakery, 2, late), "2026-07-24");
  // Sat 25 + lead 1 = Sun 26 (closed) -> Mon 27
  const sat = new Date(2026, 6, 25, 9, 0, 0);
  assert.equal(earliestPickupDate(bakery, 1, sat), "2026-07-27");
});

test("pickup slots derive from opening hours", () => {
  const db = freshDb();
  const slots = pickupSlots(getBakery(db));
  assert.equal(slots[0], "08:00-09:00");
  assert.equal(slots[slots.length - 1], "15:00-16:00");
  assert.equal(slots.length, 8);
});

/* ------------------------- order creation ------------------------- */

const CUSTOMER = { name: "Kari Nordmann", phone: "412 34 567", email: "kari@example.com" };

test("creates an order from a cart: recomputed totals, snapshots, demo payment", async () => {
  const db = freshDb();
  const cake = byName(db, "Sjokoladekake");
  const croissant = byName(db, "Croissant");
  const id12 = optionId(cake, "Størrelse", "12 biter");
  const oreo = optionId(cake, "Fyll", "Oreokrem");

  const order = await createOrder(
    db,
    {
      customer: CUSTOMER,
      pickupDate: "2026-07-23",
      pickupSlot: "10:00-11:00",
      note: "Ringer når vi er fremme",
      lines: [
        { productId: cake.id, qty: 1, optionIds: [id12, oreo], cakeText: "Grattis Ola" },
        { productId: croissant.id, qty: 4 },
      ],
    },
    getPaymentProvider(),
    NOW
  );

  // 690 + 80 text = 770; 4 x 42 = 168; total kr 938
  assert.equal(order.totalCents, 77000 + 16800);
  assert.equal(order.status, "new");
  assert.equal(order.paymentStatus, "demo_paid");
  assert.match(order.paymentReference, /^DEMO-/);
  assert.match(order.orderNumber, /^B-\d+$/);
  assert.equal(order.lines.length, 2);
  const cakeLine = order.lines[0];
  assert.equal(cakeLine.unitPriceCents, 77000);
  assert.equal(cakeLine.cakeText, "Grattis Ola");
  assert.deepEqual(
    cakeLine.options.find((o) => o.group === "Fyll").value,
    "Oreokrem"
  );
});

test("rejects a pickup date earlier than the strictest lead time in the cart", async () => {
  const db = freshDb();
  const cake = byName(db, "Sjokoladekake"); // lead 2
  const croissant = byName(db, "Croissant"); // lead 0
  await assert.rejects(
    createOrder(
      db,
      {
        customer: CUSTOMER,
        pickupDate: "2026-07-22", // only croissant would allow this
        pickupSlot: "10:00-11:00",
        lines: [
          { productId: croissant.id, qty: 1 },
          { productId: cake.id, qty: 1 },
        ],
      },
      getPaymentProvider(),
      NOW
    ),
    (err) => err instanceof DomainError && /Tidligste mulige hentedag/.test(err.message)
  );
});

test("rejects: empty cart, closed day, bad slot, bad qty, cake text where not allowed", async () => {
  const db = freshDb();
  const croissant = byName(db, "Croissant");
  const base = {
    customer: CUSTOMER,
    pickupDate: "2026-07-21",
    pickupSlot: "10:00-11:00",
    lines: [{ productId: croissant.id, qty: 1 }],
  };
  const p = getPaymentProvider();

  await assert.rejects(createOrder(db, { ...base, lines: [] }, p, NOW), DomainError);
  await assert.rejects(
    createOrder(db, { ...base, pickupDate: "2026-07-26" }, p, NOW), // Sunday
    (e) => /stengt/.test(e.message)
  );
  await assert.rejects(
    createOrder(db, { ...base, pickupSlot: "07:00-08:00" }, p, NOW),
    (e) => /hentetidspunkt/.test(e.message)
  );
  await assert.rejects(
    createOrder(db, { ...base, lines: [{ productId: croissant.id, qty: 0 }] }, p, NOW),
    DomainError
  );
  await assert.rejects(
    createOrder(
      db,
      { ...base, lines: [{ productId: croissant.id, qty: 1, cakeText: "Hei" }] },
      p,
      NOW
    ),
    (e) => /kan ikke ha tekst/.test(e.message)
  );
});

test("order status walks the board and blocks illegal jumps", async () => {
  const db = freshDb();
  const croissant = byName(db, "Croissant");
  const order = await createOrder(
    db,
    {
      customer: CUSTOMER,
      pickupDate: "2026-07-21",
      pickupSlot: "09:00-10:00",
      lines: [{ productId: croissant.id, qty: 2 }],
    },
    getPaymentProvider(),
    NOW
  );
  assert.throws(() => setOrderStatus(db, order.id, "picked_up"), DomainError);
  assert.equal(setOrderStatus(db, order.id, "confirmed").status, "confirmed");
  assert.equal(setOrderStatus(db, order.id, "ready").status, "ready");
  assert.equal(setOrderStatus(db, order.id, "picked_up").status, "picked_up");
  assert.throws(() => setOrderStatus(db, order.id, "cancelled"), DomainError);
});
