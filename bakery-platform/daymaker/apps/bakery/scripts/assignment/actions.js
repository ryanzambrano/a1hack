// Extracted from bakery-assignment.js — actions cluster.
// All sibling imports share one ?v= pin; bump them in lockstep
// (they must resolve to the same module instances).
import { authedFetch } from "/scripts/api.js";
import { els, state } from "./core.js?v=20260729unified2";
import { fmtScheduledDate } from "./format.js?v=20260729unified2";
import { loadAndRender } from "./app.js?v=20260729unified2";


// Customer already paid — no more Accept/Decline gate. Assignments land
// directly in "accepted" and the bakery walks straight into the upload flow.
// Pre-2026-05 rows that are still "pending" in the wild are treated the same
// as accepted to keep the UI useful for legacy data.
//
// This used to also paint a "Next step" card, but every line it wrote was
// already on the card directly beneath it ("Upload both photos to finish"
// above the Photos card; "Set a delivery date first" above the delivery-date
// card). Deciding which cards are live is the only job left.
function renderActions(a) {
  const hasUploadStep = [
    "pending",
    "accepted",
    "in_production",
    "ready",
    "in_transit",
  ].includes(a.status);
  els.uploadCard.hidden = !hasUploadStep;
}

// ─── Delivery-date card (gate + settled) ────────────────────
// Two states of ONE card:
//   "gate" — a campaign order the customer left as ASAP lands with no
//     committed date. The bakery must pick a delivery date before
//     uploading photos; doing so emails the customer their ETA.
//   "edit" — the date on the order is bakery-committed (scheduled_date,
//     not a customer-picked window), so the card shows the date and keeps
//     the picker one click away behind "Change". The customer is emailed
//     the updated ETA.
// Hidden for terminal orders, VC orders (they reschedule from the VC
// order page), and customer-picked windows (that's a checkout commitment —
// the bakery messages the customer instead of silently moving it).
function deliveryDateMode(a) {
  if (!a) return null;
  // A VC-sourced row seen on the ASSIGNMENT page is rescheduled from the VC
  // order page instead. On the VC page itself this card is the only place to
  // do it, so the guard is about which page you're on, not the row's source.
  if (state.source.kind === "assignment" && a.source === "vc") return null;
  if (["delivered", "failed", "cancelled"].includes(a.status)) return null;
  const items = Array.isArray(a.cake_items) ? a.cake_items : [];
  if (items[0]?.delivery_window_start) return null;
  if (a.source === "campaign" && !a.scheduled_date) return "gate";
  return "edit";
}

function todayYmd() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function setDdResult(text, isError = false) {
  if (!els.ddResult) return;
  els.ddResult.hidden = false;
  els.ddResult.textContent = text;
  els.ddResult.classList.toggle("is-error", isError);
}

// Did the bakery open the picker themselves? A settled card polls every 20s,
// and a reload must not slam the picker shut under their hands.
let ddUserOpened = false;

// Echo the picked day back in the page's own English format. The native date
// field renders in the browser's locale, so on a Norwegian machine the only
// visible date on an English page reads "27.07.2026".
function paintDdEcho() {
  if (!els.ddEcho) return;
  const pretty = fmtScheduledDate(els.ddInput?.value);
  els.ddEcho.hidden = !pretty;
  els.ddEcho.textContent = pretty ? `Delivering ${pretty}` : "";
}

// Swap the card between its settled and editor states. `editing` is only
// meaningful once a date exists; without one the editor is the whole card.
function setDdEditing(editing) {
  if (els.ddEditor) els.ddEditor.hidden = !editing;
  if (els.ddSettled) els.ddSettled.hidden = editing;
  if (els.ddChange) els.ddChange.setAttribute("aria-expanded", editing ? "true" : "false");
  if (editing) paintDdEcho();
}

