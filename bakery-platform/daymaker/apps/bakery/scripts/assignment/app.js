// Extracted from bakery-assignment.js — app cluster.
// All sibling imports share one ?v= pin; bump them in lockstep
// (they must resolve to the same module instances).
import { authedFetch } from "/scripts/api.js";
import { POLL_MS, els, state } from "./core.js?v=20260729unified2";
import {
  renderCakeCount,
  renderHero,
  renderRecipients,
  renderSummary,
} from "./summary.js?v=20260729unified2";
import { renderCakes } from "./cakes.js?v=20260729unified2";
import { renderEvents, renderPhotos } from "./photos-events.js?v=20260729unified2";
import { renderUploadStatus } from "./uploads.js?v=20260729unified2";
import { printProductionTickets } from "./tickets.js?v=20260729unified2";
import {
  applyDeliveryGate,
  closeMarkUnsuccessfulModal,
  confirmMarkUnsuccessful,
  onConfirmDeliveryDate,
  onToggleDdEditor,
  paintDdEcho,
  renderActions,
  renderError,
  renderGate,
} from "./actions.js?v=20260729unified2";
import { maybeMountChat } from "./chat.js?v=20260729unified2";
import { attachInsertCardImage, renderInsertCard } from "./insert-card.js?v=20260729unified2";


// ─── Main flow ──────────────────────────────────────────────

async function loadAndRender() {
  try {
    if (!state.me) {
      const me = await authedFetch("/api/v1/bakery/me");
      state.me = me;
      if (els.chip && me.bakery) {
        els.chip.hidden = false;
        els.chip.textContent = me.bakery.slug ? `@${me.bakery.slug}` : me.bakery.name;
      }
    }
    // Where the order comes from, and how its payload becomes the one view
    // model below, is the source adapter's job (source.js). Both order kinds
    // render through everything that follows.
    const a = await state.source.load();
    state.assignment = a;

    renderHero(a);
    renderCakeCount(a);
    renderSummary(a);
    if (state.source.recipients) renderRecipients(a);
    renderCakes(a);
    renderActions(a);
    renderUploadStatus(a);
    // Must run AFTER renderActions/renderUploadStatus so it can lock the
    // upload card + retitle the action card for unscheduled ASAP orders.
    applyDeliveryGate(a);
    renderPhotos(a);
    renderEvents(a);
    if (state.source.chat) maybeMountChat(a);
    if (state.source.insertCard) {
      renderInsertCard(a);
      // Rasterising the card takes a moment; when it lands, the cakes table
      // repaints with it sitting in the Card column like any other card.
      void attachInsertCardImage(a).then((repaint) => {
        if (repaint) renderCakes(a);
      });
    }
    schedulePoll();
  } catch (err) {
    if (err.code === "unauthenticated" || err.status === 401) {
      renderGate();
      return;
    }
    renderError(err);
  }
}

function schedulePoll() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  if (document.hidden) return;
  const terminal = ["delivered", "cancelled", "failed"].includes(state.assignment?.status);
  if (terminal) return;
  state.pollTimer = setTimeout(() => void loadAndRender(), POLL_MS);
}

function wireActions() {
  // No assignment-level action buttons remain (Accept/Decline/Cancel gone),
  // and the "Next step" card they lived on is gone with them. Per-cake
  // actions are wired inside renderUploadBlock as the cake_items list lands.
  els.errorRetry?.addEventListener("click", () => {
    els.errorCard.hidden = true;
    void loadAndRender();
  });
  // Print production tickets (one docket per cake for the kitchen)
  els.printTicketBtn?.addEventListener("click", () => void printProductionTickets());
  // Delivery date: confirm, reveal the picker on a settled order, and echo
  // the pick back in the page's own date format as it changes.
  els.ddConfirm?.addEventListener("click", () => void onConfirmDeliveryDate());
  els.ddChange?.addEventListener("click", onToggleDdEditor);
  els.ddInput?.addEventListener("input", paintDdEcho);
  els.ddInput?.addEventListener("change", paintDdEcho);
  // Mark-unsuccessful modal wires
  els.muCancel.addEventListener("click", closeMarkUnsuccessfulModal);
  els.muConfirm.addEventListener("click", () => void confirmMarkUnsuccessful());
  els.muModal.addEventListener("click", (ev) => {
    if (ev.target === els.muModal) closeMarkUnsuccessfulModal();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !els.muModal.hidden) closeMarkUnsuccessfulModal();
  });
}
export {
  loadAndRender,
  wireActions,
};
