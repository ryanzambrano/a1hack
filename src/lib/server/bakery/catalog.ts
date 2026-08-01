// The I/O half of bakery-platform/lib/domain.js, moved from synchronous SQLite
// onto Supabase. Every rule lives in pricing.ts; this file only reads rows,
// maps them to the API shapes, and writes them back.
//
// One thing SQLite gave the original that supabase-js does not: transactions.
// `db.exec("BEGIN") ... COMMIT` has no client-side equivalent, so the two
// multi-row writes here (an order plus its lines, a product plus its options)
// insert the parent first and compensate by deleting it if the children fail.
// The visible difference from a real transaction is that a concurrent reader
// could see a parent row for the moment before its children land; for an order
// board and a product admin that is acceptable, and the alternative (moving
// order creation into a plpgsql function) would split the domain rules across
// two languages, which is exactly what this port is trying to avoid.

import { adminClient } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";

import {
  DomainError,
  ORDER_STATUSES,
  assertStatusTransition,
  buildOrderDraft,
} from "./pricing";
import type {
  ChosenOption,
  Order,
  OrderInput,
  OrderStatus,
  PaymentProvider,
  Product,
  ShopBakery,
} from "./types";

// The app represents a single bakery, so its profile lives in one known row —
// the same row the lead-gen side uses (src/lib/server/db.ts).
const BAKERY_ID = "default";

function fail(op: string, message: string): never {
  throw new Error(`${op}: ${message}`);
}

/* -------------------------------- mapping --------------------------------- */

function toShopBakery(row: Tables<"bakeries">): ShopBakery {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    // The lead-gen profile calls this `location`; the storefront wants a
    // street address. Fall back so a bakery set up before this port still
    // renders something sensible on the shop page.
    address: row.address || row.location,
    phone: row.phone,
    email: row.email,
    currency: row.currency,
    orderCutoffHour: row.order_cutoff_hour,
    openHour: row.open_hour,
    closeHour: row.close_hour,
    closedWeekdays: row.closed_weekdays,
  };
}

function toProduct(
  row: Tables<"products">,
  optionRows: Tables<"product_options">[]
): Product {
  const optionGroups: Product["optionGroups"] = [];
  for (const o of optionRows) {
    let g = optionGroups.find((x) => x.name === o.group_name);
    if (!g) {
      g = { name: o.group_name, options: [] };
      optionGroups.push(g);
    }
    g.options.push({
      id: o.id,
      value: o.value_name,
      priceDeltaCents: o.price_delta_cents,
      isDefault: o.is_default,
    });
  }

  return {
    id: row.id,
    bakeryId: row.bakery_id,
    name: row.name,
    description: row.description,
    category: row.category,
    imageUrl: row.image_url,
    basePriceCents: row.base_price_cents,
    leadTimeDays: row.lead_time_days,
    canHaveCakeText: row.can_have_cake_text,
    cakeTextPriceCents: row.cake_text_price_cents,
    active: row.active,
    sortOrder: row.sort_order,
    optionGroups,
  };
}

function toOrder(row: Tables<"orders">, lineRows: Tables<"order_lines">[]): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      email: row.customer_email,
    },
    pickupDate: row.pickup_date,
    pickupSlot: row.pickup_slot,
    note: row.note,
    totalCents: row.total_cents,
    paymentProvider: row.payment_provider,
    paymentStatus: row.payment_status,
    paymentReference: row.payment_reference,
    createdAt: row.created_at,
    leadId: row.lead_id,
    lines: lineRows.map((l) => ({
      id: l.id,
      productId: l.product_id,
      productName: l.product_name,
      qty: l.qty,
      unitPriceCents: l.unit_price_cents,
      lineTotalCents: l.line_total_cents,
      options: (l.options_json ?? []) as unknown as ChosenOption[],
      cakeText: l.cake_text,
    })),
  };
}

/* --------------------------------- bakery --------------------------------- */

export async function getShopBakery(): Promise<ShopBakery> {
  const { data, error } = await adminClient()
    .from("bakeries")
    .select("*")
    .eq("id", BAKERY_ID)
    .maybeSingle();

  if (error) fail("getShopBakery", error.message);
  if (!data) {
    throw new DomainError(
      503,
      "The bakery has not been set up yet. Finish Setup to open the shop."
    );
  }
  return toShopBakery(data);
}