// Show the date card in the right state. With no date committed it is the
// page's single ask and the upload flow stays locked; with one committed it
// collapses to the date itself, because a settled order should state a fact,
// not keep asking a question. Runs after the normal render so it can override
// what renderActions / renderUploadStatus set.
function applyDeliveryGate(a) {
  const mode = deliveryDateMode(a);
  if (els.ddCard) els.ddCard.hidden = !mode;
  // The Order summary carries the delivery date only when this card isn't
  // already showing it. Otherwise a settled order printed the same day three
  // times in one screen: hero subtitle, this card, and the summary row.
  // renderSummary rebuilds that row on every poll, so re-apply it here (this
  // runs after renderSummary by design).
  const summaryRow = document.getElementById("summary-delivery-row");
  if (summaryRow) summaryRow.hidden = !!mode;
  if (!mode) return;
  // Only campaign orders have a customer on the other end to notify;
  // manual assignments just save the date.
  const notifies = state.source.notifiesOnDateChange(a);
  if (els.ddInput) {
    els.ddInput.min = todayYmd();
    if (!els.ddInput.value) els.ddInput.value = a.scheduled_date || todayYmd();
  }

  if (mode === "gate") {
    if (els.ddH) els.ddH.textContent = "Pick a delivery date";
    if (els.ddHint) {
      els.ddHint.textContent = notifies
        ? "This order came in as ASAP. Pick the day you'll deliver: the customer is emailed the ETA and photo uploads unlock the moment you confirm."
        : "This order came in as ASAP. Pick the day you'll deliver to unlock photo uploads.";
    }
    if (els.ddConfirm) {
      els.ddConfirm.textContent = notifies ? "Confirm date and notify customer" : "Confirm date";
    }
    if (els.uploadCard) els.uploadCard.hidden = true;
    setDdEditing(true);
    return;
  }

  // A manual assignment can land here with no date at all (admin creates them
  // that way). There is nothing to settle and nothing to "Change", so it gets
  // the same open ask as the gate - the one state that most needs the picker
  // must not be the one that hides it.
  const settled = !!a.scheduled_date;
  if (els.ddH) els.ddH.textContent = settled ? "Delivery date" : "Pick a delivery date";
  if (els.ddCurrent) els.ddCurrent.textContent = fmtScheduledDate(a.scheduled_date) || "";
  if (els.ddHint) {
    els.ddHint.textContent = notifies
      ? "The customer is emailed the updated ETA the moment you confirm."
      : "Pick the day you'll deliver this order.";
  }
  if (els.ddConfirm) {
    els.ddConfirm.textContent = notifies ? "Update date and notify customer" : "Save date";
  }
  setDdEditing(!settled || ddUserOpened);
}

function onToggleDdEditor() {
  const opening = !!els.ddEditor?.hidden;
  ddUserOpened = opening;
  setDdEditing(opening);
  if (opening) els.ddInput?.focus();
}

async function onConfirmDeliveryDate() {
  if (state.busy) return;
  const date = els.ddInput?.value;
  if (!date) {
    setDdResult("Pick a delivery date first.", true);
    return;
  }
  state.busy = true;
  els.ddConfirm?.setAttribute("disabled", "true");
  try {
    await state.source.setDeliveryDate(date);
    setDdResult(
      state.source.notifiesOnDateChange(state.assignment || {})
        ? "Delivery date set. The customer has been emailed the ETA."
        : "Delivery date saved.",
    );
    // Answered — collapse back to the settled state on the reload below.
    ddUserOpened = false;
    await loadAndRender();
  } catch (err) {
    setDdResult(err.message || "Couldn't set the delivery date.", true);
  } finally {
    state.busy = false;
    els.ddConfirm?.removeAttribute("disabled");
  }
}

function setActionResult(text, isError = false) {
  els.actionResult.hidden = false;
  els.actionResult.textContent = text;
  els.actionResult.classList.toggle("is-error", isError);
  if (!isError) {
    setTimeout(() => {
      els.actionResult.hidden = true;
    }, 4000);
  }
}

