// Extracted from bakery-assignment.js — summary cluster.
// All sibling imports share one ?v= pin; bump them in lockstep
// (they must resolve to the same module instances).
import { escape } from "/scripts/api.js";
import { STATUS_LABEL, SUB_FOR_STATUS, els } from "./core.js?v=20260729unified2";
import { fmtMoney, fmtScheduledDate, telHref } from "./format.js?v=20260729unified2";


// ─── Render ─────────────────────────────────────────────────

function renderHero(a) {
  els.shell.hidden = false;
  els.gate.hidden = true;
  els.errorCard.hidden = true;

  // A VC order has a human order number ("CC-2418"); an assignment only has
  // a uuid, so it shows a short slice of one.
  const short = a.order_ref || `#${(a.id || "").slice(0, 8)}`;
  els.num.textContent = short;
  // Campaign assignments stuff batch summaries into both recipient_name
  // and product_description, so combining them reads like nonsense
  // ('1 cake for "#15" for #15 · 1 cake'). Build the headline from the
  // cake count + the customer who ordered instead.
  const items = Array.isArray(a.cake_items) ? a.cake_items : [];
  const n = items.length || 1;
  // Name the campaign or the company, never the raw inbox address. The
  // email is still shown in the summary aside under "Ordered by", which is
  // where you go to contact someone.
  const orderedBy =
    a.campaign_name || a.customer_name || a.recipient_name || a.customer_email || "this order";
  els.title.textContent = `${n} ${n === 1 ? "cake" : "cakes"} for ${orderedBy}`;
  // Was a tilted Caveat line ("you're mid-bake. snap a photo when it's
  // pretty."). The subtitle slot now carries the delivery commitment,
  // which is the thing a baker actually needs off the top of the page.
  // Terminal orders drop back to the status line: a closed-out order must
  // not keep telling the bakery to "Deliver <date>", least of all one whose
  // cakes were all marked unsuccessful.
  const closedOut = ["delivered", "failed", "cancelled"].includes(a.status);
  const items0 = items[0] || {};
  const heroDate = a.scheduled_date || items0.delivery_window_start || null;
  els.sub.textContent = heroDate && !closedOut
    ? `Deliver ${fmtScheduledDate(heroDate)}`
    : SUB_FOR_STATUS[a.status] || "";
  // The "Accepted" state is the default landing state (customer already
  // paid), so its blue pill is just noise - hide it. Legacy "pending" rows
  // are treated the same as accepted, so hide those too.
  const hidePill = a.status === "accepted" || a.status === "pending";
  els.statusPill.textContent = STATUS_LABEL[a.status] || a.status;
  els.statusPill.dataset.status = a.status;
  els.statusPill.hidden = hidePill;
  document.title = `${STATUS_LABEL[a.status] || a.status} ${short} · Bakery`;
  if (els.footId) els.footId.textContent = a.id || "";
}

function renderCakeCount(a) {
  const items = Array.isArray(a.cake_items) ? a.cake_items : [];
  const n = items.length || 1;
  if (els.cakeCountChip) {
    els.cakeCountChip.hidden = false;
    els.cakeCountChip.textContent = `${n} ${n === 1 ? "cake" : "cakes"}`;
  }
  if (els.cakeSectionCount) {
    els.cakeSectionCount.textContent = `· ${n}`;
  }
}

