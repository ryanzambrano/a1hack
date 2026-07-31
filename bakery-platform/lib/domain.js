// Domain logic: product shapes, price calculation, pickup-date rules and
// order creation. All money is integer øre. All functions are synchronous
// except createOrder (which awaits the payment provider).

export class DomainError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const ORDER_STATUSES = ["new", "confirmed", "ready", "picked_up", "cancelled"];

// Forward-only lifecycle plus cancel from any non-terminal state.
const STATUS_TRANSITIONS = {
  new: ["confirmed", "cancelled"],
  confirmed: ["ready", "cancelled"],
  ready: ["picked_up", "cancelled"],
  picked_up: [],
  cancelled: [],
};

const MAX_CAKE_TEXT_LENGTH = 60;
const MAX_ORDER_DAYS_AHEAD = 60;
const MAX_QTY_PER_LINE = 50;

/* ---------------------------------- shapes --------------------------------- */

export function getBakery(db) {
  const row = db.prepare("SELECT * FROM bakeries ORDER BY id LIMIT 1").get();
  if (!row) throw new DomainError(500, "Ingen bakeri er registrert");
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    description: row.description,
    address: row.address,
    phone: row.phone,
    email: row.email,
    currency: row.currency,
    orderCutoffHour: Number(row.order_cutoff_hour),
    openHour: Number(row.open_hour),
    closeHour: Number(row.close_hour),
    closedWeekdays: JSON.parse(row.closed_weekdays),
  };
}

function productShape(row, optionRows) {
  const groups = [];
  for (const o of optionRows) {
    let g = groups.find((x) => x.name === o.group_name);
    if (!g) {
      g = { name: o.group_name, options: [] };
      groups.push(g);
    }
    g.options.push({
      id: Number(o.id),
      value: o.value_name,
      priceDeltaCents: Number(o.price_delta_cents),
      isDefault: !!Number(o.is_default),
    });
  }
  return {
    id: Number(row.id),
    bakeryId: Number(row.bakery_id),
    name: row.name,
    description: row.description,
    category: row.category,
    imageUrl: row.image_url,
    basePriceCents: Number(row.base_price_cents),
    leadTimeDays: Number(row.lead_time_days),
    canHaveCakeText: !!Number(row.can_have_cake_text),
    cakeTextPriceCents: Number(row.cake_text_price_cents),
    active: !!Number(row.active),
    sortOrder: Number(row.sort_order),
    optionGroups: groups,
  };
}

export function listProducts(db, { includeInactive = false } = {}) {
  const rows = db
    .prepare(
      `SELECT * FROM products ${includeInactive ? "" : "WHERE active = 1"}
       ORDER BY sort_order, id`
    )
    .all();
  const opts = db
    .prepare("SELECT * FROM product_options ORDER BY product_id, position, id")
    .all();
  const byProduct = new Map();
  for (const o of opts) {
    const pid = Number(o.product_id);
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid).push(o);
  }
  return rows.map((r) => productShape(r, byProduct.get(Number(r.id)) || []));
}

export function getProduct(db, id, { includeInactive = false } = {}) {
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!row || (!includeInactive && !Number(row.active))) return null;
  const opts = db
    .prepare("SELECT * FROM product_options WHERE product_id = ? ORDER BY position, id")
    .all(id);
  return productShape(row, opts);
}

/* --------------------------------- pricing --------------------------------- */

/**
 * Validate a set of selected option ids against a product: every id must
 * belong to the product and exactly one value per group must be chosen
 * (missing groups fall back to their default). Returns the chosen options
 * as frozen snapshots [{id, group, value, priceDeltaCents}].
 */