function renderError(err) {
  els.errorCard.hidden = false;
  els.shell.hidden = true;
  els.errorMessage.textContent = err.message || "Something went wrong.";
  els.errorHint.textContent = err.requestId ? `Reference: ${err.requestId}` : "";
}

function renderGate() {
  els.gate.hidden = false;
  els.shell.hidden = true;
  els.errorCard.hidden = true;
}

// ─── Actions ────────────────────────────────────────────────
// Accept / Decline / Cancel were removed when the order model moved to
// pay-on-checkout. The only escape hatch now is per-cake "Mark unsuccessful"
// (wired inside renderUploadBlock), which sets that recipient to failed
// without releasing the assignment.

// Mark-unsuccessful modal — opens with a cake_item_id + recipient label,
// POSTs the reason to the cake-item endpoint, then reloads. The cake's
// per-block view flips to the red "✗ Unsuccessful" tile and the customer's
// dashboard surfaces the failed recipient on next refresh.
let muActiveCakeId = null;
function openMarkUnsuccessfulModal(cakeId, recipient) {
  muActiveCakeId = cakeId;
  els.muRecipient.textContent = recipient;
  els.muReason.value = "";
  els.muModal.hidden = false;
  setTimeout(() => els.muReason.focus(), 50);
}
function closeMarkUnsuccessfulModal() {
  els.muModal.hidden = true;
  muActiveCakeId = null;
}
async function confirmMarkUnsuccessful() {
  const reason = els.muReason.value.trim();
  if (reason.length < 2) {
    els.muReason.focus();
    return;
  }
  if (!muActiveCakeId || state.busy) return;
  state.busy = true;
  try {
    els.muConfirm.setAttribute("disabled", "true");
    await authedFetch(
      `/api/v1/bakery/assignments/${encodeURIComponent(state.id)}/cake-items/${encodeURIComponent(muActiveCakeId)}/mark-unsuccessful`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      },
    );
    closeMarkUnsuccessfulModal();
    setActionResult("Marked unsuccessful. The customer can see the reason on their campaign.");
    await loadAndRender();
  } catch (err) {
    setActionResult(err.message || "Couldn't mark unsuccessful.", true);
  } finally {
    state.busy = false;
    els.muConfirm.removeAttribute("disabled");
  }
}

// Undo for "Mark unsuccessful". No modal, because the action itself is
// reversible (the bakery can re-mark with a fresh reason). POSTs to the undo
// endpoint, which clears the failure on the cake and the recipient and emails
// the customer that the delivery is back on. Blocked server-side once the
// assignment or campaign has closed out.
async function undoMarkUnsuccessful(cakeId) {
  if (!cakeId || state.busy) return;
  state.busy = true;
  try {
    await authedFetch(
      `/api/v1/bakery/assignments/${encodeURIComponent(state.id)}/cake-items/${encodeURIComponent(cakeId)}/undo-unsuccessful`,
      { method: "POST" },
    );
    setActionResult("Undone. The cake is back in the photo flow and the customer has been notified.");
    await loadAndRender();
  } catch (err) {
    setActionResult(err.message || "Couldn't undo.", true);
  } finally {
    state.busy = false;
  }
}

async function onDone() {
  if (state.busy) return;
  state.busy = true;
  els.doneBtn?.setAttribute("disabled", "true");
  try {
    await state.source.complete();
    setActionResult("Order marked complete. Nice work.");
    await loadAndRender();
  } catch (err) {
    setActionResult(err.message || "Couldn't mark this order complete.", true);
  } finally {
    state.busy = false;
  }
}
export {
  applyDeliveryGate,
  closeMarkUnsuccessfulModal,
  confirmMarkUnsuccessful,
  onConfirmDeliveryDate,
  onDone,
  onToggleDdEditor,
  openMarkUnsuccessfulModal,
  paintDdEcho,
  renderActions,
  renderError,
  renderGate,
  setActionResult,
  undoMarkUnsuccessful,
};