function renderSummary(a) {
  const items = Array.isArray(a.cake_items) ? a.cake_items : [];
  const n = items.length || 1;
  // Customer-set window lives on cake_items[*].delivery_window_*; we
  // read it off the first item since the whole batch shares it.
  // Falls back to assignment.scheduled_date for legacy single-VC orders.
  const windowStart = items[0]?.delivery_window_start || a.scheduled_date || null;
  const windowEnd = items[0]?.delivery_window_end || null;
  const startLbl = fmtScheduledDate(windowStart);
  const endLbl = fmtScheduledDate(windowEnd);
  // One day is a date, not a "window" - calling a single committed Thursday a
  // delivery window is the kind of label that makes a summary read like a
  // form dump. Only a real range keeps the word.
  let scheduledCopy;
  let scheduledLabel = "Delivery date";
  if (startLbl && endLbl && startLbl !== endLbl) {
    scheduledCopy = `${startLbl} to ${endLbl}`;
    scheduledLabel = "Delivery window";
  } else if (startLbl) {
    scheduledCopy = startLbl;
  } else {
    scheduledCopy = "ASAP, bakery decides";
  }
  // What the bakery invoices us, in the currency the bakery priced in.
  // NOT payout_amount_cents — that field is USD on every order, so rendering
  // it here showed a Canadian bakery owed CA$72.00 the figure "CA$53".
  // The API resolves payout_local_cents + payout_currency for both new rows
  // (frozen at materialization) and older ones (converted on read).
  const payout =
    typeof a.payout_local_cents === "number"
      ? fmtMoney(a.payout_local_cents, a.payout_currency)
      : null;
  const sourceBadge =
    a.source && a.source !== "manual"
      ? `<span class="source-badge source-badge--${escape(a.source)}">${escape(a.source)}</span>`
      : `<span class="quiet">manual</span>`;
  // For campaign-source assignments, the assignment row's recipient_* fields
  // are the batch summary (e.g. "Q3 outreach · 14 cakes"), not a contact.
  // The detail handler attaches the real customer (the person who paid) as
  // a.customer_*. Prefer those when present, fall back to recipient_* for
  // VC / single-manual orders that don't have a campaign customer.
  const contactName  = a.customer_name  || a.recipient_name  || null;
  const contactEmail = a.customer_email || a.recipient_email || null;
  const contactPhone = a.customer_phone || a.recipient_phone || null;

  // Recipient contacts now live in their own downloadable "Recipients" table
  // (see renderRecipients); the order summary keeps just the high-level info
  // plus who ordered.
  els.detailDl.setAttribute("aria-busy", "false");
  // No "Assignment #abc12345" row: the same reference is already in the page
  // header and the full id is in the footer, and three copies of an order
  // number is two too many.
  els.detailDl.innerHTML = `
    <div>
      <dt>Cakes in this order</dt>
      <dd><strong>${n} ${n === 1 ? "cake" : "cakes"}</strong></dd>
    </div>
    <div id="summary-delivery-row">
      <dt>${escape(scheduledLabel)}</dt>
      <dd>${escape(scheduledCopy)}</dd>
    </div>
    <div>
      <dt>Source</dt>
      <dd>${sourceBadge}</dd>
    </div>
    ${payout ? `
    <div>
      <dt>You invoice us</dt>
      <dd class="total">${escape(payout)}</dd>
    </div>` : ""}
    <div>
      <dt>Ordered by</dt>
      <dd>
        <strong>${escape(contactName || "-")}</strong>
        ${contactEmail ? `<span class="quiet"><a href="mailto:${escape(contactEmail)}">${escape(contactEmail)}</a></span>` : ""}
        ${contactPhone ? `<span class="quiet">${escape(contactPhone)}</span>` : ""}
      </dd>
    </div>
    ${(a.special_instructions || "").trim() ? `
    <div>
      <dt>Special instructions</dt>
      <dd>${escape(a.special_instructions)}</dd>
    </div>` : ""}
  `;
}

// ─── Recipients table (downloadable) ────────────────────────
// One row per recipient with their contact details. Collapsed after a few
// rows ("see more"); exportable as CSV/TSV so the bakery can pull the whole
// delivery list in one go.
const RECIPIENTS_COLLAPSED = 2;

