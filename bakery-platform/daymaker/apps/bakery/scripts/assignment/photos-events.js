// Extracted from bakery-assignment.js — photos-events cluster.
// All sibling imports share one ?v= pin; bump them in lockstep
// (they must resolve to the same module instances).
import { escape } from "/scripts/api.js";
import { els } from "./core.js?v=20260729unified2";
import { fmtEventTime } from "./format.js?v=20260729unified2";
import {
  isVideoUrl,
  openImageLightbox,
  optimizedSrc,
  wireImageFallbacks,
} from "./media.js?v=20260729unified2";


function renderPhotos(a) {
  const items = Array.isArray(a.cake_items) ? a.cake_items : [];
  const photos = [];

  if (items.length > 0) {
    items.forEach((it, i) => {
      if (it.cake_photo_url) {
        photos.push({
          url: it.cake_photo_url,
          cake_num: i + 1,
          recipient: it.recipient_name,
          stage: "cake",
          caption: "from the oven",
        });
      }
      if (it.delivery_photo_url) {
        photos.push({
          url: it.delivery_photo_url,
          cake_num: i + 1,
          recipient: it.recipient_name,
          stage: "delivery",
          caption: "delivered",
        });
      }
    });
  } else {
    if (a.production_photo_url) photos.push({ url: a.production_photo_url, cake_num: 1, recipient: a.recipient_name, stage: "cake", caption: "from the oven" });
    if (a.delivery_photo_url) photos.push({ url: a.delivery_photo_url, cake_num: 1, recipient: a.recipient_name, stage: "delivery", caption: "delivered" });
  }

  if (photos.length === 0) {
    els.photosCard.hidden = true;
    return;
  }
  els.photosCard.hidden = false;
  els.photoGrid.innerHTML = photos
    .map(
      (p) => `
      <figure class="polaroid">
        <div class="polaroid__frame" data-action="view-photo" data-src="${escape(p.url)}" data-label="${escape(`${p.caption} - ${p.recipient}`)}" role="button" tabindex="0" title="${escape(`Cake ${p.cake_num} - ${p.caption}`)}" aria-label="View ${escape(p.caption)} for ${escape(p.recipient)}" style="cursor:pointer; position:relative;">
          ${isVideoUrl(p.url)
            ? `<video src="${escape(p.url)}#t=0.1" muted playsinline preload="metadata" style="display:block; width:100%; height:100%; object-fit:cover; pointer-events:none;"></video><span aria-hidden="true" style="position:absolute; inset:0; display:grid; place-items:center; font-size:34px; color:#fff; text-shadow:0 1px 6px rgba(0,0,0,0.65); pointer-events:none;">▶</span>`
            : `<img src="${escape(optimizedSrc(p.url, 828))}"${optimizedSrc(p.url, 828) !== p.url ? ` data-fallback="${escape(p.url)}"` : ""} alt="${escape(p.caption)} for ${escape(p.recipient)}" loading="lazy" decoding="async" style="pointer-events:none;" />`}
        </div>
        <!-- The name, and only the name. This used to stack three lines under
             every photo - "CAKE 1", the recipient, and a big pink "from the
             oven" - which shouted the stage the photo already shows. The
             stage still rides along in the tile's aria-label and the
             lightbox caption, so nothing is lost where it's useful. -->
        <figcaption class="polaroid__caption">
          <span class="polaroid__who">${escape(p.recipient)}</span>
        </figcaption>
      </figure>`,
    )
    .join("");
  wireImageFallbacks(els.photoGrid);
  // Click (or Enter/Space) a photo-trail tile to open it full-screen. Videos
  // open with controls; images open uncropped - both via openImageLightbox.
  els.photoGrid.querySelectorAll("[data-action='view-photo']").forEach((node) => {
    const open = () =>
      openImageLightbox(node.getAttribute("data-src"), node.getAttribute("data-label"));
    node.addEventListener("click", open);
    node.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
  });
}

// We don't store a separate events table for assignments; derive a timeline
// from the timestamps on the row.
//
// Each row used to lead with an emoji in a bubble (📥 👋 📸 📍 🎁 ↩️ 🚫). They
// carried no information the label next to them didn't already carry, they
// render differently on every OS, and a picture-per-line turned a plain audit
// trail into decoration. A timeline dot marks the position instead, and the
// newest entry is the one that's filled in.
function renderEvents(a) {
  // A VC order arrives with a real events table, already shaped as
  // [{at, msg}] by the source adapter. An assignment has no events table, so
  // its timeline is derived from the timestamps on the row.
  const events = Array.isArray(a.events) ? a.events.slice() : [];
  if (events.length === 0) {
    if (a.created_at) events.push({ at: a.created_at, msg: "Assignment created" });
    if (a.accepted_at) events.push({ at: a.accepted_at, msg: "Accepted by the bakery" });
    if (a.production_photo_url) events.push({ at: a.updated_at, msg: "Cake photo uploaded" });
    if (a.delivery_photo_url) events.push({ at: a.updated_at, msg: "Delivery photo uploaded" });
    if (a.completed_at) events.push({ at: a.completed_at, msg: "Marked complete" });
    if (a.status === "cancelled") events.push({ at: a.updated_at, msg: "Cancelled" });
      if (a.status === "failed") events.push({ at: a.updated_at, msg: "Delivery failed" });
  }
  if (events.length === 0) {
    els.eventsList.innerHTML = `<li class="diary__loading">No events yet.</li>`;
    return;
  }
  const sorted = events.sort((x, y) => (x.at < y.at ? 1 : -1));
  els.eventsList.innerHTML = sorted
    .map(
      (e) => `
      <li>
        <span class="diary__dot" aria-hidden="true"></span>
        <div class="diary__body">
          <span class="diary__msg">${escape(e.msg)}</span>
          <span class="diary__time">${escape(fmtEventTime(e.at))}</span>
        </div>
      </li>`,
    )
    .join("");
}
export {
  renderEvents,
  renderPhotos,
};
