// Adapter that lets the VENDORED, UNMODIFIED Daymaker bakery dashboard
// (bakery-platform/daymaker/**) run against this platform's orders. It speaks
// the exact Daymaker API the dashboard expects, translating each platform
// order into an "assignment" object. Nothing in the dashboard code changes;
// the backend is adapted to fit the frontend, so it is literally the same
// code in a different place.
//
// Shapes mirror the real handlers: snake_case everywhere; the queue list
// returns a scalar `cake_count` (not `cake_items`); the detail returns the
// full assignment; money the dashboard renders is `payout_local_cents` +
// `payout_currency` (here the order total in NOK øre).
import { Router, json } from "express";
import { getBakery, listOrders, getOrder, setOrderStatus, DomainError } from "./domain.js";

// platform order status -> Daymaker assignment status (schema enum).
// A platform order is already paid, so it maps to "accepted" (work the bakery
// has taken on), not "pending" - which also makes it completable in the
// dashboard, whose Done button only enables for accepted/in_production/
// ready/in_transit (uploads.js `completable`). "pending" would be stuck.
const STATUS_MAP = {
  new: "accepted",
  confirmed: "in_production",
  ready: "ready",
  picked_up: "delivered",
  cancelled: "cancelled",
};
// Forward steps the platform's order machine allows, used to walk an order to
// picked_up when the dashboard marks it complete.
const NEXT_STEP = { new: "confirmed", confirmed: "ready", ready: "picked_up" };

function nowISO() {
  return new Date().toISOString();
}

// The seed stores created_at as "YYYY-MM-DD HH:MM:SS" (localtime). new Date()
// parses that acceptably in the browser; normalise to an ISO-ish string.
function toISO(ts) {
  if (!ts) return nowISO();
  const d = new Date(ts.replace(" ", "T"));
  return isNaN(d.getTime()) ? nowISO() : d.toISOString();
}

function parseCity(address) {
  // "Storgata 14, 2000 Lillestrøm" -> "Lillestrøm"
  const tail = String(address || "").split(",").pop().trim();
  const m = tail.match(/^\d{3,4}\s+(.+)$/);
  return m ? m[1] : tail;
}

function openDaysFrom(closedWeekdays) {
  const names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const closed = new Set(closedWeekdays || []);
  return names.filter((_, i) => !closed.has(i)).filter((d) => d !== "sun" || !closed.has(0));
}

function readState(db, id) {
  const row = db.prepare("SELECT assignment_state FROM orders WHERE id = ?").get(id);
  if (!row) return null;
  try {
    return JSON.parse(row.assignment_state || "{}");
  } catch {
    return {};
  }
}

function writeState(db, id, patch) {
  const cur = readState(db, id) || {};
  const next = { ...cur, ...patch };
  db.prepare("UPDATE orders SET assignment_state = ? WHERE id = ?").run(
    JSON.stringify(next),
    id
  );
  return next;
}

function describeOrder(order) {
  return order.lines
    .map((l) => {
      const opts = l.options.map((o) => o.value).filter(Boolean).join(", ");
      const parts = [opts, l.cakeText ? `"${l.cakeText}"` : ""].filter(Boolean).join(", ");
      const label = parts ? `${l.productName} (${parts})` : l.productName;
      return `${l.qty} x ${label}`;
    })
    .join(", ");
}

function bakeryShape(b) {
  return {
    id: String(b.id),
    name: b.name,
    slug: b.slug,
    email: b.email,
    phone: b.phone || null,
    contact_person: null,
    address: b.address || null,
    address_line_2: null,
    city: "",
    region: null,
    postal_code: null,
    country: "NO",
    locale: "nb-NO",
    currency: b.currency || "NOK",
    timezone: "Europe/Oslo",
    default_tax_rate_bp: 0,
    lat: null,
    lng: null,
    // These bakeries run independently (orders are not routed through
    // daymaker.com), so the routing/capacity hero line "city . bakes Mon-Sat
    // . up to N cakes a day" does not apply. Sending no city/open_days/
    // max_daily_deliveries makes the dashboard render an empty hero meta.
    max_daily_deliveries: null,
    lead_time_hours: 24,
    open_days: [],
    cake_prices_cents: {},
    cake_retail_prices_cents: {},
    cake_photos_by_size: {},
    can_edible_print: false,
    website: null,
    offers_square: false,
    is_vc_bakery: false,
    delivery_pricing: null,
    status: "active",
    onboarding_step: "done",
    onboarding_completed_at: nowISO(),
    payout_schedule: "monthly",
    payout_auto_approve: false,
    payout_hold: false,
    description: b.description || "Håndverksbakeri",
    logo_url: "/brand/daymaker-logo.svg",
    created_at: nowISO(),
    updated_at: nowISO(),
    deleted_at: null,
  };
}

