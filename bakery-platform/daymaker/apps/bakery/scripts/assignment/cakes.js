// Extracted from bakery-assignment.js — cakes cluster.
// All sibling imports share one ?v= pin; bump them in lockstep
// (they must resolve to the same module instances).
import { escape } from "/scripts/api.js";
import { renderPdfPreviews } from "/scripts/pdf-preview.js";
import { els } from "./core.js?v=20260729unified2";
import { telHref } from "./format.js?v=20260729unified2";
import {
  CARD_BACK_URL,
  designThumbHtml,
  initCropPans,
  openImageLightbox,
  wireImageFallbacks,
} from "./media.js?v=20260729unified2";
import { setActionResult } from "./actions.js?v=20260729unified2";
import { qrImageUrl } from "./source.js?v=20260729unified2";


function renderCakes(a) {
  const items = Array.isArray(a.cake_items) ? a.cake_items : [];
  if (!els.cakesTable) return;
  if (items.length === 0) {
    els.cakesTable.setAttribute("aria-busy", "false");
    els.cakesTable.innerHTML = `
      <div class="cakes-empty">
        <p>No per-cake breakdown for this assignment.</p>
        <p class="quiet">Make: <strong>${escape(a.product_description || "as ordered")}</strong></p>
      </div>`;
    return;
  }
  els.cakesTable.setAttribute("aria-busy", "false");
  els.cakesTable.innerHTML = `
    <div class="cakes-table__head" role="rowgroup">
      <div class="cakes-table__row cakes-table__row--head" role="row">
        <span class="cakes-table__col cakes-table__col--num"       role="columnheader">#</span>
        <span class="cakes-table__col cakes-table__col--recipient" role="columnheader">Recipient</span>
        <span class="cakes-table__col cakes-table__col--cake"      role="columnheader">Cake design</span>
        <span class="cakes-table__col cakes-table__col--card"      role="columnheader">Card</span>
        <span class="cakes-table__col cakes-table__col--actions"   role="columnheader">Files</span>
      </div>
    </div>
    <div class="cakes-table__body" role="rowgroup">
      ${items.map((it, i) => cakeRow(it, i + 1)).join("")}
    </div>
  `;
  initCropPans(els.cakesTable);
  wireImageFallbacks(els.cakesTable);
  // Upgrade any PDF-print badges to first-page thumbnails (no-op when
  // every design is a plain image).
  void renderPdfPreviews(els.cakesTable);

  // Wire per-row download buttons
  els.cakesTable.querySelectorAll("[data-action='download-cake']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cakeId = btn.getAttribute("data-cake-id");
      const item = items.find((c) => c.id === cakeId);
      if (item) downloadCakeFiles(item, items.indexOf(item) + 1, a.id);
    });
  });

  // Click (or Enter/Space) on a print/card thumbnail opens it full size, so
  // the bakery can read the design without downloading it first.
  els.cakesTable.querySelectorAll("[data-action='view-image']").forEach((node) => {
    const open = () =>
      openImageLightbox(
        node.getAttribute("data-src"),
        node.getAttribute("data-label"),
        node.getAttribute("data-src-full"),
      );
    node.addEventListener("click", open);
    node.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
  });
}

