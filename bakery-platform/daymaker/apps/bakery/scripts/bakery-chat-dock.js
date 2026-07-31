/**
 * Floating chat dock — the bakery's customer conversations, one tap away.
 *
 * The chat used to live only inside the assignment detail page, as one card
 * among nine. A bakery with an unanswered customer question had no way to
 * know from anywhere else in the product, so questions sat unread. This puts
 * a persistent button in the bottom-right corner of every bakery page, with
 * an attention pulse when a customer is waiting on a reply.
 *
 * Two modes, one button:
 *
 *   thread mode  (order detail) — the dock hosts that assignment's real
 *                conversation, using the same shared chat-panel.js the
 *                in-page card used. The panel is mounted ONCE and moved into
 *                the drawer, so there is never a second live poller.
 *
 *   inbox mode   (queue, settings, anywhere else) — the dock lists every
 *                assignment with an unanswered message and links through.
 *                There is no single "current" conversation on those pages.
 *
 * Unread counts come from `unread_count` on the assignments list, which the
 * dashboard already polls; nothing new is fetched on the dashboard's behalf.
 */

import { authedFetch, escape } from "/scripts/api.js";

/** Same day format the queue uses, so the two lists read alike. */
function formatDay(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date().toISOString().slice(0, 10);
  if (iso === today) return "today";
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}

const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

let root = null;
let state = {
  mode: "inbox",
  open: false,
  unread: 0,
  threads: [],
  asId: null,
  // Set in thread mode so the drawer can host the real panel.
  hostEl: null,
  onOpen: null,
};

const SVG_CHAT = `
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

const SVG_CLOSE = `
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;

function build() {
  if (root) return root;
  root = document.createElement("div");
  root.className = "chat-dock";
  root.innerHTML = `
    <div class="chat-dock__panel" id="chat-dock-panel" hidden role="dialog"
         aria-modal="false" aria-labelledby="chat-dock-title">
      <header class="chat-dock__head">
        <h2 class="chat-dock__title" id="chat-dock-title">Messages</h2>
        <button type="button" class="chat-dock__close" id="chat-dock-close"
                aria-label="Close messages">${SVG_CLOSE}</button>
      </header>
      <div class="chat-dock__body" id="chat-dock-body"></div>
    </div>
    <button type="button" class="chat-dock__fab" id="chat-dock-fab"
            aria-expanded="false" aria-controls="chat-dock-panel">
      <span class="chat-dock__fab-icon">${SVG_CHAT}</span>
      <span class="chat-dock__fab-count" id="chat-dock-count" hidden></span>
      <span class="chat-dock__fab-label" id="chat-dock-label">Messages</span>
    </button>`;
  document.body.appendChild(root);

  root.querySelector("#chat-dock-fab").addEventListener("click", toggle);
  root.querySelector("#chat-dock-close").addEventListener("click", () => setOpen(false));
  // Escape closes, like any other dismissible overlay.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.open) setOpen(false);
  });
  return root;
}

function toggle() {
  setOpen(!state.open);
}

function setOpen(open) {
  state.open = open;
  const panel = root.querySelector("#chat-dock-panel");
  const fab = root.querySelector("#chat-dock-fab");
  panel.hidden = !open;
  fab.setAttribute("aria-expanded", open ? "true" : "false");
  root.classList.toggle("is-open", open);
  if (open) {
    // Opening is an acknowledgement: stop shouting even before the messages
    // are marked read server-side.
    root.classList.remove("has-unread");
    if (typeof state.onOpen === "function") state.onOpen();
    renderBody();
    const input = panel.querySelector("textarea, input");
    if (input) input.focus();
  }
}

function renderBody() {
  const body = root.querySelector("#chat-dock-body");
  const title = root.querySelector("#chat-dock-title");

  if (state.mode === "thread") {
    title.textContent = state.threadTitle || "Message the customer";
    // Move the already-mounted panel in rather than mounting a second one.
    if (state.hostEl && state.hostEl.parentElement !== body) {
      body.innerHTML = "";
      body.appendChild(state.hostEl);
    }
    return;
  }

  title.textContent = "Messages";
  if (state.threads.length === 0) {
    body.innerHTML = `
      <div class="chat-dock__empty">
        <p class="chat-dock__empty-t">Nothing waiting on a reply</p>
        <p class="chat-dock__empty-s">
          Customer questions about an order show up here, and we email you too.
        </p>
      </div>`;
    return;
  }

  body.innerHTML = `
    <ul class="chat-dock__list">
      ${state.threads
        .map((t) => {
          const href = state.asId
            ? `/bakery/assignments/${encodeURIComponent(t.id)}?as=${encodeURIComponent(state.asId)}`
            : `/bakery/assignments/${encodeURIComponent(t.id)}`;
          return `
          <li>
            <a class="chat-dock__row" href="${escape(href)}">
              <span class="chat-dock__row-main">
                <span class="chat-dock__row-who">${escape(t.name)}</span>
                <span class="chat-dock__row-sub">${escape(t.sub)}</span>
              </span>
              <span class="count-badge">${t.unread}</span>
            </a>
          </li>`;
        })
        .join("")}
    </ul>`;
}

