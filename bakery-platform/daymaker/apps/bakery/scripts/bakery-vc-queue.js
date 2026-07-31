/**
 * Cocola-only VC queue. Activated by bakery-dashboard.js when the signed-in
 * bakery has `is_vc_bakery === true`. Otherwise the section stays hidden
 * and this module is a no-op — every other bakery (Just Cakes, AnnTremet,
 * etc.) sees the dashboard exactly as before.
 *
 * Mirrors the original coldcaked-lp /bakery view at full feature parity:
 *   - Stat cards (active / delivered today)
 *   - Filter chips (all / pending / delivered)
 *   - Quick search (order #, recipient name, address, icing message)
 *   - Batch grouping: orders sharing a batch_id render as a "package" card
 *     with sub-rows + shared QR / insert-card downloads (1 PNG, print N)
 *   - Apply-flow pill: "⏰ Ships Thu Mar 12" on rows where the VC requires
 *     application
 *   - Per-row Cancel button (status-aware)
 *   - Live polling (20s base, backs off to 60s when quiet, paused on tab hide)
 *   - Invoice mailto button pre-filling Coldcaked ops
 *
 * All API calls go through /api/v1/bakery/vc-orders — the new Cocola-facing
 * surface the founder-facing /api/v1/orders does NOT contaminate.
 */

import { authedFetch, escape } from "/scripts/api.js";

const POLL_MS = 20_000;
const POLL_MAX_MS = 60_000;

const SIZE_LABEL = { classic: "Classic", deluxe: "Deluxe", party: "Party" };
const STATUS_LABEL = {
  pending: "Pending payment",
  pending_bakery: "Pending",
  pending_manual: "Manual queue",
  confirmed: "Pending",
  baking: "Baking",
  ready_for_pickup: "Ready",
  in_transit: "Out for delivery",
  delivered: "Complete",
  delivery_failed: "Delivery failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

// Active = still owes the bakery work. Same set the original LP used.
const ACTIVE_STATUSES = new Set([
  "confirmed",
  "baking",
  "ready_for_pickup",
  "in_transit",
]);

let started = false;
const state = {
  orders: [],
  filter: "all",
  query: "",
  pollTimer: null,
  pollMs: POLL_MS,
  lastSig: null,
  me: null,
  /** Set by the dashboard so the nav badge can follow this queue's own poll. */
  onPendingCount: null,
  /** When admin is shadowing into Cocola via `?as=<bakery_id>` the
   *  dashboard's main code propagates that into every call we make so the
   *  backend scopes to the impersonated bakery, not the admin's own. */
  asId: null,
};

const $ = (id) => document.getElementById(id);

function withAs(url) {
  if (!state.asId) return url;
  const u = new URL(url, window.location.origin);
  if (!u.searchParams.has("as")) u.searchParams.set("as", state.asId);
  return u.pathname + u.search;
}

function fmtCents(cents) {
  if (typeof cents !== "number") return "-";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

function fmtRelative(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.floor(hr / 24);
  return `${day} d ago`;
}

/** Apply-flow date stamp. Postgres DATE columns ship as ISO timestamps via
 *  neon-http so we strip out the YYYY-MM-DD prefix and build a local-time
 *  Date — keeps the weekday the same as what the server stamped regardless
 *  of the browser's timezone. */
function fmtApplyDate(ymd) {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd));
  if (!m) return ymd;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(dt.getTime())) return ymd;
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function applyBadgeHtml(order) {
  if (!order?.vc_requires_application) return "";
  const dateLabel = order.scheduled_delivery_date
    ? fmtApplyDate(order.scheduled_delivery_date)
    : null;
  const text = dateLabel ? `⏰ Ships ${dateLabel}` : "⏰ Fixed date";
  const title = dateLabel
    ? `Scheduled for ${order.scheduled_delivery_date}`
    : "Apply-flow VC, fixed delivery date";
  return `<span class="apply-badge" title="${escape(title)}">${escape(text)}</span>`;
}

function ctaFor(status) {
  switch (status) {
    case "pending_bakery":   return "open →";
    case "confirmed":        return "snap cake photo →";
    case "baking":           return "snap cake photo →";
    case "ready_for_pickup": return "deliver + snap →";
    case "in_transit":       return "deliver + snap →";
    default:                 return "view →";
  }
}