function cakeRow(item, n) {
  // Card cell: design + message. Customers who skip the card step may
  // still want a plain note with the cake (see Special instructions),
  // so the empty state must not read as "send nothing". The branded back
  // only rides a designed front (see downloadCakeFiles) — a message-only
  // card has nothing to print, so promise no double-sided print for it.
  const card = item.card_enabled
    ? `<div class="cake-cell">
        ${item.card_image_url ? designThumbHtml(item.card_image_url, "cake-cell__thumb--card", `Card - ${item.recipient_name}`, "Card design", item.box_card_crop) : ""}
        ${item.card_image_url && !item.card_generated ? designThumbHtml(CARD_BACK_URL, "cake-cell__thumb--card", "Card back - Daymaker", "Card back", null) : ""}
        <div class="cake-cell__body">
          ${item.card_message
            ? `<em class="cake-cell__msg">${escape(item.card_message)}</em>`
            : item.card_image_url
              // The thumbnail IS the card. Labelling it "Custom card", in a
              // column already headed Card, said nothing twice.
              ? ""
              : `<span class="quiet">Custom card</span>`}
          ${item.card_generated
            ? ""
            : `<span class="quiet">${item.card_image_url ? "Front + back in one PDF (print double-sided)" : "Message only, no printed card"}</span>`}
        </div>
      </div>`
    : `<span class="cake-cell__none">No specific card design</span>`;

  // Cake design cell: reference image, label, design text printed on the cake, notes
  const designText = item.cake_design_text
    ? `<span class="cake-cell__design-text">Print on cake: <strong>"${escape(item.cake_design_text)}"</strong></span>`
    : "";

  // Download button — disabled when nothing to download
  const hasFiles = !!(item.cake_image_url || item.card_image_url || item.design_file_url);
  const downloadBtn = hasFiles
    ? `<button type="button" class="cake-download-btn" data-action="download-cake" data-cake-id="${escape(item.id)}" title="Download all design files for ${escape(item.recipient_name)}">
        ↓ Download
       </button>`
    : `<span class="cake-cell__none">no files</span>`;

  return `
    <div class="cakes-table__row" role="row" data-cake-num="${n}">
      <div class="cakes-table__col cakes-table__col--num" role="cell" data-label="#">${n}</div>
      <div class="cakes-table__col cakes-table__col--recipient" role="cell" data-label="Recipient">
        <strong>${escape(item.recipient_name)}</strong>
        ${item.recipient_address ? `<span class="quiet">${escape(item.recipient_address)}</span>` : ""}
        ${item.recipient_phone ? `<span class="quiet"><a href="tel:${escape(telHref(item.recipient_phone))}">${escape(item.recipient_phone)}</a></span>` : ""}
        ${item.recipient_email ? `<span class="quiet"><a href="mailto:${escape(item.recipient_email)}">${escape(item.recipient_email)}</a></span>` : ""}
      </div>
      <div class="cakes-table__col cakes-table__col--cake" role="cell" data-label="Cake design">
        <div class="cake-cell">
          ${item.cake_image_url ? designThumbHtml(item.cake_image_url, `cake-cell__thumb--${item.cake_shape === "round" ? "round" : "square"}`, `Cake print — ${item.recipient_name}`, "Cake design", item.cake_print_crop) : ""}
          <div class="cake-cell__body">
            <strong>${escape(item.cake_label)}</strong>
            ${designText}
            ${item.cake_notes ? `<em class="quiet">${escape(item.cake_notes)}</em>` : ""}
          </div>
        </div>
      </div>
      <div class="cakes-table__col cakes-table__col--card" role="cell" data-label="Card">${card}</div>
      <div class="cakes-table__col cakes-table__col--actions" role="cell" data-label="Files">${downloadBtn}</div>
    </div>
  `;
}

// Mirrors the gate cropImgHtml uses: only orders that predate client-side
// crop baking carry a {scale,x,y} transform the file itself doesn't show.
function hasLegacyCrop(crop) {
  return !!crop && typeof crop.scale === "number";
}

function printFileUrl(assignmentId, cakeItemId, file) {
  return `/api/v1/bakery/assignments/${encodeURIComponent(assignmentId)}/cake-items/${encodeURIComponent(cakeItemId)}/${file}`;
}