export function resolveSelection(product, optionIds = []) {
  const ids = [...new Set(optionIds.map(Number))];
  const all = product.optionGroups.flatMap((g) =>
    g.options.map((o) => ({ ...o, group: g.name }))
  );
  const chosen = [];
  for (const id of ids) {
    const opt = all.find((o) => o.id === id);
    if (!opt) {
      throw new DomainError(400, `Ugyldig valg for ${product.name}`);
    }
    chosen.push(opt);
  }
  for (const g of product.optionGroups) {
    const inGroup = chosen.filter((c) => c.group === g.name);
    if (inGroup.length > 1) {
      throw new DomainError(400, `Velg kun ett alternativ for ${g.name}`);
    }
    if (inGroup.length === 0) {
      const def = g.options.find((o) => o.isDefault) || g.options[0];
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
export function unitPriceCents(product, chosenOptions, cakeText = "") {
  let price = product.basePriceCents;
  for (const o of chosenOptions) price += o.priceDeltaCents;
  if (cakeText && product.canHaveCakeText) price += product.cakeTextPriceCents;
  return price;
}

/* ----------------------------- pickup date/slots ---------------------------- */

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Earliest allowed pickup date: today + leadTimeDays, plus one day if the
 * cutoff hour has passed, then skip the bakery's closed weekdays.
 */
export function earliestPickupDate(bakery, leadTimeDays, now = new Date()) {
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
export function pickupSlots(bakery) {
  const slots = [];
  for (let h = bakery.openHour; h < bakery.closeHour; h++) {
    const from = String(h).padStart(2, "0");
    const to = String(h + 1).padStart(2, "0");
    slots.push(`${from}:00-${to}:00`);
  }
  return slots;
}

export function assertValidPickupDate(bakery, leadTimeDays, dateStr, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "")) {
    throw new DomainError(400, "Ugyldig hentedato");
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    throw new DomainError(400, "Ugyldig hentedato");
  }
  if (bakery.closedWeekdays.includes(date.getDay())) {
    throw new DomainError(400, "Bakeriet holder stengt denne dagen");
  }
  const earliest = earliestPickupDate(bakery, leadTimeDays, now);
  if (dateStr < earliest) {
    throw new DomainError(
      400,
      `Tidligste mulige hentedag for denne bestillingen er ${earliest}`
    );
  }
  const max = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  max.setDate(max.getDate() + MAX_ORDER_DAYS_AHEAD);
  if (dateStr > toISODate(max)) {
    throw new DomainError(400, "Hentedato kan ikke være mer enn 60 dager frem i tid");
  }
}

/* --------------------------------- orders ---------------------------------- */

function orderShape(row, lineRows) {
  return {
    id: Number(row.id),
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
    totalCents: Number(row.total_cents),
    paymentProvider: row.payment_provider,
    paymentStatus: row.payment_status,
    paymentReference: row.payment_reference,
    createdAt: row.created_at,
    lines: lineRows.map((l) => ({
      id: Number(l.id),
      productId: Number(l.product_id),
      productName: l.product_name,
      qty: Number(l.qty),
      unitPriceCents: Number(l.unit_price_cents),
      lineTotalCents: Number(l.line_total_cents),
      options: JSON.parse(l.options_json),
      cakeText: l.cake_text,
    })),
  };
}

export function getOrder(db, id) {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  if (!row) return null;
  const lines = db
    .prepare("SELECT * FROM order_lines WHERE order_id = ? ORDER BY id")
    .all(id);
  return orderShape(row, lines);
}

export function listOrders(db, { status } = {}) {
  let rows;
  if (status) {
    if (!ORDER_STATUSES.includes(status)) {
      throw new DomainError(400, "Ukjent status");
    }
    rows = db
      .prepare("SELECT * FROM orders WHERE status = ? ORDER BY pickup_date, created_at")
      .all(status);
  } else {
    rows = db.prepare("SELECT * FROM orders ORDER BY pickup_date, created_at").all();
  }
  const allLines = db.prepare("SELECT * FROM order_lines ORDER BY id").all();
  const byOrder = new Map();
  for (const l of allLines) {
    const oid = Number(l.order_id);
    if (!byOrder.has(oid)) byOrder.set(oid, []);
    byOrder.get(oid).push(l);
  }
  return rows.map((r) => orderShape(r, byOrder.get(Number(r.id)) || []));
}

export function setOrderStatus(db, id, status) {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  if (!row) throw new DomainError(404, "Bestillingen finnes ikke");
  if (!ORDER_STATUSES.includes(status)) throw new DomainError(400, "Ukjent status");
  const allowed = STATUS_TRANSITIONS[row.status] || [];
  if (!allowed.includes(status)) {
    throw new DomainError(
      400,
      `Kan ikke endre status fra ${row.status} til ${status}`
    );
  }
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
  return getOrder(db, id);
}

function validCustomer(customer) {
  const c = customer || {};
  const name = String(c.name || "").trim();
  const phone = String(c.phone || "").trim();
  const email = String(c.email || "").trim();
  if (name.length < 2) throw new DomainError(400, "Skriv inn navnet ditt");
  if (phone.replace(/\D/g, "").length < 8) {
    throw new DomainError(400, "Skriv inn et gyldig telefonnummer");
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new DomainError(400, "Skriv inn en gyldig e-postadresse");
  }
  return { name, phone, email };
}

/**
 * Create an order from a cart payload. Recomputes every price from the
 * database (client prices are never trusted), validates pickup rules against
 * the strictest lead time in the cart, charges the payment provider, then
 * inserts the order and its frozen line snapshots in one transaction.
 *
 * payload: { customer: {name, phone, email}, pickupDate, pickupSlot, note?,
 *            lines: [{ productId, qty, optionIds?, cakeText? }] }
 */
export async function createOrder(db, payload, provider, now = new Date()) {
  const bakery = getBakery(db);
  const body = payload || {};
  const customer = validCustomer(body.customer);

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw new DomainError(400, "Handlekurven er tom");
  }
  if (body.lines.length > 30) {
    throw new DomainError(400, "Bestillingen har for mange varelinjer");
  }

  let maxLead = 0;
  let totalCents = 0;
  const lines = [];
  for (const raw of body.lines) {
    const product = getProduct(db, Number(raw.productId));
    if (!product) {
      throw new DomainError(400, "Et av produktene i kurven er ikke tilgjengelig");
    }
    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw new DomainError(400, `Ugyldig antall for ${product.name}`);
    }
    let cakeText = String(raw.cakeText || "").trim();
    if (cakeText && !product.canHaveCakeText) {
      throw new DomainError(400, `${product.name} kan ikke ha tekst`);
    }
    if (cakeText.length > MAX_CAKE_TEXT_LENGTH) {
      throw new DomainError(
        400,
        `Teksten på kaken kan være maks ${MAX_CAKE_TEXT_LENGTH} tegn`
      );
    }
    const chosen = resolveSelection(product, raw.optionIds || []);
    const unit = unitPriceCents(product, chosen, cakeText);
    const lineTotal = unit * qty;
    totalCents += lineTotal;
    maxLead = Math.max(maxLead, product.leadTimeDays);
    lines.push({
      productId: product.id,
      productName: product.name,
      qty,
      unitPriceCents: unit,
      lineTotalCents: lineTotal,
      options: chosen,
      cakeText,
    });
  }

  assertValidPickupDate(bakery, maxLead, body.pickupDate, now);
  const slots = pickupSlots(bakery);
  if (!slots.includes(body.pickupSlot)) {
    throw new DomainError(400, "Velg et gyldig hentetidspunkt");
  }
  const note = String(body.note || "").trim().slice(0, 500);

  // Mock provider resolves immediately; a real provider would put the order
  // in a pending state here and confirm asynchronously instead.
  const payment = await provider.charge({ totalCents, orderDraft: { lines } });
  if (!payment.ok) {
    throw new DomainError(402, "Betalingen ble avvist. Prøv igjen.");
  }

  db.exec("BEGIN");
  try {
    const res = db
      .prepare(
        `INSERT INTO orders (bakery_id, order_number, status, customer_name,
           customer_phone, customer_email, pickup_date, pickup_slot, note,
           total_cents, payment_provider, payment_status, payment_reference)
         VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        bakery.id, `TMP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        customer.name, customer.phone, customer.email,
        body.pickupDate, body.pickupSlot, note,
        totalCents, provider.name, payment.status, payment.reference
      );
    const orderId = Number(res.lastInsertRowid);
    db.prepare("UPDATE orders SET order_number = ? WHERE id = ?").run(
      `B-${1000 + orderId}`, orderId
    );
    const lStmt = db.prepare(
      `INSERT INTO order_lines (order_id, product_id, product_name, qty,
         unit_price_cents, line_total_cents, options_json, cake_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of lines) {
      lStmt.run(
        orderId, l.productId, l.productName, l.qty,
        l.unitPriceCents, l.lineTotalCents,
        JSON.stringify(l.options), l.cakeText
      );
    }
    db.exec("COMMIT");
    return getOrder(db, orderId);
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/* ----------------------------- product admin -------------------------------- */

function validProductPayload(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has("name")) {
    const name = String(body.name || "").trim();
    if (name.length < 2) throw new DomainError(400, "Produktet må ha et navn");
    out.name = name;
  }
  if (!partial || has("basePriceCents")) {
    const p = Number(body.basePriceCents);
    if (!Number.isInteger(p) || p < 0) {
      throw new DomainError(400, "Ugyldig pris");
    }
    out.basePriceCents = p;
  }
  if (has("description")) out.description = String(body.description || "");
  if (has("category")) out.category = String(body.category || "Annet").trim() || "Annet";
  if (has("imageUrl")) out.imageUrl = String(body.imageUrl || "");
  if (has("leadTimeDays")) {
    const d = Number(body.leadTimeDays);
    if (!Number.isInteger(d) || d < 0 || d > 30) {
      throw new DomainError(400, "Ugyldig bestillingsfrist");
    }
    out.leadTimeDays = d;
  }
  if (has("canHaveCakeText")) out.canHaveCakeText = body.canHaveCakeText ? 1 : 0;
  if (has("cakeTextPriceCents")) {
    const p = Number(body.cakeTextPriceCents);
    if (!Number.isInteger(p) || p < 0) throw new DomainError(400, "Ugyldig tekstpris");
    out.cakeTextPriceCents = p;
  }
  if (has("active")) out.active = body.active ? 1 : 0;
  if (has("sortOrder")) out.sortOrder = Number(body.sortOrder) || 0;
  if (has("options")) {
    if (!Array.isArray(body.options)) throw new DomainError(400, "Ugyldige alternativer");
    out.options = body.options.map((o, i) => {
      const group = String(o.groupName || "").trim();
      const value = String(o.valueName || "").trim();
      const delta = Number(o.priceDeltaCents || 0);
      if (!group || !value) {
        throw new DomainError(400, "Alternativer må ha gruppe og navn");
      }
      if (!Number.isInteger(delta)) throw new DomainError(400, "Ugyldig pristillegg");
      return {
        groupName: group,
        valueName: value,
        priceDeltaCents: delta,
        isDefault: o.isDefault ? 1 : 0,
        position: i,
      };
    });
  }
  return out;
}

function replaceOptions(db, productId, options) {
  db.prepare("DELETE FROM product_options WHERE product_id = ?").run(productId);
  const stmt = db.prepare(
    `INSERT INTO product_options (product_id, group_name, value_name,
       price_delta_cents, is_default, position)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const o of options) {
    stmt.run(productId, o.groupName, o.valueName, o.priceDeltaCents, o.isDefault, o.position);
  }
}

export function createProduct(db, body) {
  const bakery = getBakery(db);
  const p = validProductPayload(body);
  db.exec("BEGIN");
  try {
    const res = db
      .prepare(
        `INSERT INTO products (bakery_id, name, description, category, image_url,
           base_price_cents, lead_time_days, can_have_cake_text,
           cake_text_price_cents, active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        bakery.id, p.name, p.description ?? "", p.category ?? "Annet",
        p.imageUrl ?? "", p.basePriceCents, p.leadTimeDays ?? 1,
        p.canHaveCakeText ?? 0, p.cakeTextPriceCents ?? 0,
        p.active ?? 1, p.sortOrder ?? 0
      );
    const id = Number(res.lastInsertRowid);
    if (p.options) replaceOptions(db, id, p.options);
    db.exec("COMMIT");
    return getProduct(db, id, { includeInactive: true });
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function updateProduct(db, id, body) {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!existing) throw new DomainError(404, "Produktet finnes ikke");
  const p = validProductPayload(body, { partial: true });
  const cols = {
    name: "name",
    description: "description",
    category: "category",
    imageUrl: "image_url",
    basePriceCents: "base_price_cents",
    leadTimeDays: "lead_time_days",
    canHaveCakeText: "can_have_cake_text",
    cakeTextPriceCents: "cake_text_price_cents",
    active: "active",
    sortOrder: "sort_order",
  };
  const sets = [];
  const vals = [];
  for (const [k, col] of Object.entries(cols)) {
    if (p[k] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(p[k]);
    }
  }
  db.exec("BEGIN");
  try {
    if (sets.length) {
      db.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
    }
    if (p.options) replaceOptions(db, id, p.options);
    db.exec("COMMIT");
    return getProduct(db, id, { includeInactive: true });
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