/* -------------------------------- products -------------------------------- */

/** Options for many products at once, grouped by product id. */
async function optionsByProduct(
  productIds: number[]
): Promise<Map<number, Tables<"product_options">[]>> {
  const byProduct = new Map<number, Tables<"product_options">[]>();
  if (productIds.length === 0) return byProduct;

  const { data, error } = await adminClient()
    .from("product_options")
    .select("*")
    .in("product_id", productIds)
    .order("position", { ascending: true })
    .order("id", { ascending: true });

  if (error) fail("optionsByProduct", error.message);
  for (const o of data ?? []) {
    const list = byProduct.get(o.product_id);
    if (list) list.push(o);
    else byProduct.set(o.product_id, [o]);
  }
  return byProduct;
}

export async function listProducts({
  includeInactive = false,
}: { includeInactive?: boolean } = {}): Promise<Product[]> {
  let query = adminClient()
    .from("products")
    .select("*")
    .eq("bakery_id", BAKERY_ID)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (!includeInactive) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) fail("listProducts", error.message);

  const rows = data ?? [];
  const options = await optionsByProduct(rows.map((r) => r.id));
  return rows.map((r) => toProduct(r, options.get(r.id) ?? []));
}

export async function getProduct(
  id: number,
  { includeInactive = false }: { includeInactive?: boolean } = {}
): Promise<Product | null> {
  if (!Number.isInteger(id)) return null;

  const { data, error } = await adminClient()
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) fail("getProduct", error.message);
  if (!data || (!includeInactive && !data.active)) return null;

  const options = await optionsByProduct([data.id]);
  return toProduct(data, options.get(data.id) ?? []);
}

/** Products keyed by id, which is what buildOrderDraft() wants. */
export async function productsById(): Promise<Map<number, Product>> {
  const products = await listProducts({ includeInactive: true });
  return new Map(products.map((p) => [p.id, p]));
}

/* --------------------------------- orders --------------------------------- */

async function linesByOrder(
  orderIds: number[]
): Promise<Map<number, Tables<"order_lines">[]>> {
  const byOrder = new Map<number, Tables<"order_lines">[]>();
  if (orderIds.length === 0) return byOrder;

  const { data, error } = await adminClient()
    .from("order_lines")
    .select("*")
    .in("order_id", orderIds)
    .order("id", { ascending: true });

  if (error) fail("linesByOrder", error.message);
  for (const l of data ?? []) {
    const list = byOrder.get(l.order_id);
    if (list) list.push(l);
    else byOrder.set(l.order_id, [l]);
  }
  return byOrder;
}

export async function getOrder(id: number): Promise<Order | null> {
  if (!Number.isInteger(id)) return null;

  const { data, error } = await adminClient()
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) fail("getOrder", error.message);
  if (!data) return null;

  const lines = await linesByOrder([data.id]);
  return toOrder(data, lines.get(data.id) ?? []);
}

export async function listOrders({
  status,
}: { status?: string } = {}): Promise<Order[]> {
  let query = adminClient()
    .from("orders")
    .select("*")
    .eq("bakery_id", BAKERY_ID)
    .order("pickup_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (status) {
    if (!ORDER_STATUSES.includes(status as OrderStatus)) {
      throw new DomainError(400, "Unknown status");
    }
    query = query.eq("status", status as OrderStatus);
  }

  const { data, error } = await query;
  if (error) fail("listOrders", error.message);

  const rows = data ?? [];
  const lines = await linesByOrder(rows.map((r) => r.id));
  return rows.map((r) => toOrder(r, lines.get(r.id) ?? []));
}

export async function setOrderStatus(id: number, status: string): Promise<Order> {
  const existing = await getOrder(id);
  if (!existing) throw new DomainError(404, "That order does not exist");

  assertStatusTransition(existing.status, status as OrderStatus);

  const { error } = await adminClient()
    .from("orders")
    .update({ status: status as OrderStatus })
    .eq("id", id);

  if (error) fail("setOrderStatus", error.message);

  const updated = await getOrder(id);
  if (!updated) fail("setOrderStatus", "order vanished mid-update");
  return updated;
}

