/**
 * The bakery's catalog, in Postgres.
 *
 * Ported from `bakery-platform/lib/domain.js` (SQLite) so the phone agent and
 * the storefront price things identically — an order taken on the phone and
 * one taken on the web hit the same rules and land in the same tables.
 *
 * Two deliberate differences from the original:
 *
 *  1. Validation returns `{ ok: false, reason }` instead of throwing. The
 *     agent has to SAY why a date does not work, so the reason is a value.
 *  2. The shop is cached in module scope. Every extra database round trip is
 *     dead air on a live call; the catalog changes far less often than a turn.
 */

import { adminClient } from "@/lib/supabase/admin";
import {
  BAKERY_TZ,
  addDays,
  hourInZone,
  isValidIso,
  todayInZone,
  weekdayOf,
} from "@/lib/agent/dates";

export interface ChosenOption {
  id: number;
  group: string;
  value: string;
  priceDeltaCents: number;
}

export interface OptionGroup {
  name: string;
  options: Array<ChosenOption & { isDefault: boolean }>;
}

export interface ShopProduct {
  id: number;
  name: string;
  description: string;
  category: string;
  basePriceCents: number;
  leadTimeDays: number;
  canHaveCakeText: boolean;
  cakeTextPriceCents: number;
  optionGroups: OptionGroup[];
}

export interface Shop {
  id: string;
  name: string;
  address: string;
  phone: string;
  hours: string;
  orderCutoffHour: number;
  openHour: number;
  closeHour: number;
  closedWeekdays: number[];
  products: ShopProduct[];
}

const BAKERY_ID = "default";
const CACHE_MS = 60_000;
export const MAX_CAKE_TEXT_LENGTH = 60;
export const MAX_QTY_PER_LINE = 50;

let cache: { shop: Shop; at: number } | null = null;

/** Call after /setup writes, so the agent picks up an edited profile at once. */
export function invalidateShop(): void {
  cache = null;
}

export async function loadShop(now = Date.now()): Promise<Shop> {
  if (cache && now - cache.at < CACHE_MS) return cache.shop;

  const sb = adminClient();
  const [bakeryRes, productRes, optionRes] = await Promise.all([
    sb.from("bakeries").select("*").eq("id", BAKERY_ID).maybeSingle(),
    sb
      .from("products")
      .select("*")
      .eq("bakery_id", BAKERY_ID)
      .eq("active", true)
      .order("sort_order"),
    sb.from("product_options").select("*").order("position"),
  ]);

  const error = bakeryRes.error ?? productRes.error ?? optionRes.error;
  if (error) throw new Error(`loadShop: ${error.message}`);
  if (!bakeryRes.data) throw new Error("loadShop: no bakery profile — visit /setup first");

  const b = bakeryRes.data;
  const optionsByProduct = new Map<number, typeof optionRes.data>();
  for (const o of optionRes.data ?? []) {
    const list = optionsByProduct.get(o.product_id) ?? [];
    list.push(o);
    optionsByProduct.set(o.product_id, list);
  }

  const products: ShopProduct[] = (productRes.data ?? []).map((p) => {
    const groups: OptionGroup[] = [];
    for (const o of optionsByProduct.get(p.id) ?? []) {
      let group = groups.find((g) => g.name === o.group_name);
      if (!group) {
        group = { name: o.group_name, options: [] };
        groups.push(group);
      }
      group.options.push({
        id: o.id,
        group: o.group_name,
        value: o.value_name,
        priceDeltaCents: o.price_delta_cents,
        isDefault: o.is_default,
      });
    }
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      basePriceCents: p.base_price_cents,
      leadTimeDays: p.lead_time_days,
      canHaveCakeText: p.can_have_cake_text,
      cakeTextPriceCents: p.cake_text_price_cents,
      optionGroups: groups,
    };
  });

  const shop: Shop = {
    id: b.id,
    name: b.name,
    address: b.address || b.location,
    phone: b.phone,
    hours: b.hours,
    orderCutoffHour: b.order_cutoff_hour,
    openHour: b.open_hour,
    closeHour: b.close_hour,
    closedWeekdays: b.closed_weekdays,
    products,
  };

  cache = { shop, at: now };
  return shop;
}

/* --------------------------------- pricing -------------------------------- */

/**
 * Validate selected option ids against a product. Any group the caller did
 * not choose falls back to its default, so a half-specified order still
 * prices — the agent can quote before every question is answered.
 */