function recipientRows(a) {
  const items = Array.isArray(a.cake_items) ? a.cake_items : [];
  const rows = [];
  const seen = new Set();
  const push = (name, address, phone, email, id) => {
    const r = {
      name: (name || "").trim(),
      address: (address || "").trim(),
      phone: (phone || "").trim(),
      email: (email || "").trim(),
    };
    if (!r.name && !r.address && !r.phone && !r.email) return;
    const key = id || `${r.name}|${r.address}|${r.phone}|${r.email}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(r);
  };
  if (items.length > 0) {
    items.forEach((it) =>
      push(
        it.recipient_name,
        it.recipient_address,
        it.recipient_phone,
        it.recipient_email,
        it.recipient_id,
      ),
    );
  } else {
    push(a.recipient_name, a.recipient_address, a.recipient_phone, a.recipient_email);
  }
  return rows;
}

function renderRecipients(a) {
  if (!els.recipientsCard || !els.recipientsTable) return;
  const rows = recipientRows(a);
  if (rows.length === 0) {
    els.recipientsCard.hidden = true;
    return;
  }
  els.recipientsCard.hidden = false;
  if (els.recipientsCount) els.recipientsCount.textContent = `· ${rows.length}`;

  const collapsible = rows.length > RECIPIENTS_COLLAPSED;
  const dash = `<span class="quiet">-</span>`;
  const bodyRows = rows
    .map((r, i) => {
      const extra = collapsible && i >= RECIPIENTS_COLLAPSED ? " is-extra" : "";
      const phone = r.phone
        ? `<a href="tel:${escape(telHref(r.phone))}">${escape(r.phone)}</a>`
        : dash;
      const email = r.email
        ? `<a href="mailto:${escape(r.email)}">${escape(r.email)}</a>`
        : dash;
      return `
        <tr class="recipients-row${extra}">
          <td class="recipients-cell recipients-cell--num">${i + 1}</td>
          <td class="recipients-cell">${escape(r.name) || dash}</td>
          <td class="recipients-cell">${escape(r.address) || dash}</td>
          <td class="recipients-cell">${phone}</td>
          <td class="recipients-cell">${email}</td>
        </tr>`;
    })
    .join("");

  els.recipientsTable.innerHTML = `
    <div class="recipients-tools">
      <button type="button" class="recipients-dl" data-dl="csv">Download recipient information</button>
    </div>
    <div class="recipients-scroll">
      <table class="recipients-table" data-collapsed="${collapsible ? "true" : "false"}">
        <thead>
          <tr>
            <th class="recipients-cell--num">#</th>
            <th>Name</th>
            <th>Address</th>
            <th>Phone</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    ${collapsible
      ? `<button type="button" class="recipients-more" data-action="toggle-recipients" aria-expanded="false">See more (${rows.length - RECIPIENTS_COLLAPSED} more)</button>`
      : ""}
  `;

  els.recipientsTable.querySelectorAll("[data-dl]").forEach((btn) => {
    btn.addEventListener("click", () =>
      downloadRecipients(rows, btn.getAttribute("data-dl"), a.id),
    );
  });

  const moreBtn = els.recipientsTable.querySelector("[data-action='toggle-recipients']");
  const table = els.recipientsTable.querySelector(".recipients-table");
  if (moreBtn && table) {
    moreBtn.addEventListener("click", () => {
      const collapsed = table.getAttribute("data-collapsed") === "true";
      table.setAttribute("data-collapsed", collapsed ? "false" : "true");
      moreBtn.setAttribute("aria-expanded", collapsed ? "true" : "false");
      moreBtn.textContent = collapsed
        ? "Show less"
        : `See more (${rows.length - RECIPIENTS_COLLAPSED} more)`;
    });
  }
}

// Build CSV/TSV text from the recipient rows and trigger a file download.
function downloadRecipients(rows, format, assignmentId) {
  const delim = format === "tsv" ? "\t" : ",";
  const header = ["Name", "Address", "Phone", "Email"];
  const escCsv = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const escTsv = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ");
  const cell = format === "tsv" ? escTsv : escCsv;
  const text = [header, ...rows.map((r) => [r.name, r.address, r.phone, r.email])]
    .map((cols) => cols.map(cell).join(delim))
    .join("\r\n");
  // Prepend a BOM so Excel reads UTF-8 (accented names) correctly.
  const blob = new Blob(["﻿" + text], {
    type: `${format === "tsv" ? "text/tab-separated-values" : "text/csv"};charset=utf-8`,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `recipients-${String(assignmentId || "order").slice(0, 8)}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export {
  renderCakeCount,
  renderHero,
  renderRecipients,
  renderSummary,
};