/**
 * Create an order from a cart payload.
 *
 * Prices are recomputed from the database by buildOrderDraft (client prices are
 * never trusted) and pickup rules are checked against the strictest lead time
 * in the cart. The payment provider is charged only once the draft validates,
 * so a rejected cart never reaches it.
 */
export async function createOrder(
  payload: OrderInput,
  provider: PaymentProvider,
  now: Date = new Date()
): Promise<Order> {
  const [bakery, products] = await Promise.all([getShopBakery(), productsById()]);
  const draft = buildOrderDraft(bakery, products, payload, now);

  // The mock provider resolves immediately; a real one would leave the order
  // pending here and confirm asynchronously.
  const payment = await provider.charge({ totalCents: draft.totalCents, orderDraft: draft });
  if (!payment.ok) {
    throw new DomainError(402, "The payment was declined. Please try again.");
  }

  const supabase = adminClient();

  // order_number is derived from the generated id, so it is inserted with a
  // unique placeholder and rewritten once the id exists — as in the original.
  const placeholder = `TMP-${payment.reference}`;
  const { data: inserted, error: orderError } = await supabase
    .from("orders")
    .insert({
      bakery_id: bakery.id,
      order_number: placeholder,
      status: "new",
      customer_name: draft.customer.name,
      customer_phone: draft.customer.phone,
      customer_email: draft.customer.email,
      pickup_date: draft.pickupDate,
      pickup_slot: draft.pickupSlot,
      note: draft.note,
      total_cents: draft.totalCents,
      payment_provider: provider.name,
      payment_status: payment.status,
      payment_reference: payment.reference,
      lead_id: payload.leadId ?? null,
    })
    .select("id")
    .single();

  if (orderError) fail("createOrder", orderError.message);
  const orderId = inserted.id;

  try {
    const { error: linesError } = await supabase.from("order_lines").insert(
      draft.lines.map((l) => ({
        order_id: orderId,
        product_id: l.productId,
        product_name: l.productName,
        qty: l.qty,
        unit_price_cents: l.unitPriceCents,
        line_total_cents: l.lineTotalCents,
        options_json: l.options as unknown as Json,
        cake_text: l.cakeText,
      }))
    );
    if (linesError) fail("createOrder", linesError.message);

    const { error: numberError } = await supabase
      .from("orders")
      .update({ order_number: `B-${1000 + orderId}` })
      .eq("id", orderId);
    if (numberError) fail("createOrder", numberError.message);
  } catch (err) {
    // Compensate for the missing transaction: an order with no lines is worse
    // than no order at all, so roll it back by hand. Lines cascade with it.
    await supabase.from("orders").delete().eq("id", orderId);
    throw err;
  }

  const order = await getOrder(orderId);
  if (!order) fail("createOrder", "order vanished after insert");
  return order;
}

/* ----------------------------- product admin ------------------------------ */

export interface ProductOptionInput {
  groupName: string;
  valueName: string;
  priceDeltaCents?: number;
  isDefault?: boolean;
}

export interface ProductInput {
  name?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  basePriceCents?: number;
  leadTimeDays?: number;
  canHaveCakeText?: boolean;
  cakeTextPriceCents?: number;
  active?: boolean;
  sortOrder?: number;
  options?: ProductOptionInput[];
}

type ProductColumns = {
  name?: string;
  description?: string;
  category?: string;
  image_url?: string;
  base_price_cents?: number;
  lead_time_days?: number;
  can_have_cake_text?: boolean;
  cake_text_price_cents?: number;
  active?: boolean;
  sort_order?: number;
};

