// Pure domain logic ported from bakery-platform/lib/domain.js: option
// resolution, price calculation, pickup-date rules, status transitions and
// order validation. Nothing here touches the database or the network, which is
// what makes it directly testable (see pricing.test.ts).
//
// The original mixed these rules with SQLite calls. Splitting them out means
// the order-creation rules can be tested without a database at all, and the
// Supabase layer in catalog.ts is left with nothing but I/O.
//
// All money is integer USD cents. All user-facing messages are English.

import type {
  ChosenOption,
  Customer,
  OrderDraft,
  OrderInput,
  OrderStatus,
  Product,
  ShopBakery,
} from "./types";

export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "ready",
  "picked_up",
  "cancelled",
] as const satisfies readonly OrderStatus[];

/** Carries the HTTP status the API should answer with. */
export class DomainError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DomainError";
    this.status = status;
  }
}

// Forward-only lifecycle plus cancel from any non-terminal state.
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["ready", "cancelled"],
  ready: ["picked_up", "cancelled"],
  picked_up: [],
  cancelled: [],
};

export const MAX_CAKE_TEXT_LENGTH = 60;
export const MAX_ORDER_DAYS_AHEAD = 60;
export const MAX_QTY_PER_LINE = 50;
export const MAX_LINES_PER_ORDER = 30;
export const MAX_NOTE_LENGTH = 500;

/* --------------------------------- money ---------------------------------- */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** 4900 -> "$49.00". The one place cents become a display string. */
export function formatUsd(cents: number): string {
  return USD.format(cents / 100);
}

/* -------------------------------- pricing --------------------------------- */

/**
 * Validate selected option ids against a product: every id must belong to the
 * product and at most one value per group may be chosen. Groups the caller
 * left out fall back to their default, so the returned snapshot always covers
 * every group the product has.
 */
export function resolveSelection(
  product: Product,
  optionIds: number[] = []
): ChosenOption[] {
  const ids = [...new Set(optionIds.map(Number))];
  const all = product.optionGroups.flatMap((g) =>
    g.options.map((o) => ({ ...o, group: g.name }))
  );

  const chosen: (typeof all)[number][] = [];
  for (const id of ids) {
    const opt = all.find((o) => o.id === id);
    if (!opt) {
      throw new DomainError(400, `Invalid choice for ${product.name}`);
    }
    chosen.push(opt);
  }

  for (const g of product.optionGroups) {
    const inGroup = chosen.filter((c) => c.group === g.name);
    if (inGroup.length > 1) {
      throw new DomainError(400, `Pick only one option for ${g.name}`);
    }
    if (inGroup.length === 0) {
      const def = g.options.find((o) => o.isDefault) ?? g.options[0];
      if (!def) continue;
      chosen.push({ ...def, group: g.name });
    }
  }

  return chosen.map((c) => ({
    id: c.id,
    group: c.group,
    value: c.value,
    priceDeltaCents: c.priceDeltaCents,
  }));
}

/** Unit price = base + option deltas + cake-text surcharge (if text given). */
export function unitPriceCents(
  product: Product,
  chosenOptions: ChosenOption[],
  cakeText = ""
): number {
  let price = product.basePriceCents;
  for (const o of chosenOptions) price += o.priceDeltaCents;
  if (cakeText && product.canHaveCakeText) price += product.cakeTextPriceCents;
  return price;
}

/* ---------------------------- pickup date/slots ---------------------------- */

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Earliest allowed pickup date: today + leadTimeDays, plus one day if the
 * cutoff hour has passed, then skip the bakery's closed weekdays.
 */
export function earliestPickupDate(
  bakery: ShopBakery,
  leadTimeDays: number,
  now: Date = new Date()
): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let extra = leadTimeDays;
  if (now.getHours() >= bakery.orderCutoffHour) extra += 1;
  d.setDate(d.getDate() + extra);

  for (let i = 0; i < 8 && bakery.closedWeekdays.includes(d.getDay()); i++) {
    d.setDate(d.getDate() + 1);
  }
  return toISODate(d);
}

/** Hourly pickup windows derived from opening hours: ["08:00-09:00", ...]. */
export function pickupSlots(bakery: ShopBakery): string[] {
  const slots: string[] = [];
  for (let h = bakery.openHour; h < bakery.closeHour; h++) {
    const from = String(h).padStart(2, "0");
    const to = String(h + 1).padStart(2, "0");
    slots.push(`${from}:00-${to}:00`);
  }
  return slots;
}

