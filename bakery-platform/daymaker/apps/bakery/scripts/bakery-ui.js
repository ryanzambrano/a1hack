/**
 * Bakery UI primitives — one status vocabulary for the whole surface.
 *
 * Before this the bakery surface carried eleven chip classes
 * (`.status-pill`, `.source-badge`, `.apply-badge`, `.needs-eta-badge`,
 * `.order-card__unread`, `.package-card__badge`, `.filter-chip`,
 * `.open-day-chip`, `.profile-nudge__chip`, `.zone-simple__band`,
 * `.bakery-vc-queue__chip`) that disagreed on radius, casing, border
 * weight and tilt — and `.status-pill` / `.source-badge` were each
 * declared twice, in bakery.css AND orders.css, with different specs. On
 * /bakery/vc-orders/:id both files load, so which one won was a cascade
 * accident rather than a decision.
 *
 * Severity was also inverted, exactly as it had been on /admin:
 * `in_production` painted in full brand red while `failed` was pale pink.
 *
 * Rules encoded here:
 *   - red means "this needs you now", or danger. Never a healthy state.
 *   - amber means the bakery is the blocker.
 *   - blue means acknowledged and moving (accepted, baking, in transit).
 *   - green is terminal-good only.
 *   - raw enum values never reach the screen.
 */

import { escape } from "/scripts/api.js";

/** status -> tone. Anything unmapped renders neutral, never red. */
export const STATUS_TONE = {
  // nothing has happened yet
  pending: "neutral",
  pending_manual: "neutral",
  draft: "neutral",
  scheduled: "neutral",

  // the bakery is the blocker
  pending_bakery: "warn",
  needs_date: "warn",
  needs_photos: "warn",

  // acknowledged and moving. NOT red — this was the inverted-severity bug.
  accepted: "info",
  confirmed: "info",
  in_production: "info",
  baking: "info",
  in_transit: "info",
  out_for_delivery: "info",

  // terminal good
  active: "good",
  ready: "good",
  ready_for_pickup: "good",
  delivered: "good",
  complete: "good",
  completed: "good",

  // terminal bad
  failed: "bad",
  delivery_failed: "bad",
  cancelled: "bad",
  canceled: "bad",
  refunded: "bad",
  rejected: "bad",
  unsuccessful: "bad",
};

/**
 * Bakery-facing labels. These deliberately differ from the admin console's:
 * a bakery owner reads "Baking", not "In production", and "Waiting on you"
 * is more useful than the enum's "Pending bakery".
 */
const STATUS_LABEL = {
  pending: "Not started",
  pending_bakery: "Waiting on you",
  pending_manual: "With Daymaker",
  accepted: "Accepted",
  confirmed: "Confirmed",
  in_production: "Baking",
  baking: "Baking",
  ready: "Ready",
  ready_for_pickup: "Ready",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  // The terminal-good status reads "Complete", not "Delivered": an order
  // whose every cake was marked unsuccessful still has to be closed out,
  // and the bakery shouldn't have to claim a delivery to do it.
  delivered: "Complete",
  failed: "Failed",
  delivery_failed: "Delivery failed",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  refunded: "Refunded",
  unsuccessful: "Unsuccessful",
};

/** snake_case / SCREAMING_CASE -> "Sentence case". */
export function humanise(s) {
  if (s == null) return "";
  const raw = String(s).trim();
  if (!raw) return "";
  const words = raw.replace(/[_-]+/g, " ").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function statusTone(status) {
  return STATUS_TONE[String(status || "").toLowerCase()] || "neutral";
}

export function statusText(status) {
  const key = String(status || "").toLowerCase();
  return STATUS_LABEL[key] || humanise(key);
}

/**
 * The one chip. `tone` is neutral | info | warn | good | bad | action.
 * `action` is the only red variant and is reserved for "we need something
 * from you now" — it uses --dm-accent-deep so white text clears AA.
 */
export function chip(label, tone = "neutral", opts = {}) {
  if (label == null || label === "") return "";
  const cls = ["chip", `chip--${tone}`];
  if (opts.dot) cls.push("chip--dot");
  if (opts.outline) cls.push("chip--outline");
  if (opts.className) cls.push(opts.className);
  const title = opts.title ? ` title="${escape(opts.title)}"` : "";
  const dot = opts.dot ? '<span class="chip__dot" aria-hidden="true"></span>' : "";
  return `<span class="${cls.join(" ")}"${title}>${dot}${escape(label)}</span>`;
}

/** Convenience: chip straight from a status enum. */
export function statusChip(status, opts = {}) {
  if (!status) return "";
  return chip(statusText(status), statusTone(status), {
    ...opts,
    className: `chip--status${opts.className ? " " + opts.className : ""}`,
  });
}

/**
 * A quiet outline chip for provenance (campaign / VC / manual). This used
 * to be `.source-badge` in two colours of wash; source is context, not
 * status, so it must not compete with the status chip beside it.
 */
export function sourceChip(source) {
  const key = String(source || "").toLowerCase();
  if (!key || key === "manual") return "";
  const label = key === "vc" ? "VC" : humanise(key);
  return chip(label, "neutral", { outline: true, className: "chip--source" });
}

/**
 * Money, formatted from cents, tabular and never fractional-cent noisy.
 * The queue compares these down a column, so the currency symbol and the
 * digits have to be stable.
 *
 * Pinned to en-US, not the viewer's locale, so the currency is never
 * ambiguous: en-CA renders CAD as a bare "$72", which reads as US dollars
 * to anyone comparing a payout against an invoice. en-US gives
 * "CA$72" / "NOK 1,350" / "£157.50" — the surface is English-only anyway
 * (see CLAUDE.md), so this costs nothing.
 */
export function money(cents, currency = "USD") {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      // Both bounds move together, or £157.50 renders as "£157.5" - an
      // invoice line missing a digit.
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

/**
 * "—" rather than a silently blank cell. The done screen used to render
 * `escape(b.email)` into a labelled row that came back empty while a
 * sibling row rendered "-" from fmtDate; there was no convention.
 */
export function orDash(v) {
  if (v == null) return "—";
  const s = String(v).trim();
  return s === "" ? "—" : s;
}