/** Validates and maps an admin payload onto columns. Mirrors the original. */
function validProductPayload(
  body: ProductInput,
  { partial = false }: { partial?: boolean } = {}
): { columns: ProductColumns; options?: ProductOptionInput[] } {
  const columns: ProductColumns = {};
  const has = (k: keyof ProductInput) => body[k] !== undefined;

  if (!partial || has("name")) {
    const name = String(body.name ?? "").trim();
    if (name.length < 2) throw new DomainError(400, "The product needs a name");
    columns.name = name;
  }
  if (!partial || has("basePriceCents")) {
    const p = Number(body.basePriceCents);
    if (!Number.isInteger(p) || p < 0) throw new DomainError(400, "Invalid price");
    columns.base_price_cents = p;
  }
  if (has("description")) columns.description = String(body.description ?? "");
  if (has("category")) {
    columns.category = String(body.category ?? "Other").trim() || "Other";
  }
  if (has("imageUrl")) columns.image_url = String(body.imageUrl ?? "");
  if (has("leadTimeDays")) {
    const d = Number(body.leadTimeDays);
    if (!Number.isInteger(d) || d < 0 || d > 30) {
      throw new DomainError(400, "Invalid lead time");
    }
    columns.lead_time_days = d;
  }
  if (has("canHaveCakeText")) columns.can_have_cake_text = Boolean(body.canHaveCakeText);
  if (has("cakeTextPriceCents")) {
    const p = Number(body.cakeTextPriceCents);
    if (!Number.isInteger(p) || p < 0) throw new DomainError(400, "Invalid text price");
    columns.cake_text_price_cents = p;
  }
  if (has("active")) columns.active = Boolean(body.active);
  if (has("sortOrder")) columns.sort_order = Number(body.sortOrder) || 0;

  let options: ProductOptionInput[] | undefined;
  if (has("options")) {
    if (!Array.isArray(body.options)) throw new DomainError(400, "Invalid options");
    options = body.options.map((o) => {
      const groupName = String(o.groupName ?? "").trim();
      const valueName = String(o.valueName ?? "").trim();
      const priceDeltaCents = Number(o.priceDeltaCents ?? 0);
      if (!groupName || !valueName) {
        throw new DomainError(400, "Options need a group and a name");
      }
      if (!Number.isInteger(priceDeltaCents)) {
        throw new DomainError(400, "Invalid price adjustment");
      }
      return { groupName, valueName, priceDeltaCents, isDefault: Boolean(o.isDefault) };
    });
  }

  return { columns, options };
}

/** Replaces a product's whole option list, as the contract specifies. */
async function replaceOptions(
  productId: number,
  options: ProductOptionInput[]
): Promise<void> {
  const supabase = adminClient();

  const { error: deleteError } = await supabase
    .from("product_options")
    .delete()
    .eq("product_id", productId);
  if (deleteError) fail("replaceOptions", deleteError.message);

  if (options.length === 0) return;

  const { error: insertError } = await supabase.from("product_options").insert(
    options.map((o, i) => ({
      product_id: productId,
      group_name: o.groupName,
      value_name: o.valueName,
      price_delta_cents: o.priceDeltaCents ?? 0,
      is_default: Boolean(o.isDefault),
      position: i,
    }))
  );
  if (insertError) fail("replaceOptions", insertError.message);
}

export async function createProduct(body: ProductInput): Promise<Product> {
  const bakery = await getShopBakery();
  const { columns, options } = validProductPayload(body);

  const { data, error } = await adminClient()
    .from("products")
    .insert({
      bakery_id: bakery.id,
      name: columns.name!,
      base_price_cents: columns.base_price_cents!,
      description: columns.description ?? "",
      category: columns.category ?? "Other",
      image_url: columns.image_url ?? "",
      lead_time_days: columns.lead_time_days ?? 1,
      can_have_cake_text: columns.can_have_cake_text ?? false,
      cake_text_price_cents: columns.cake_text_price_cents ?? 0,
      active: columns.active ?? true,
      sort_order: columns.sort_order ?? 0,
    })
    .select("id")
    .single();

  if (error) fail("createProduct", error.message);

  try {
    if (options) await replaceOptions(data.id, options);
  } catch (err) {
    // Same compensation as createOrder: no half-built product survives.
    await adminClient().from("products").delete().eq("id", data.id);
    throw err;
  }

  const product = await getProduct(data.id, { includeInactive: true });
  if (!product) fail("createProduct", "product vanished after insert");
  return product;
}

export async function updateProduct(id: number, body: ProductInput): Promise<Product> {
  const existing = await getProduct(id, { includeInactive: true });
  if (!existing) throw new DomainError(404, "That product does not exist");

  const { columns, options } = validProductPayload(body, { partial: true });

  if (Object.keys(columns).length > 0) {
    const { error } = await adminClient().from("products").update(columns).eq("id", id);
    if (error) fail("updateProduct", error.message);
  }
  if (options) await replaceOptions(id, options);

  const product = await getProduct(id, { includeInactive: true });
  if (!product) fail("updateProduct", "product vanished after update");
  return product;
}