function paintFab() {
  if (!root) return;
  const count = root.querySelector("#chat-dock-count");
  const label = root.querySelector("#chat-dock-label");
  const fab = root.querySelector("#chat-dock-fab");

  if (state.unread > 0) {
    count.textContent = String(state.unread);
    count.hidden = false;
    // The "effect": a slow attention pulse, only while something is actually
    // waiting, and never for anyone who asked for reduced motion.
    if (!state.open && !REDUCED_MOTION) root.classList.add("has-unread");
    label.textContent =
      state.unread === 1 ? "1 unanswered message" : `${state.unread} unanswered messages`;
    fab.setAttribute(
      "aria-label",
      state.unread === 1
        ? "Messages: 1 customer waiting on a reply"
        : `Messages: ${state.unread} customers waiting on a reply`,
    );
    root.classList.add("is-urgent");
  } else {
    count.hidden = true;
    root.classList.remove("has-unread", "is-urgent");
    label.textContent = "Messages";
    fab.setAttribute("aria-label", "Messages");
  }
  if (state.open) renderBody();
}

/* ─────────────────────────── public API ─────────────────────────── */

/**
 * Inbox mode. Call once, then feed it the assignments list on every poll.
 * `asId` forwards the admin-shadow query param onto the row links.
 */
export function mountChatDock({ asId = null } = {}) {
  build();
  state.mode = "inbox";
  state.asId = asId;
  paintFab();
}

/** Feed inbox mode from an assignments payload. */
export function setChatDockThreads(assignments) {
  if (!root || state.mode !== "inbox") return;
  const list = Array.isArray(assignments) ? assignments : [];
  state.threads = list
    .filter((a) => typeof a.unread_count === "number" && a.unread_count > 0)
    .map((a) => ({
      id: a.id,
      unread: a.unread_count,
      name: a.recipient_name || "Order",
      sub:
        a.scheduled_date
          ? `Deliver ${formatDay(a.scheduled_date)}`
          : a.source === "campaign"
            ? "Needs a delivery date"
            : [a.recipient_address, a.recipient_city].filter(Boolean).join(", "),
    }))
    .sort((x, y) => y.unread - x.unread);
  state.unread = state.threads.reduce((n, t) => n + t.unread, 0);
  paintFab();
}

/**
 * Thread mode. `hostEl` is the element the shared chat panel is already
 * mounted into — the dock adopts it rather than mounting a second instance,
 * which would double the poller and the read receipts.
 */
export function mountChatDockThread({
  hostEl,
  title,
  initialUnread = 0,
  onOpen = null,
  adoptNow = false,
}) {
  build();
  state.mode = "thread";
  state.hostEl = hostEl || null;
  state.threadTitle = title || "Message the customer";
  state.unread = initialUnread;
  state.onOpen = onOpen;
  paintFab();
  // `adoptNow` moves the panel into the drawer immediately instead of waiting
  // for the first open. Pages that turn their in-page card into a doorway
  // ("Open messages") need this: without it the card showed a live
  // "Write a message…" composer AND a button to the same conversation, and
  // the composer vanished out from under the card the first time the drawer
  // opened. Pages that still host the conversation in the card itself (the VC
  // order page) leave it off and keep the panel where it is until then.
  if (adoptNow) renderBody();
  // An unanswered question is the whole reason to surface this, so open
  // straight onto it rather than making them find the button.
  if (initialUnread > 0) setOpen(true);
}

/** Thread mode: keep the badge in step with the panel's own unread count. */
export function setChatDockUnread(n) {
  state.unread = typeof n === "number" && n > 0 ? n : 0;
  paintFab();
}

/**
 * Standalone loader for pages that don't already hold an assignments list
 * (settings, for instance). Cheap: one request, no polling.
 */
export async function loadChatDockThreads({ asId = null } = {}) {
  try {
    const url = asId
      ? `/api/v1/bakery/assignments?as=${encodeURIComponent(asId)}`
      : "/api/v1/bakery/assignments";
    const data = await authedFetch(url);
    setChatDockThreads(data.assignments);
  } catch {
    /* the dock just stays quiet */
  }
}