// The print-file endpoint needs the same bearer the JSON API gets; the
// blob comes back as an object URL for the anchor-click download.
async function authedBlobUrl(url) {
  await window.bakeryPlatformAuth.ready;
  const token = await window.bakeryPlatformAuth.getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`print file HTTP ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

/**
 * Download the print set for one cake. Filenames include the cake number
 * and recipient name so the bakery never confuses which delivery a file
 * belongs to.
 *   cake-1-Maria-Hansen-design.png   (original upload unless a legacy
 *                                     crop needs baking server-side)
 *   cake-1-Maria-Hansen-card.pdf     (front + Daymaker back, 4×6in —
 *                                     prints double-sided as-is)
 * If composing a print file fails, that slot falls back to the raw
 * design files the button used to ship (front + back SVG for the card),
 * so the bakery always gets SOMETHING to print.
 */
async function downloadCakeFiles(item, n, assignmentId) {
  const slug = String(item.recipient_name || "recipient")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const files = [];
  // A VC cake's "design" IS a QR code, generated rather than uploaded: hand
  // over the print-resolution render, not the 640px one the table shows.
  if (item.qr_target) {
    files.push({ url: qrImageUrl(item.qr_target, 1200), suffix: "qr" });
    if (item.design_file_url) files.push({ url: item.design_file_url, suffix: "deck" });
  } else if (item.cake_image_url) {
    const needsBake = hasLegacyCrop(item.cake_print_crop);
    files.push({
      url: needsBake
        ? printFileUrl(assignmentId, item.id, "cake-print.png")
        : item.cake_image_url,
      suffix: "design",
      authed: needsBake,
      fallbacks: needsBake ? [{ url: item.cake_image_url, suffix: "design" }] : [],
    });
  }
  if (item.card_generated && item.card_image_url) {
    // Drawn client-side; there is no server-side PDF to ask for.
    files.push({ url: item.card_image_url, suffix: "card" });
  } else if (item.card_image_url) {
    files.push({
      url: printFileUrl(assignmentId, item.id, "card.pdf"),
      suffix: "card",
      authed: true,
      // The branded reverse ships with the card, never on its own - a card
      // back with no front is just a Daymaker flyer in the box.
      fallbacks: [
        { url: item.card_image_url, suffix: "card" },
        { url: CARD_BACK_URL, suffix: "card-back" },
      ],
    });
  }
  if (files.length === 0) return;

  let downloaded = 0;
  const clickDownload = async (href, suffix, ext) => {
    // Browsers (Chrome especially) silently drop a second programmatic
    // download that fires immediately after the first, which is why the
    // card (always the 2nd file) never landed. Space the clicks out.
    if (downloaded > 0) await new Promise((resolve) => setTimeout(resolve, 800));
    const filename = `cake-${n}-${slug}-${suffix}.${ext}`;
    await triggerDownload(href, filename);
    downloaded++;
  };

  for (const f of files) {
    try {
      if (f.authed) {
        // The composed file needs the bearer; hand the anchor the already
        // fetched bytes so nothing re-requests the endpoint tokenless.
        const objectUrl = await authedBlobUrl(f.url);
        try {
          await clickDownload(objectUrl, f.suffix, guessExtension(f.url));
        } finally {
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
        }
      } else {
        await clickDownload(f.url, f.suffix, guessExtension(f.url));
      }
    } catch (err) {
      console.warn("print_file_failed", { url: f.url, err });
      for (const fb of f.fallbacks || []) {
        try {
          await clickDownload(fb.url, fb.suffix, guessExtension(fb.url));
        } catch (fbErr) {
          console.warn("download_failed", { url: fb.url, err: fbErr });
        }
      }
    }
  }
  setActionResult(`Downloaded ${downloaded} file(s) for ${item.recipient_name}.`);
}

function guessExtension(url) {
  if (url.startsWith("data:image/svg")) return "svg";
  if (url.startsWith("data:image/png")) return "png";
  if (url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg")) return "jpg";
  const m = /\.(svg|png|jpg|jpeg|webp|heic|heif|pdf)(?:\?|$)/i.exec(url);
  return m ? m[1].toLowerCase() : "png";
}

async function triggerDownload(url, filename) {
  // For data:/blob: URIs and same-origin URLs, an anchor with [download]
  // is enough. For cross-origin URLs we'd need a CORS-friendly server
  // proxy; the dev mock uses data URIs so this works as-is.
  let href = url;
  if (!url.startsWith("data:") && !url.startsWith("blob:")) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        href = URL.createObjectURL(blob);
      }
    } catch {
      // Fall back to the original URL if fetch fails.
    }
  }
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (href !== url) setTimeout(() => URL.revokeObjectURL(href), 1500);
}
export {
  renderCakes,
};
