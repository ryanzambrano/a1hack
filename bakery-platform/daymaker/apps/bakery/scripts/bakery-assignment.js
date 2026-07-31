/**
 * Bakery /bakery/assignments/:id — assignment detail + actions.
 *
 * Mirrors the structure of the bakery-order page from the coldcaked
 * repo: hero with status pill, action card, recipient/notes grid,
 * upload pair (cake + delivery photos), existing photo trail, delivery
 * diary timeline, decline modal. Adapted to this project's API
 * (/api/v1/bakery/assignments/...) and status names
 * (pending → accepted → in_production → ready → in_transit → delivered).
 *
 * The bakery's flow is intentionally simple: once they accept, the only
 * thing they have to do is upload both photos and press Done. The
 * intermediate states are managed server-side by /complete.
 */

// Entry module: side-effect imports wire the assignment page modules,
// then the readyState gate below boots. Bump all ?v= pins in lockstep.
import "./assignment/core.js?v=20260729unified2";
import "./assignment/format.js?v=20260729unified2";
import "./assignment/media.js?v=20260729unified2";
import "./assignment/summary.js?v=20260729unified2";
import "./assignment/cakes.js?v=20260729unified2";
import "./assignment/photos-events.js?v=20260729unified2";
import "./assignment/uploads.js?v=20260729unified2";
import "./assignment/tickets.js?v=20260729unified2";
import "./assignment/actions.js?v=20260729unified2";
import "./assignment/chat.js?v=20260729unified2";
import "./assignment/source.js?v=20260729unified2";
import "./assignment/insert-card.js?v=20260729unified2";
import "./assignment/app.js?v=20260729unified2";
import { readIdFromUrl } from "/scripts/api.js";
import { cacheEls, state } from "./assignment/core.js?v=20260729unified2";
import { assignmentSource, vcSource } from "./assignment/source.js?v=20260729unified2";
import { renderError } from "./assignment/actions.js?v=20260729unified2";
import { loadAndRender, wireActions } from "./assignment/app.js?v=20260729unified2";
import { wireUpload } from "./assignment/uploads.js?v=20260729unified2";
import {
  mountChatDock,
  loadChatDockThreads,
} from "/apps/bakery/scripts/bakery-chat-dock.js?v=20260729unified2";


async function boot() {
  cacheEls();
  // ONE page, two order kinds. /bakery/vc-orders/:id and
  // /bakery/assignments/:id are the same document (see vercel.json); the URL
  // decides which source adapter feeds it. Everything downstream is shared.
  state.source = location.pathname.startsWith("/bakery/vc-orders")
    ? vcSource
    : assignmentSource;
  state.id = readIdFromUrl(state.source.idFromUrl());
  if (!state.id) {
    renderError({ message: "This URL is missing an order id." });
    return;
  }
  document.title = state.source.kind === "vc" ? "VC order · Daymaker bakery" : "Assignment · Daymaker bakery";
  const chip = document.getElementById("bakery-nav-chip");
  if (chip && state.source.kind === "vc") chip.textContent = "VC order";
  wireActions();
  wireUpload();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void loadAndRender();
  });
  const auth = window.bakeryPlatformAuth;
  if (auth?.ready) {
    try { await auth.ready; } catch { /* fall through */ }
  }
  void loadAndRender();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}


// Baseline: the messages button exists on this page even when this order has
// no conversation, so it never disappears where you expect it. A VC order has
// no messaging at all, though - the floating button would be the one piece of
// it left standing, so it is not mounted there.
if (!location.pathname.startsWith("/bakery/vc-orders")) {
  const as = new URLSearchParams(location.search).get("as");
  mountChatDock({ asId: as });
  void loadChatDockThreads({ asId: as });
}