function truncate(s, n) {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ─── Render ───────────────────────────────────────────────────

function renderStats(orders) {
  const buckets = { active: 0, delivered_today: 0 };
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  for (const o of orders) {
    if (ACTIVE_STATUSES.has(o.status)) buckets.active++;
    else if (o.status === "delivered" && o.delivered_at) {
      const d = new Date(o.delivered_at);
      if (!isNaN(d.getTime()) && d >= todayStart) buckets.delivered_today++;
    }
  }
  document.querySelectorAll("[data-vc-stat]").forEach((card) => {
    const key = card.dataset.vcStat;
    const n = buckets[key] ?? 0;
    const el = card.querySelector("[data-count]");
    if (el) el.textContent = String(n);
  });

  const statusLine = $("vc-status-line");
  if (statusLine) {
    if (buckets.active > 0) {
      statusLine.textContent =
        buckets.active === 1
          ? "one VC cake on the docket. let's go."
          : `${buckets.active} VC cakes on the docket. let's go.`;
    } else if (buckets.delivered_today > 0) {
      statusLine.textContent =
        buckets.delivered_today === 1
          ? "one VC drop done today. enjoy the quiet."
          : `${buckets.delivered_today} VC drops done today.`;
    } else {
      statusLine.textContent = "VC queue is empty. enjoy the quiet.";
    }
  }
}

/**
 * Statuses that count as "still on the bakery's plate". Shared by the Pending
 * filter and the nav badge so the corner count and the list can never disagree
 * about what open work means.
 */
const PENDING_STATUSES = [
  "confirmed",
  "baking",
  "ready_for_pickup",
  "in_transit",
  "pending_bakery",
];

export function countVcPending(orders) {
  return (orders || []).filter((o) => PENDING_STATUSES.includes(o.status)).length;
}

function filterOrders(orders, filter) {
  if (filter === "all") return orders;
  if (filter === "pending") {
    return orders.filter((o) => PENDING_STATUSES.includes(o.status));
  }
  if (filter === "delivered") {
    return orders.filter((o) => o.status === "delivered");
  }
  return orders.filter((o) => o.status === filter);
}

function applyQuery(orders, rawQuery) {
  const q = (rawQuery || "").trim().toLowerCase();
  if (!q) return orders;
  return orders.filter((o) => {
    const hay = [o.order_number, o.recipient_name, o.recipient_address, o.message]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Group orders by batch_id. Single-VC orders get a `__solo_<id>` synthetic
 *  key so they still render as a normal card. */
function groupByBatch(orders) {
  const map = new Map();
  for (const o of orders) {
    const key = o.batch_id || `__solo_${o.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(o);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.map((o) => o.created_at || "").sort().at(-1);
    const tb = b.map((o) => o.created_at || "").sort().at(-1);
    return (tb || "").localeCompare(ta || "");
  });
}

function orderCardHtml(o) {
  const sizeLabel = SIZE_LABEL[o.size] || o.size;
  const statusLabel = STATUS_LABEL[o.status] || o.status;
  // Cancel was removed — VC orders are paid up-front via Stripe so the
  // bakery shouldn't be able to release them back to the queue. If
  // something genuinely goes wrong the bakery contacts admin.
  const isApply = !!o.vc_requires_application;
  // Public rewrite: vercel.json maps /bakery/vc-orders/:id → /apps/bakery/bakery-assignment?id=:id
  // Thread the admin shadow id through so /api/v1/bakery/vc-orders/:id
  // tenant-guards against the impersonated bakery, not the admin's own.
  const detailHref = state.asId
    ? `/bakery/vc-orders/${encodeURIComponent(o.id)}?as=${encodeURIComponent(state.asId)}`
    : `/bakery/vc-orders/${encodeURIComponent(o.id)}`;
  return `
    <li class="order-card-wrap${isApply ? " order-card-wrap--apply" : ""}">
      <a class="order-card${isApply ? " order-card--apply" : ""}" href="${detailHref}">
        <header class="order-card__head">
          <span class="order-card__num">${escape(o.order_number)}</span>
          <span class="status-pill" data-status="${escape(o.status)}">${escape(statusLabel)}</span>
          ${applyBadgeHtml(o)}
          <span class="order-card__time">${escape(fmtRelative(o.created_at))}</span>
        </header>
        <div class="order-card__body">
          <div>
            <div class="order-card__recipient">${escape(o.recipient_name || "-")}</div>
            <div class="order-card__address">${escape(o.recipient_address || "")}</div>
          </div>
          <div class="order-card__product">
            <strong>${escape(sizeLabel)}</strong> cake${o.message ? ` · message: "${escape(truncate(o.message, 40))}"` : ""}
          </div>
        </div>
        <footer class="order-card__footer">
          <span class="order-card__payout">${fmtCents(o.bakery_payout_cents)} to invoice</span>
          <span class="order-card__cta">${ctaFor(o.status)}</span>
        </footer>
      </a>
    </li>
  `;
}

function packageCardHtml(orders) {
  const count = orders.length;
  const totalPayout = orders.reduce(
    (n, o) => n + (o.bakery_payout_cents || 0),
    0,
  );
  const oldestCreated = orders.map((o) => o.created_at || "").sort()[0];
  const subRows = orders
    .map((o) => {
      const sizeLabel = SIZE_LABEL[o.size] || o.size;
      const statusLabel = STATUS_LABEL[o.status] || o.status;
      const isApply = !!o.vc_requires_application;
      const detailHref = state.asId
        ? `/bakery/vc-orders/${encodeURIComponent(o.id)}?as=${encodeURIComponent(state.asId)}`
        : `/bakery/vc-orders/${encodeURIComponent(o.id)}`;
      return `
        <li class="package-card__row${isApply ? " package-card__row--apply" : ""}">
          <a class="package-card__row-link" href="${detailHref}">
            <span class="package-card__num">${escape(o.order_number)}</span>
            <span class="package-card__recipient">
              <strong>${escape(o.recipient_name || "-")}</strong>
              <span class="package-card__addr">${escape(o.recipient_address || "")}</span>
            </span>
            ${applyBadgeHtml(o)}
            <span class="status-pill" data-status="${escape(o.status)}">${escape(statusLabel)}</span>
            <span class="package-card__size">${escape(sizeLabel)}</span>
          </a>
        </li>
      `;
    })
    .join("");
  const sharedQrUrl = orders.find((o) => o.qr_url)?.qr_url || null;
  const batchOrderNum = `BATCH-${count}`;
  const qrButtonHtml = sharedQrUrl
    ? `<button type="button" class="package-card__qr-download"
          data-qr-url="${escape(sharedQrUrl)}"
          data-order-num="${escape(batchOrderNum)}">
         ⬇ Download QR (print ${count} copies)
       </button>`
    : "";
  const batchIsApply = !!orders[0]?.vc_requires_application;
  const cardButtonHtml = sharedQrUrl
    ? `<button type="button" class="package-card__card-download"
          data-qr-url="${escape(sharedQrUrl)}"
          data-order-num="${escape(batchOrderNum)}"
          data-apply="${batchIsApply ? "1" : "0"}">
         ⬇ Download card (print ${count} copies)
       </button>`
    : "";
  return `
    <li class="order-card-wrap order-card-wrap--package">
      <article class="package-card">
        <header class="package-card__head">
          <span class="package-card__badge">📦 Package</span>
          <span class="package-card__count">${count} cake${count === 1 ? "" : "s"} · same QR and card</span>
          <span class="package-card__time">${escape(fmtRelative(oldestCreated))}</span>
        </header>
        <div class="package-card__downloads">
          ${qrButtonHtml}
          ${cardButtonHtml}
        </div>
        <ul class="package-card__rows">${subRows}</ul>
        <footer class="package-card__footer">
          <span>${fmtCents(totalPayout)} total to invoice</span>
        </footer>
      </article>
    </li>
  `;
}

function renderList() {
  const list = $("vc-order-list");
  const empty = $("vc-order-list-empty");
  if (!list) return;
  const byFilter = filterOrders(state.orders, state.filter);
  const filtered = applyQuery(byFilter, state.query);
  if (filtered.length === 0) {
    list.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  const groups = groupByBatch(filtered);
  list.innerHTML = groups
    .map((g) => (g.length === 1 ? orderCardHtml(g[0]) : packageCardHtml(g)))
    .join("");
}

function setPoll(text, paused = false) {
  const c = $("vc-poll-cadence");
  if (c) c.textContent = text;
  const wrap = $("vc-poll-status");
  if (wrap) wrap.classList.toggle("is-paused", paused);
}

// ─── QR / insert-card downloads (mirrors the original LP) ─────

async function downloadPackageQr(qrUrl, batchNum) {
  if (!qrUrl) return;
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&margin=2&data=${encodeURIComponent(qrUrl)}`;
  const filename = `coldcaked-${(batchNum || "batch").toLowerCase()}-qr.png`;
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`QR fetch ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    window.open(src, "_blank", "noopener");
  }
}

/** Renders the full shipping insert-card (logos + greeting + QR + signoff)
 *  to a PNG and saves locally. Lazy-loads html2canvas from CDN on first
 *  click — bakery hands hit this maybe once per order so paying ~70KB on
 *  demand is the right trade. */
async function downloadPackageCard(qrUrl, batchNum, isApply = false) {
  if (!qrUrl) return;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=2&data=${encodeURIComponent(qrUrl)}`;
  let qrBlobUrl = null;
  try {
    const r = await fetch(qrSrc);
    if (!r.ok) throw new Error("qr fetch failed");
    const b = await r.blob();
    qrBlobUrl = URL.createObjectURL(b);
  } catch {
    window.open(qrSrc, "_blank", "noopener");
    return;
  }

  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position: fixed; left: -9999px; top: 0; background: #fff; padding: 24px;";
  const greeting = isApply ? "We have found your winners!" : "A cake for you.";
  const msg = isApply
    ? "Scan the QR code to read the pitch we picked for you."
    : "Scan the QR code to find out who sent it.";
  wrap.innerHTML = `
    <div class="insert-card" data-render-target>
      <div class="insert-card__brand">
        <img class="insert-card__logo insert-card__logo--daymaker"
             src="/assets/daymaker-wordmark.svg"
             alt="Daymaker" crossorigin="anonymous" />
        <span class="insert-card__brand-x" aria-hidden="true">×</span>
        <img class="insert-card__logo insert-card__logo--bakery"
             src="/assets/cocola-bakery-logo.png"
             alt="Cocola Bakery" crossorigin="anonymous" />
      </div>
      <p class="insert-card__greeting">${greeting}</p>
      <p class="insert-card__msg">${msg}</p>
      <div class="insert-card__qr"><img src="${qrBlobUrl}" alt="QR" /></div>
      <p class="insert-card__signoff">Love,<br>William &amp; Christian</p>
    </div>
  `;
  document.body.appendChild(wrap);
  await Promise.all(
    Array.from(wrap.querySelectorAll("img")).map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
  try {
    const mod = await import(
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm"
    );
    const html2canvas = mod.default || mod;
    const target = wrap.querySelector("[data-render-target]");
    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });
    await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `coldcaked-${(batchNum || "card").toLowerCase()}-card.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve();
      }, "image/png");
    });
  } catch {
    // Render failed — open the QR alone so the bakery still gets something
    window.open(qrSrc, "_blank", "noopener");
  } finally {
    wrap.remove();
    if (qrBlobUrl) URL.revokeObjectURL(qrBlobUrl);
  }
}

// ─── Polling + main flow ──────────────────────────────────────

async function loadAndRender() {
  try {
    const ordRes = await authedFetch(
      withAs("/api/v1/bakery/vc-orders?limit=200"),
    );
    const orders = ordRes.data || [];
    state.orders = orders;
    const sig = orders
      .map((o) => `${o.id}:${o.status}:${o.updated_at}`)
      .join("|");
    const changed = sig !== state.lastSig;
    state.lastSig = sig;
    renderStats(orders);
    renderList();
    // Report upward on EVERY poll, not just the first load. The dashboard's
    // own poll refreshes assignments only, so without this the nav badge shed
    // its VC half 20 seconds after the page opened.
    state.onPendingCount?.(countVcPending(orders));
    if (changed) {
      state.pollMs = POLL_MS;
      setPoll("checking every 20 s");
    } else {
      state.pollMs = Math.min(state.pollMs * 1.5, POLL_MAX_MS);
      setPoll(`checking every ${Math.round(state.pollMs / 1000)} s`);
    }
    schedulePoll();
  } catch (err) {
    // Forbidden = caller isn't the VC bakery anymore (admin de-flagged?
    // user switched roles?). Hide the section gracefully.
    if (err.code === "forbidden") {
      const section = $("bakery-vc-queue");
      if (section) section.hidden = true;
      // No longer the VC bakery — drop the VC half of the badge too, or the
      // corner keeps counting work this bakery can no longer see.
      state.onPendingCount?.(0);
      return;
    }
    setPoll(`error: ${err.message || "load failed"}`, true);
    schedulePoll();
  }
}

function schedulePoll() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  if (document.hidden) {
    setPoll("paused (tab hidden)", true);
    return;
  }
  state.pollTimer = setTimeout(() => void loadAndRender(), state.pollMs);
}

function onVisibility() {
  if (document.hidden) {
    if (state.pollTimer) clearTimeout(state.pollTimer);
    setPoll("paused (tab hidden)", true);
  } else {
    setPoll("resuming…");
    void loadAndRender();
  }
}

// ─── Wiring ───────────────────────────────────────────────────

function wireFilters() {
  const chips = $("vc-filter-chips");
  if (!chips) return;
  chips.addEventListener("click", (ev) => {
    // Match on the data attribute, not the presentation class: the buttons
    // have already been renamed once (.filter-chip → .seg) without this file
    // being updated, which left the whole filter silently inert.
    const btn = ev.target.closest("[data-vc-filter]");
    if (!btn) return;
    chips.querySelectorAll("[data-vc-filter]").forEach((b) => {
      b.classList.remove("is-active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("is-active");
    btn.setAttribute("aria-selected", "true");
    state.filter = btn.dataset.vcFilter || "all";
    renderList();
  });
}

function wireSearch() {
  const input = $("vc-search-input");
  if (!input) return;
  input.addEventListener("input", () => {
    state.query = input.value;
    renderList();
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && state.query) {
      input.value = "";
      state.query = "";
      renderList();
    }
  });
}

function wireListActions() {
  const list = $("vc-order-list");
  if (!list) return;
  list.addEventListener("click", (ev) => {
    const qrBtn = ev.target.closest(".package-card__qr-download");
    if (qrBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const qrUrl = qrBtn.getAttribute("data-qr-url");
      const num = qrBtn.getAttribute("data-order-num") || "batch";
      const original = qrBtn.textContent;
      qrBtn.setAttribute("disabled", "true");
      qrBtn.textContent = "Downloading…";
      void downloadPackageQr(qrUrl, num).finally(() => {
        qrBtn.removeAttribute("disabled");
        qrBtn.textContent = original;
      });
      return;
    }
    const cardBtn = ev.target.closest(".package-card__card-download");
    if (cardBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const qrUrl = cardBtn.getAttribute("data-qr-url");
      const num = cardBtn.getAttribute("data-order-num") || "batch";
      const isApply = cardBtn.getAttribute("data-apply") === "1";
      const original = cardBtn.textContent;
      cardBtn.setAttribute("disabled", "true");
      cardBtn.textContent = "Rendering…";
      void downloadPackageCard(qrUrl, num, isApply).finally(() => {
        cardBtn.removeAttribute("disabled");
        cardBtn.textContent = original;
      });
    }
  });
}

// Invoice button now lives in the dashboard hero and is wired by
// bakery-dashboard.js for every bakery — Cocola included. Nothing
// VC-queue-specific to do here.

/**
 * Activate the VC queue. Called by bakery-dashboard.js only when the
 * signed-in bakery is Cocola (`bakery.is_vc_bakery === true`). Idempotent —
 * subsequent calls re-bind invoice button + bakery context.
 */
export function startVcQueue({ bakery, asId = null, onPendingCount = null } = {}) {
  state.me = bakery || null;
  state.asId = asId;
  if (onPendingCount) state.onPendingCount = onPendingCount;
  const section = $("bakery-vc-queue");
  if (section) section.hidden = false;
  if (started) {
    void loadAndRender();
    return;
  }
  started = true;
  wireFilters();
  wireSearch();
  wireListActions();
  document.addEventListener("visibilitychange", onVisibility);
  void loadAndRender();
}

/** Force-hide on bakery change (e.g. admin un-shadows). Stops the poll. */
export function stopVcQueue() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = null;
  const section = $("bakery-vc-queue");
  if (section) section.hidden = true;
}