function orderToAssignment(order, state, bakery, { detail = false } = {}) {
  const st = state || {};
  const cakeCount = order.lines.reduce((n, l) => n + l.qty, 0);
  const status = STATUS_MAP[order.status] || "pending";
  const completedAt =
    st.completed_at || (order.status === "picked_up" ? toISO(order.createdAt) : null);

  const base = {
    id: String(order.id),
    bakery_id: String(bakery.id),
    recipient_name: order.customer.name,
    recipient_address: `Henting ${st.scheduled_date || order.pickupDate} - ${order.pickupSlot}`,
    recipient_city: "",
    recipient_postal_code: null,
    recipient_lat: null,
    recipient_lng: null,
    recipient_phone: order.customer.phone,
    recipient_email: order.customer.email,
    product_description: describeOrder(order),
    special_instructions: order.note || null,
    source: "manual",
    source_id: null,
    status,
    scheduled_date: st.scheduled_date || order.pickupDate,
    accepted_at: st.accepted_at || toISO(order.createdAt),
    completed_at: completedAt,
    payout_amount_cents: null,
    payout_currency: bakery.currency || "NOK",
    // Independent bakeries are paid by the customer directly (no Daymaker
    // payout/settlement), so no money figure is shown in the dashboard.
    // null (not a number) makes both the queue-row amount and the detail
    // "You invoice us" line render nothing at all.
    payout_local_cents: null,
    bakery_invoice_number: null,
    production_photo_url: st.production_photo_url || null,
    delivery_photo_url: st.delivery_photo_url || null,
    vc_id: null,
    approval_token: null,
    design_upload_url: null,
    qr_url: null,
    cake_size: null,
    cake_message: null,
    campaign_id: null,
    // The queue reads a scalar count; the detail reads the (empty) roster.
    // A platform order is one pickup fulfilment, so it maps to the legacy
    // single-fulfilment path: no per-recipient roster, two order-level photos.
    cake_count: cakeCount,
    cake_items: [],
    order_number: order.orderNumber,
    order_ref: order.orderNumber,
    unread_count: 0,
    created_at: toISO(order.createdAt),
    updated_at: st.updated_at || toISO(order.createdAt),
  };

  if (detail) {
    // Explicit timeline so the detail page shows a clean history.
    base.events = [
      { at: base.created_at, msg: "Order received" },
      st.scheduled_date ? { at: st.updated_at || base.created_at, msg: `Pickup set to ${st.scheduled_date}` } : null,
      st.production_photo_url ? { at: st.updated_at || base.created_at, msg: "Production photo uploaded" } : null,
      st.delivery_photo_url ? { at: st.updated_at || base.created_at, msg: "Delivery photo uploaded" } : null,
      completedAt ? { at: completedAt, msg: "Marked complete" } : null,
    ].filter(Boolean);
  }
  return base;
}

