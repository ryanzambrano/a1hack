// Two order kinds, ONE page.
//
// /bakery/assignments/:id (campaign + manual orders) and /bakery/vc-orders/:id
// (Cocola's VC cakes) used to be two separate pages built from two separate
// module trees that had drifted into two different designs. They are now the
// same markup rendered by the same modules; everything that genuinely differs
// between them lives in this file:
//
//   · where the order is fetched, and how its payload becomes the ONE view
//     model every renderer consumes (assignment shape, snake_case, cake_items)
//   · which endpoints a photo upload / completion / delivery-date change hit
//   · which optional pieces of the page exist at all (capability flags)
//
// If you are ever tempted to branch on "is this a VC order?" inside a
// renderer, add a capability flag here instead.
//
// The two real differences, per product:
//   1. a VC order's "Cake design" cell shows the QR code that gets printed
//      on the cake, instead of an uploaded design image
//   2. a VC order has no customer messaging

import { authedFetch } from "/scripts/api.js";
import { state } from "./core.js?v=20260729unified2";

// ─── VC vocabulary → the assignment vocabulary the renderers speak ──────

const VC_STATUS = {
  pending: "pending",
  pending_bakery: "pending",
  pending_manual: "pending",
  confirmed: "accepted",
  baking: "in_production",
  ready_for_pickup: "ready",
  in_transit: "in_transit",
  delivered: "delivered",
  delivery_failed: "failed",
  cancelled: "cancelled",
  refunded: "cancelled",
};

// What the BAKERY needs to read is the size, in the same words a campaign
// order uses ('8" round'). "Classic" is the customer-facing product name on
// the VC storefront and means nothing at an oven. `classic` is the only size
// the VC checkout will accept (SIZE_VALUES in api/_handlers/v1/vc/orders.ts);
// legacy rows can still carry deluxe/party, and those fall through to the raw
// value rather than a guessed measurement.
const VC_SIZE_LABEL = { classic: '8" round' };

// Same labels the VC page always used, minus the emoji column - History is
// one shared component now, and it renders a timeline dot rather than a
// picture per row.
const VC_EVENT_LABEL = {
  routed: "Routed to your bakery",
  routing_failed: "Routing failed",
  accepted_by_bakery: "Order received",
  declined_by_bakery: "Declined",
  production_photo_uploaded: "Cake photo uploaded",
  ready_for_pickup: "Marked ready for pickup",
  added_to_route: "Added to a route",
  delivery_date_changed: "Delivery date updated",
  in_transit: "Out for delivery",
  delivered: "Marked complete",
  delivery_failed: "Delivery failed",
  refunded: "Refunded",
  refund_requested: "Refund requested",
  manually_assigned: "Admin reassigned",
  admin_status_change: "Admin status change",
  note_added: "Note added",
};

// Buyer-side payment events the bakery doesn't need on their timeline.
const VC_HIDDEN_EVENTS = new Set([
  "created",
  "paid",
  "checkout_session_created",
  "checkout_session_recreated",
]);

/** The QR image the bakery prints on the cake, rendered at `px` square. */
export function qrImageUrl(target, px) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${px}x${px}&margin=2&data=${encodeURIComponent(target)}`;
}

/** Thread the admin `?as=<bakery_id>` shadow param onto an API call. */
function withShadow(url) {
  const as = new URL(window.location.href).searchParams.get("as");
  if (!as) return url;
  return `${url}${url.includes("?") ? "&" : "?"}as=${encodeURIComponent(as)}`;
}

// ─── The assignment page ────────────────────────────────────────────────

const assignmentBase = () =>
  `/api/v1/bakery/assignments/${encodeURIComponent(state.id)}`;

export const assignmentSource = {
  kind: "assignment",
  // Capabilities. Everything true here is the behaviour this page already had.
  chat: true,
  markUnsuccessful: true,
  recipients: true,
  productionTickets: true,
  insertCard: false,
  // A campaign order has a customer on the other end who gets emailed an ETA.
  notifiesOnDateChange: (a) => a.source === "campaign",

  idFromUrl: () => "/bakery/assignments",

  async load() {
    const data = await authedFetch(assignmentBase());
    return data.assignment;
  },

  /** Base64 JSON POST - the assignment photo endpoint takes the bytes inline. */
  async uploadPhoto({ blob, filename, contentType, kind, cakeId }) {
    const body = {
      kind,
      filename,
      content_type: contentType,
      data_base64: await blobToBase64(blob),
    };
    if (cakeId) body.cake_item_id = cakeId;
    await authedFetch(`${assignmentBase()}/photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async complete() {
    await authedFetch(`${assignmentBase()}/complete`, { method: "POST" });
  },

  async setDeliveryDate(date) {
    await authedFetch(`${assignmentBase()}/delivery-date`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delivery_date: date }),
    });
  },
};