export function resolveSelection(
  product: ShopProduct,
  optionIds: number[] = []
): { ok: true; chosen: ChosenOption[] } | { ok: false; reason: string } {
  const all = product.optionGroups.flatMap((g) => g.options);
  const chosen: ChosenOption[] = [];

  for (const id of [...new Set(optionIds)]) {
    const opt = all.find((o) => o.id === id);
    if (!opt) return { ok: false, reason: `That is not an available choice for ${product.name}.` };
    chosen.push({ id: opt.id, group: opt.group, value: opt.value, priceDeltaCents: opt.priceDeltaCents });
  }

  for (const g of product.optionGroups) {
    const inGroup = chosen.filter((c) => c.group === g.name);
    if (inGroup.length > 1) {
      return { ok: false, reason: `Only one ${g.name.toLowerCase()} can be chosen.` };
    }
    if (inGroup.length === 0) {
      const fallback = g.options.find((o) => o.isDefault) ?? g.options[0];
      if (fallback) {
        chosen.push({
          id: fallback.id,
          group: fallback.group,
          value: fallback.value,
          priceDeltaCents: fallback.priceDeltaCents,
        });
      }
    }
  }

  return { ok: true, chosen };
}

/** Unit price = base + option deltas + cake-text surcharge when text is set. */
export function unitPriceCents(
  product: ShopProduct,
  chosen: ChosenOption[],
  cakeText = ""
): number {
  let price = product.basePriceCents;
  for (const o of chosen) price += o.priceDeltaCents;
  if (cakeText && product.canHaveCakeText) price += product.cakeTextPriceCents;
  return price;
}

/**
 * How many people a size label feeds. Labels are written for humans and vary
 * per product — "Serves 8", "24 slices", "Serves 30 (rectangular)" — so take
 * the first number wherever it sits rather than assuming a leading digit.
 */
function servingsOf(value: string): number | null {
  const m = /(\d+)/.exec(value);
  return m ? Number(m[1]) : null;
}

export interface SizeSuggestion {
  option: ChosenOption & { isDefault: boolean };
  servings: number;
  /** False when even the largest size cannot feed everyone. */
  sufficient: boolean;
}

/**
 * Smallest size that still feeds everyone. A guest count is the one number
 * callers always volunteer, and turning it into a size in code keeps the
 * model from cheerfully recommending a 12-serving cake for 30 people. When
 * nothing is big enough the caller needs to hear that, so it is reported
 * rather than rounded away.
 */
export function suggestSizeForGuests(
  product: ShopProduct,
  guests: number
): SizeSuggestion | null {
  const sizes = product.optionGroups.find((g) => /size|serves/i.test(g.name));
  if (!sizes) return null;

  const ladder: Array<{ option: SizeSuggestion["option"]; servings: number }> = [];
  for (const option of sizes.options) {
    const servings = servingsOf(option.value);
    if (servings !== null) ladder.push({ option, servings });
  }
  if (!ladder.length) return null;
  ladder.sort((a, b) => a.servings - b.servings);

  const fit = ladder.find((x) => x.servings >= guests);
  const chosen = fit ?? ladder[ladder.length - 1];
  return { option: chosen.option, servings: chosen.servings, sufficient: Boolean(fit) };
}

/* ----------------------------- pickup date/slots --------------------------- */

/** Today + lead time, plus a day if the cutoff passed, then skip closed days. */
export function earliestPickupDate(
  shop: Pick<Shop, "orderCutoffHour" | "closedWeekdays">,
  leadTimeDays: number,
  now = new Date()
): string {
  let date = addDays(todayInZone(BAKERY_TZ, now), leadTimeDays);
  if (hourInZone(BAKERY_TZ, now) >= shop.orderCutoffHour) date = addDays(date, 1);
  for (let i = 0; i < 8 && shop.closedWeekdays.includes(weekdayOf(date)); i++) {
    date = addDays(date, 1);
  }
  return date;
}

