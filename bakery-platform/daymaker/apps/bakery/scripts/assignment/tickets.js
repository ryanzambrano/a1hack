// Extracted from bakery-assignment.js — tickets cluster.
// All sibling imports share one ?v= pin; bump them in lockstep
// (they must resolve to the same module instances).
import { escape } from "/scripts/api.js";
import { renderPdfPreviews } from "/scripts/pdf-preview.js";
import { els, state } from "./core.js?v=20260729unified2";
import { fmtScheduledDate } from "./format.js?v=20260729unified2";
import { CARD_BACK_URL, isPdfUrl, optimizedSrc, wireImageFallbacks } from "./media.js?v=20260729unified2";
import { setActionResult } from "./actions.js?v=20260729unified2";


// ─── Production tickets (print) ─────────────────────────────
// "Is there a way to print the order to give to the production team?"
// Builds one docket per cake into the hidden #ticket-print-host, then
// opens the browser print dialog. The print stylesheet (orders.css) hides
// the rest of the page so only the tickets land on paper - one cake per
// page. Mirrors the insert-card print pattern in bakery.css.
//
// The printed ticket is English-only, like the rest of this page. Keep every
// user-facing string in the ticket renderers below in English; dates come
// from fmtScheduledDate, which is pinned to en-US (see the formatters
// section) so nothing ever renders in the viewer's language - a Norwegian
// browser was showing "mandag".

// Deliver-by label for a ticket: the cake's own window, else the
// assignment's scheduled date, else ASAP.
function ticketDeliverBy(a, item) {
  const start = item?.delivery_window_start || a.scheduled_date || null;
  const end = item?.delivery_window_end || null;
  const s = fmtScheduledDate(start);
  const e = fmtScheduledDate(end);
  if (s && e && s !== e) return `${s} to ${e}`;
  if (s) return s;
  return "ASAP, bakery decides";
}

// A design/card reference image sized for paper. Round cakes print in a
// circular frame (their print already has transparent corners), everything
// else in a square frame, object-fit: contain so nothing is cropped off.
function ticketImg(url, alt, round) {
  if (!url) return "";
  // PDF print: pdf-preview.js rasterizes page 1 into this frame before
  // window.print() fires (printProductionTickets awaits it). The text is
  // the fallback if rendering fails, so the kitchen is never left with a
  // broken image.
  if (isPdfUrl(url)) {
    return `<div class="ticket__art${round ? " ticket__art--round" : ""} ticket__art--pdf" data-pdf-preview="${escape(url)}"><span class="ticket__art-pdf">PDF - see downloaded design file</span></div>`;
  }
  const opt = optimizedSrc(url, 640);
  const fb = opt !== url ? ` data-fallback="${escape(url)}"` : "";
  return `<div class="ticket__art${round ? " ticket__art--round" : ""}"><img src="${escape(opt)}"${fb} alt="${escape(alt)}" /></div>`;
}