// ─── The VC order page ──────────────────────────────────────────────────

const vcBase = (suffix = "") =>
  withShadow(`/api/v1/bakery/vc-orders/${encodeURIComponent(state.id)}${suffix}`);

export const vcSource = {
  kind: "vc",
  // The two product differences, as flags.
  chat: false,
  insertCard: true,
  // No per-cake-item endpoint on a VC order, and one cake means the whole
  // order would be the thing marked unsuccessful - admin's call, not the
  // bakery's.
  markUnsuccessful: false,
  // One recipient, already named in the cakes table; a separate one-row
  // "Recipients" table with a CSV download would be filler.
  recipients: false,
  productionTickets: true,
  // The VC delivery-date endpoint saves the date and does not email anyone,
  // so the button must not promise that it does.
  notifiesOnDateChange: () => false,

  idFromUrl: () => "/bakery/vc-orders",

  async load() {
    const data = await authedFetch(vcBase());
    return vcToViewModel(data.data || {});
  },

  /**
   * Client-side blob upload: sign, PUT straight to blob storage, then attach
   * the resulting URL to the order. (The assignment endpoint takes bytes
   * inline instead; this one does not.)
   */
  async uploadPhoto({ blob, filename, contentType, kind }) {
    await window.bakeryPlatformAuth.ready;
    const token = await window.bakeryPlatformAuth.getToken();
    if (!token) throw Object.assign(new Error("Sign in required"), { code: "unauthenticated" });

    const isDelivery = kind === "delivery";
    const folder = isDelivery ? "delivery-proof" : "production-photo";
    const clientKind = isDelivery ? "delivery-proof" : "production-photo";
    const ext =
      (String(filename).split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const pathname = `${folder}/${state.id}/${crypto.randomUUID()}.${ext}`;

    const signRes = await fetch("/api/v1/uploads/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: {
          pathname,
          callbackUrl: `${window.location.origin}/api/v1/uploads/sign`,
          clientPayload: JSON.stringify({ kind: clientKind, scopeId: state.id }),
          multipart: false,
        },
      }),
    });
    if (!signRes.ok) {
      let envelope = null;
      try { envelope = await signRes.json(); } catch { /* not json */ }
      throw new Error(envelope?.error?.message || `Sign failed (HTTP ${signRes.status})`);
    }
    const clientToken = (await signRes.json())?.clientToken;
    if (!clientToken) throw new Error("Sign response missing clientToken.");

    const { put: blobPut } = await import("https://esm.sh/@vercel/blob@2/client");
    const put = await blobPut(pathname, blob, {
      access: "public",
      token: clientToken,
      contentType: contentType || "application/octet-stream",
    });
    if (!put?.url) throw new Error("Upload returned no URL.");

    await authedFetch(vcBase(isDelivery ? "/delivery-photo" : "/production-photo"), {
      method: "POST",
      body: JSON.stringify({ asset_url: put.url }),
    });
  },

  async complete() {
    await authedFetch(vcBase("/complete"), { method: "POST" });
  },

  async setDeliveryDate(date) {
    await authedFetch(vcBase("/delivery-date"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delivery_date: date }),
    });
  },
};