/** Hourly pickup windows derived from opening hours: ["08:00-09:00", ...]. */
export function pickupSlots(shop: Pick<Shop, "openHour" | "closeHour">): string[] {
  const slots: string[] = [];
  for (let h = shop.openHour; h < shop.closeHour; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00-${String(h + 1).padStart(2, "0")}:00`);
  }
  return slots;
}

export interface PickupCheck {
  ok: boolean;
  /** Spoken verbatim by the agent when ok is false. */
  reason?: string;
  earliest: string;
  slots: string[];
}

export function checkPickupDate(
  shop: Shop,
  leadTimeDays: number,
  date: string,
  now = new Date()
): PickupCheck {
  const earliest = earliestPickupDate(shop, leadTimeDays, now);
  const slots = pickupSlots(shop);

  if (!isValidIso(date)) {
    return { ok: false, reason: "that date did not come through clearly", earliest, slots };
  }
  if (shop.closedWeekdays.includes(weekdayOf(date))) {
    return { ok: false, reason: "we are closed that day", earliest, slots };
  }
  if (date < earliest) {
    return {
      ok: false,
      reason: `we need ${leadTimeDays} day${leadTimeDays === 1 ? "" : "s"} notice for that one`,
      earliest,
      slots,
    };
  }
  return { ok: true, earliest, slots };
}

/* --------------------------------- orders --------------------------------- */

export interface PhoneOrderLine {
  productId: number;
  qty: number;
  optionIds: number[];
  cakeText: string;
}

export interface PhoneOrderInput {
  customerName: string;
  customerPhone: string;
  pickupDate: string;
  pickupSlot: string;
  note: string;
  leadId: string | null;
  lines: PhoneOrderLine[];
}

export interface PhoneOrder {
  orderNumber: string;
  totalCents: number;
  pickupDate: string;
  pickupSlot: string;
  lines: Array<{ productName: string; qty: number; options: ChosenOption[]; cakeText: string }>;
}

/**
 * Price the order server-side, then write it to the same `orders` /
 * `order_lines` tables the storefront uses, tagged with the lead it came
 * from. Payment is not taken on the phone — the bakery collects at pickup.
 */
export async function createPhoneOrder(
  input: PhoneOrderInput,
  now = new Date()
): Promise<{ ok: true; order: PhoneOrder } | { ok: false; reason: string }> {
  const shop = await loadShop();
  if (!input.lines.length) return { ok: false, reason: "there is nothing on the order yet" };

  let maxLead = 0;
  let totalCents = 0;
  const lines: Array<{
    productId: number;
    productName: string;
    qty: number;
    unitPriceCents: number;
    lineTotalCents: number;
    options: ChosenOption[];
    cakeText: string;
  }> = [];

  for (const raw of input.lines) {
    const product = shop.products.find((p) => p.id === raw.productId);
    if (!product) return { ok: false, reason: "one of those items is not available right now" };

    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      return { ok: false, reason: `that is not a quantity we can do for ${product.name}` };
    }

    const cakeText = String(raw.cakeText ?? "").trim().slice(0, MAX_CAKE_TEXT_LENGTH);
    if (cakeText && !product.canHaveCakeText) {
      return { ok: false, reason: `we cannot put writing on the ${product.name}` };
    }

    const selection = resolveSelection(product, raw.optionIds);
    if (!selection.ok) return { ok: false, reason: selection.reason };

    const unit = unitPriceCents(product, selection.chosen, cakeText);
    totalCents += unit * qty;
    maxLead = Math.max(maxLead, product.leadTimeDays);
    lines.push({
      productId: product.id,
      productName: product.name,
      qty,
      unitPriceCents: unit,
      lineTotalCents: unit * qty,
      options: selection.chosen,
      cakeText,
    });
  }

  const pickup = checkPickupDate(shop, maxLead, input.pickupDate, now);
  if (!pickup.ok) return { ok: false, reason: pickup.reason ?? "that pickup date does not work" };
  if (!pickup.slots.includes(input.pickupSlot)) {
    return { ok: false, reason: "that is not a pickup time we can do" };
  }

  const sb = adminClient();
  const { data: order, error } = await sb
    .from("orders")
    .insert({
      bakery_id: shop.id,
      // Replaced with the id-derived number below; unique and never shown.
      order_number: `PENDING-${Math.random().toString(36).slice(2, 10)}`,
      status: "new",
      customer_name: input.customerName || "Phone customer",
      customer_phone: input.customerPhone,
      customer_email: "",
      pickup_date: input.pickupDate,
      pickup_slot: input.pickupSlot,
      note: input.note.slice(0, 500),
      total_cents: totalCents,
      payment_provider: "phone",
      payment_status: "pay_at_pickup",
      payment_reference: "",
      lead_id: input.leadId,
    })
    .select("id")
    .single();

  if (error || !order) return { ok: false, reason: `the order did not save (${error?.message})` };

  // Same numbering the storefront uses, so phone and web orders read alike.
  const orderNumber = `B-${1000 + order.id}`;
  const [{ error: numberError }, { error: linesError }] = await Promise.all([
    sb.from("orders").update({ order_number: orderNumber }).eq("id", order.id),
    sb.from("order_lines").insert(
      lines.map((l) => ({
        order_id: order.id,
        product_id: l.productId,
        product_name: l.productName,
        qty: l.qty,
        unit_price_cents: l.unitPriceCents,
        line_total_cents: l.lineTotalCents,
        options_json: l.options as unknown as never,
        cake_text: l.cakeText,
      }))
    ),
  ]);
  if (numberError || linesError) {
    return { ok: false, reason: `the order did not save (${(numberError ?? linesError)?.message})` };
  }

  return {
    ok: true,
    order: {
      orderNumber,
      totalCents,
      pickupDate: input.pickupDate,
      pickupSlot: input.pickupSlot,
      lines: lines.map((l) => ({
        productName: l.productName,
        qty: l.qty,
        options: l.options,
        cakeText: l.cakeText,
      })),
    },
  };
}
