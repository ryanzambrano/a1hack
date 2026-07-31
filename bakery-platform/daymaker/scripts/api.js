// Shared authed fetch helper.

export async function authedFetch(url, opts = {}) {
  await window.bakeryPlatformAuth.ready;
  const token = await window.bakeryPlatformAuth.getToken();
  const headers = new Headers(opts.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (opts.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...opts, headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-json
  }
  if (!res.ok) {
    const code = body?.error?.code || "http_" + res.status;
    const message = body?.error?.message || res.statusText || "Request failed";
    const err = new Error(message);
    err.code = code;
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function escape(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Return an HTML-attribute-safe URL string IF AND ONLY IF the input is
 * an absolute http(s) URL. Anything else (javascript:, data:, vbscript:,
 * relative, malformed) becomes an empty string, which produces a benign
 * `<a href="">` that the browser treats as a same-page link instead of
 * executing an XSS payload.
 *
 * Use this any time we render a user-controlled URL into an href / src
 * attribute. We can't fix this at the persistence layer alone because
 * (1) historical rows may already contain bad URLs and (2) some URLs
 * are sourced from third-party APIs (Mapbox, Stripe) where the schema
 * isn't ours to constrain.
 */
export function safeHref(s) {
  if (s == null) return "";
  const raw = String(s).trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    // Re-encode via escape() so any reserved chars in path/query are
    // attribute-safe.
    return escape(u.href);
  } catch {
    return "";
  }
}

export function statusLabel(s) {
  return ({
    // bakery_platform.assignments statuses
    pending: "Pending",
    accepted: "Accepted",
    in_production: "In production",
    ready: "Ready",
    in_transit: "In transit",
    delivered: "Delivered",
    failed: "Failed",
    cancelled: "Cancelled",
    // coldcaked.orders statuses (VC cakes) — keep the same labels we
    // surface elsewhere so a unified admin table reads consistently.
    pending_bakery: "Pending bakery",
    pending_manual: "Manual queue",
    confirmed: "Confirmed",
    baking: "Baking",
    ready_for_pickup: "Ready",
    delivery_failed: "Delivery failed",
    refunded: "Refunded",
  })[s] || s;
}

export function showError(msg) {
  console.error(msg);
  alert(msg);
}

/**
 * Extract a resource ID from a pretty URL like /admin/bakeries/<uuid>
 * or /bakery/assignments/<uuid>. Falls back to ?id=<uuid> query string
 * for compatibility. Returns null if neither is present.
 *
 * Vercel rewrites the pretty URL to the underlying ?id= internally but
 * the browser's window.location keeps the pretty form, so we have to
 * parse the path.
 */
export function readIdFromUrl(prefix) {
  const url = new URL(window.location.href);
  if (prefix) {
    // prefix like "/admin/bakeries" - the id is the next path segment.
    const re = new RegExp("^" + prefix.replace(/\/+$/, "") + "/([^/]+)");
    const m = url.pathname.match(re);
    if (m) return decodeURIComponent(m[1]);
  }
  // Generic: last non-empty segment after prefix-less paths.
  const segments = url.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  // Heuristic: last segment looks like a UUID or non-keyword.
  if (last && /^[0-9a-f-]{8,}$/i.test(last)) return last;
  return url.searchParams.get("id");
}