export function createDaymakerApi(db) {
  const api = Router();
  api.use(json({ limit: "12mb" }));

  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof DomainError) {
        res.status(err.status).json({ error: { code: "domain", message: err.message } });
      } else {
        console.error(err);
        res.status(500).json({ error: { code: "internal", message: "Server error" } });
      }
    }
  };

  // Drives the vendored auth.js into its dev_auto_auth branch (no Clerk).
  api.get("/v1/config", (req, res) => res.json({ dev_auto_auth: true }));

  api.get("/v1/bakery/me", wrap(async (req, res) => {
    const b = getBakery(db);
    res.json({
      user: {
        id: "demo-owner",
        email: b.email,
        full_name: b.name,
        role: "bakery_owner",
        avatar_url: null,
      },
      bakery: bakeryShape(b),
      zones: [],
    });
  }));

  // The dashboard reads this for the money KPI and swallows any failure.
  api.get("/v1/bakery/payouts", (req, res) => res.json({ payouts: [], settings: {} }));

  api.get("/v1/bakery/assignments", wrap(async (req, res) => {
    const b = getBakery(db);
    const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
    const rows = db.prepare("SELECT id, assignment_state FROM orders").all();
    const stateById = new Map(rows.map((r) => [Number(r.id), safeParse(r.assignment_state)]));

    let assignments = listOrders(db).map((o) =>
      orderToAssignment(o, stateById.get(o.id), b)
    );
    if (statusFilter && statusFilter !== "all") {
      const inProd = ["accepted", "in_production", "ready", "in_transit"];
      assignments = assignments.filter((a) =>
        statusFilter === "in_production" ? inProd.includes(a.status) : a.status === statusFilter
      );
    }
    const pending_count = assignments.filter((a) => a.status === "pending").length;
    res.json({ assignments, pending_count });
  }));

  api.get("/v1/bakery/assignments/:id", wrap(async (req, res) => {
    const b = getBakery(db);
    const order = getOrder(db, Number(req.params.id));
    if (!order) return notFound(res);
    res.json({ assignment: orderToAssignment(order, readState(db, order.id), b, { detail: true }) });
  }));

  // Mark complete: walk the platform order forward to picked_up, then return
  // the assignment as delivered. Lenient on photos - the dashboard already
  // gates its Done button until the order-level photos are uploaded.
  api.post("/v1/bakery/assignments/:id/complete", wrap(async (req, res) => {
    const b = getBakery(db);
    const id = Number(req.params.id);
    let order = getOrder(db, id);
    if (!order) return notFound(res);
    if (order.status === "cancelled") {
      return res.status(409).json({ error: { code: "conflict", message: "Order is cancelled" } });
    }
    let guard = 0;
    while (order.status !== "picked_up" && NEXT_STEP[order.status] && guard++ < 5) {
      setOrderStatus(db, id, NEXT_STEP[order.status]);
      order = getOrder(db, id);
    }
    writeState(db, id, { completed_at: nowISO(), updated_at: nowISO() });
    res.json({ assignment: orderToAssignment(order, readState(db, id), b, { detail: true }) });
  }));

  api.post("/v1/bakery/assignments/:id/delivery-date", wrap(async (req, res) => {
    const b = getBakery(db);
    const id = Number(req.params.id);
    const order = getOrder(db, id);
    if (!order) return notFound(res);
    const date = String(req.body?.delivery_date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: { code: "validation_error", message: "Bad date" } });
    }
    writeState(db, id, { scheduled_date: date, updated_at: nowISO() });
    res.json({ assignment: orderToAssignment(order, readState(db, id), b, { detail: true }) });
  }));

  // Photo upload: the dashboard posts bytes inline as base64. We keep them as
  // data URLs in assignment_state so nothing needs a blob store. kind "cake"
  // is the production photo, "delivery" is the proof-of-delivery photo.
  api.post("/v1/bakery/assignments/:id/photo", wrap(async (req, res) => {
    const b = getBakery(db);
    const id = Number(req.params.id);
    const order = getOrder(db, id);
    if (!order) return notFound(res);
    const { kind, content_type, data_base64 } = req.body || {};
    // "cake"/"production" are the finished-cake photo (per-cake vs legacy
    // assignment-level); "delivery" is the drop-off proof.
    const isProduction = kind === "cake" || kind === "production";
    const isDelivery = kind === "delivery";
    if (!data_base64 || (!isProduction && !isDelivery)) {
      return res.status(400).json({ error: { code: "validation_error", message: "Bad upload" } });
    }
    const url = `data:${content_type || "image/jpeg"};base64,${data_base64}`;
    const field = isProduction ? "production_photo_url" : "delivery_photo_url";
    writeState(db, id, { [field]: url, updated_at: nowISO() });
    res.json({ assignment: orderToAssignment(order, readState(db, id), b, { detail: true }) });
  }));

  // Empty-roster orders never call these, but keep them safe no-ops.
  api.post("/v1/bakery/assignments/:id/cake-items/:cid/mark-unsuccessful", wrap(async (req, res) => {
    const b = getBakery(db);
    const order = getOrder(db, Number(req.params.id));
    if (!order) return notFound(res);
    res.json({ assignment: orderToAssignment(order, readState(db, order.id), b, { detail: true }) });
  }));
  api.post("/v1/bakery/assignments/:id/cake-items/:cid/undo-unsuccessful", wrap(async (req, res) => {
    const b = getBakery(db);
    const order = getOrder(db, Number(req.params.id));
    if (!order) return notFound(res);
    res.json({ assignment: orderToAssignment(order, readState(db, order.id), b, { detail: true }) });
  }));

  return api;
}

function safeParse(s) {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}
function notFound(res) {
  return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
}