/**
 * The VC payload (camelCase, `data.{order,events,photos}`, one cake, photos
 * in a side array) reshaped into the assignment view model the renderers
 * consume. Everything downstream of here is genuinely shared code.
 */
function vcToViewModel(payload) {
  const o = payload.order || {};
  const photos = Array.isArray(payload.photos) ? payload.photos : [];
  const events = Array.isArray(payload.events) ? payload.events : [];
  const pick = (kind) => photos.find((p) => p.kind === kind)?.url || null;
  // Legacy rows store a full timestamp in the date column.
  const scheduled = o.scheduledDeliveryDate
    ? String(o.scheduledDeliveryDate).slice(0, 10)
    : null;

  return {
    id: o.id,
    status: VC_STATUS[o.status] || o.status,
    source: "vc",
    scheduled_date: scheduled,
    // The reference the bakery quotes back to us. Shown in the page header
    // in place of the assignment's short uuid.
    order_ref: o.orderNumber || null,
    recipient_name: o.recipientName || null,
    recipient_address: o.recipientAddress || null,
    recipient_email: o.recipientEmail || null,
    recipient_phone: o.recipientPhone || null,
    // No campaign customer on a VC order - the recipient IS the founder.
    customer_name: o.recipientName || null,
    customer_email: o.recipientEmail || null,
    customer_phone: o.recipientPhone || null,
    payout_local_cents:
      typeof o.bakeryPayoutCents === "number" ? o.bakeryPayoutCents : null,
    payout_currency: o.bakeryPayoutCurrency || "USD",
    special_instructions: o.bakeryNotes || null,
    // ONE cake. Its "design" is the QR that gets printed on it.
    cake_items: [
      {
        id: o.id,
        recipient_name: o.recipientName || null,
        recipient_address: o.recipientAddress || null,
        recipient_email: o.recipientEmail || null,
        recipient_phone: o.recipientPhone || null,
        cake_label: VC_SIZE_LABEL[o.size] || o.size || "Cake",
        // Square frame, always: a round mask would clip the QR's corners.
        cake_shape: "square",
        // THE difference: a QR image where a campaign cake carries a print.
        cake_image_url: o.qrUrl ? qrImageUrl(o.qrUrl, 640) : null,
        qr_target: o.qrUrl || null,
        design_file_url: o.designUploadUrl || null,
        // NOTHING gets printed on a VC cake. What goes on it is the QR in
        // cake_image_url above; `order.message` is the buyer's note to the
        // founder and belongs nowhere near the bakery's print instructions.
        cake_design_text: null,
        cake_notes: null,
        // A VC cake's card is the Daymaker insert card carrying this order's
        // QR. It renders in the Card column exactly like a campaign card:
        // insert-card.js rasterises the card and fills card_image_url in, so
        // nothing downstream needs to know a VC card is special.
        card_enabled: !!o.qrUrl,
        // Generated, not uploaded: there is no front/back PDF to compose and
        // no branded reverse - the whole card IS the Daymaker card.
        card_generated: !!o.qrUrl,
        card_message: null,
        card_image_url: null,
        cake_photo_url: pick("production"),
        delivery_photo_url: pick("delivery"),
        status: o.status === "delivery_failed" ? "failed" : "assigned",
      },
    ],
    // Pre-shaped timeline: the assignment page derives its History from
    // timestamps on the row, a VC order has a real events table. Both end up
    // as [{at, msg}] so renderEvents stays one function.
    events: events
      .filter((e) => !VC_HIDDEN_EVENTS.has(e.eventType))
      .map((e) => ({
        at: e.at,
        msg: VC_EVENT_LABEL[e.eventType] || String(e.eventType).replace(/_/g, " "),
      })),
    // Carried through for the insert card (VC-only).
    qr_url: o.qrUrl || null,
    vc_greeting: o.insertGreeting || null,
    vc_message: o.insertMessage || null,
  };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Read failed"));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const idx = dataUrl.indexOf(",");
      resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
    };
    reader.readAsDataURL(blob);
  });
}