function ticketHtml(item, n, total, a) {
  const orderRef = `#${(a.id || "").slice(0, 8)}`;
  const bakery = state.me?.bakery?.name ? ` · ${escape(state.me.bakery.name)}` : "";
  const onCake = (item.cake_design_text || "").trim();
  const shapeLabel = item.cake_shape === "round" ? "Round" : "Sheet / square";
  const notes = (item.cake_notes || "").trim();
  const deliverBy = ticketDeliverBy(a, item);
  const addr = (item.recipient_address || "").trim();
  const phone = (item.recipient_phone || "").trim();
  const email = (item.recipient_email || "").trim();
  const special = (a.special_instructions || "").trim();

  const cardOn = !!item.card_enabled;
  const cardMsg = (item.card_message || "").trim();
  // Every DESIGNED card ships branded: the customer's artwork on the front,
  // the Daymaker mark on the reverse (a fixed asset, same on every card).
  // A message-only card has nothing to print — the back never ships without
  // the customer's front (see downloadCakeFiles) — so its ticket must not
  // instruct a print the bakery was never given files for.
  const cardBody = cardOn
    ? `${cardMsg ? `<p class="ticket__card-msg">"${escape(cardMsg)}"</p>` : `<p class="ticket__muted">Custom card design (no message text).</p>`}
       ${
         item.card_image_url
           ? `<div class="ticket__card-sides">
         <div class="ticket__card-side">
           <p class="ticket__card-side-lbl">Front</p>
           ${ticketImg(item.card_image_url, `Card design for ${item.recipient_name || "recipient"}`, false)}
         </div>
         <div class="ticket__card-side">
           <p class="ticket__card-side-lbl">Back — print on the reverse</p>
           ${ticketImg(CARD_BACK_URL, "Daymaker card back", false)}
         </div>
       </div>`
           : `<p class="ticket__muted">Message only, nothing to print for the card.</p>`
       }`
    : `<p class="ticket__muted">No card.</p>`;

  return `
    <article class="ticket">
      <header class="ticket__head">
        <div class="ticket__head-l">
          <p class="ticket__kicker">Production ticket</p>
          <p class="ticket__order">${escape(orderRef)}${bakery}</p>
        </div>
        <div class="ticket__head-r">Cake ${n} of ${total}</div>
      </header>

      <div class="ticket__sec ticket__sec--make">
        <h3 class="ticket__sec-h">Make</h3>
        <p class="ticket__cake-label"><strong>${escape(item.cake_label || "Cake")}</strong> · ${escape(shapeLabel)}</p>
        ${onCake
          ? `<div class="ticket__oncake"><span class="ticket__oncake-lbl">Write on cake</span><span class="ticket__oncake-txt">"${escape(onCake)}"</span></div>`
          : `<p class="ticket__muted">No text on the cake.</p>`}
        ${notes ? `<p class="ticket__notes"><strong>Notes:</strong> ${escape(notes)}</p>` : ""}
        ${item.cake_image_url
          ? ticketImg(item.cake_image_url, `Cake print for ${item.recipient_name || "recipient"}`, item.cake_shape === "round")
          : `<p class="ticket__muted">No cake print uploaded.</p>`}
      </div>

      <div class="ticket__sec">
        <h3 class="ticket__sec-h">Deliver to</h3>
        <p class="ticket__recipient"><strong>${escape(item.recipient_name || "-")}</strong></p>
        ${addr ? `<p class="ticket__addr">${escape(addr)}</p>` : ""}
        <p class="ticket__deliver-by"><strong>Deliver by:</strong> ${escape(deliverBy)}</p>
        ${phone ? `<p class="ticket__contact"><strong>Phone:</strong> ${escape(phone)}</p>` : ""}
        ${email ? `<p class="ticket__contact"><strong>Email:</strong> ${escape(email)}</p>` : ""}
      </div>

      <div class="ticket__sec">
        <h3 class="ticket__sec-h">Card to include</h3>
        ${cardBody}
      </div>

      ${special
        ? `<div class="ticket__sec ticket__special"><h3 class="ticket__sec-h">Special instructions</h3><p>${escape(special)}</p></div>`
        : ""}

      <footer class="ticket__foot">Daymaker · ${escape(orderRef)} · printed for production</footer>
    </article>`;
}

// Build the full set of tickets. One per live (non-failed) cake; failed
// cakes are dropped so production never bakes a cancelled one. Falls back to
// a single assignment-level ticket for legacy rows with no cake_items.
function buildTicketsHtml(a) {
  const all = Array.isArray(a.cake_items) ? a.cake_items : [];
  if (all.length === 0) {
    return ticketHtml(
      {
        recipient_name: a.recipient_name,
        recipient_address: a.recipient_address,
        recipient_phone: a.recipient_phone,
        recipient_email: a.recipient_email,
        cake_label: a.product_description || "as ordered",
      },
      1,
      1,
      a,
    );
  }
  const live = all.filter((it) => it.status !== "failed");
  if (live.length === 0) return "";
  return live.map((it, i) => ticketHtml(it, i + 1, live.length, a)).join("");
}

// Let design images decode before we hand off to the print dialog, so they
// aren't blank on the printout. Resolves on load/error, with a hard timeout
// so a stuck image can never block printing.
function waitForImages(root, timeoutMs = 2000) {
  const pending = Array.from(root.querySelectorAll("img")).filter(
    (img) => !(img.complete && img.naturalWidth > 0),
  );
  if (pending.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let done = 0;
    const tick = () => {
      if (++done >= pending.length) resolve();
    };
    pending.forEach((img) => {
      img.addEventListener("load", tick, { once: true });
      img.addEventListener("error", tick, { once: true });
    });
    setTimeout(resolve, timeoutMs);
  });
}

async function printProductionTickets() {
  const a = state.assignment;
  if (!a || !els.ticketPrintHost) return;
  const html = buildTicketsHtml(a);
  if (!html) {
    setActionResult("Nothing to print - every cake on this order is marked unsuccessful.", true);
    return;
  }
  els.ticketPrintHost.innerHTML = html;
  wireImageFallbacks(els.ticketPrintHost);
  // Rasterize any PDF prints into their ticket frames before the print
  // dialog opens — renderPdfPreviews resolves on failure too, so a bad
  // PDF still prints (with the text fallback) rather than blocking.
  await renderPdfPreviews(els.ticketPrintHost);
  await waitForImages(els.ticketPrintHost);
  document.body.classList.add("is-printing-tickets");
  const cleanup = () => {
    document.body.classList.remove("is-printing-tickets");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  // Safety net: some browsers fire afterprint unreliably (or not at all if
  // the dialog is dismissed oddly), so always clear the print state.
  setTimeout(cleanup, 60_000);
  window.print();
}
export {
  printProductionTickets,
};