export function assertValidPickupDate(
  bakery: ShopBakery,
  leadTimeDays: number,
  dateStr: string,
  now: Date = new Date()
): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr ?? "")) {
    throw new DomainError(400, "Invalid pickup date");
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // Rejects the likes of 2026-02-31, which Date would roll over silently.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    throw new DomainError(400, "Invalid pickup date");
  }
  if (bakery.closedWeekdays.includes(date.getDay())) {
    throw new DomainError(400, "The bakery is closed that day");
  }

  const earliest = earliestPickupDate(bakery, leadTimeDays, now);
  if (dateStr < earliest) {
    throw new DomainError(
      400,
      `The earliest pickup day for this order is ${earliest}`
    );
  }

  const max = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  max.setDate(max.getDate() + MAX_ORDER_DAYS_AHEAD);
  if (dateStr > toISODate(max)) {
    throw new DomainError(
      400,
      `Pickup date cannot be more than ${MAX_ORDER_DAYS_AHEAD} days ahead`
    );
  }
}

/* -------------------------------- statuses -------------------------------- */

export function assertStatusTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ORDER_STATUSES.includes(to)) throw new DomainError(400, "Unknown status");
  if (!(STATUS_TRANSITIONS[from] ?? []).includes(to)) {
    throw new DomainError(400, `Cannot change status from ${from} to ${to}`);
  }
}

/** The statuses an order can legally move to right now (drives the UI). */
export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  return STATUS_TRANSITIONS[from] ?? [];
}

/* --------------------------------- orders --------------------------------- */

export function validCustomer(customer: Partial<Customer> | undefined): Customer {
  const c = customer ?? {};
  const name = String(c.name ?? "").trim();
  const phone = String(c.phone ?? "").trim();
  const email = String(c.email ?? "").trim();

  if (name.length < 2) throw new DomainError(400, "Enter your name");
  if (phone.replace(/\D/g, "").length < 8) {
    throw new DomainError(400, "Enter a valid phone number");
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new DomainError(400, "Enter a valid email address");
  }
  return { name, phone, email };
}

/**
 * Turn a cart payload into a fully priced, validated order draft.
 *
 * Every price is recomputed from `products` (the caller loads them from the
 * database); prices sent by the client are ignored entirely. Pickup rules are
 * checked against the strictest lead time in the cart.
 *
 * Pure on purpose: the caller does the I/O either side of it, so all the order
 * rules are testable without a database.
 */
export function buildOrderDraft(
  bakery: ShopBakery,
  products: Map<number, Product>,
  payload: OrderInput,
  now: Date = new Date()
): OrderDraft {
  const body = payload ?? ({} as OrderInput);
  const customer = validCustomer(body.customer);

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw new DomainError(400, "Your cart is empty");
  }
  if (body.lines.length > MAX_LINES_PER_ORDER) {
    throw new DomainError(400, "The order has too many line items");
  }

  let maxLead = 0;
  let totalCents = 0;
  const lines: OrderDraft["lines"] = [];

  for (const raw of body.lines) {
    const product = products.get(Number(raw.productId));
    if (!product || !product.active) {
      throw new DomainError(400, "One of the products in your cart is unavailable");
    }

    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw new DomainError(400, `Invalid quantity for ${product.name}`);
    }

    const cakeText = String(raw.cakeText ?? "").trim();
    if (cakeText && !product.canHaveCakeText) {
      throw new DomainError(400, `${product.name} cannot have text on it`);
    }
    if (cakeText.length > MAX_CAKE_TEXT_LENGTH) {
      throw new DomainError(
        400,
        `Text on the cake can be at most ${MAX_CAKE_TEXT_LENGTH} characters`
      );
    }

    const options = resolveSelection(product, raw.optionIds ?? []);
    const unit = unitPriceCents(product, options, cakeText);
    const lineTotal = unit * qty;

    totalCents += lineTotal;
    maxLead = Math.max(maxLead, product.leadTimeDays);
    lines.push({
      productId: product.id,
      productName: product.name,
      qty,
      unitPriceCents: unit,
      lineTotalCents: lineTotal,
      options,
      cakeText,
    });
  }

  assertValidPickupDate(bakery, maxLead, body.pickupDate, now);
  if (!pickupSlots(bakery).includes(body.pickupSlot)) {
    throw new DomainError(400, "Pick a valid pickup time");
  }

  return {
    customer,
    pickupDate: body.pickupDate,
    pickupSlot: body.pickupSlot,
    note: String(body.note ?? "").trim().slice(0, MAX_NOTE_LENGTH),
    totalCents,
    lines,
  };
}
