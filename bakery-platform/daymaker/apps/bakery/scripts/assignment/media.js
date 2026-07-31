// Extracted from bakery-assignment.js — media cluster.
// All sibling imports share one ?v= pin; bump them in lockstep
// (they must resolve to the same module instances).
import { escape } from "/scripts/api.js";


// The reverse of every campaign card: the Daymaker mark + "delivered by
// daymaker.com", as a 4×6 portrait vector (300dpi-safe at any print size).
// A FIXED asset on purpose — branding the customer's own artwork would mean
// compositing every upload format we accept (PNG/JPG/HEIC/PDF), and would
// put our mark on top of a design they paid to control. Served from
// /brand/ (see the vercel.json rewrite), so it prints identically on every
// card of every order.
const CARD_BACK_URL = "/brand/card-back.svg";

/**
 * Full-screen preview for a print or card image. Shows the raw file
 * (object-fit: contain, so nothing is cropped) over a dark backdrop.
 * Closes on the × button, a backdrop click, or Escape.
 */
function openImageLightbox(src, label, fallback) {
  if (!src) return;
  const isVid = isVideoUrl(src);
  const fb = !isVid && fallback && fallback !== src ? ` data-fallback="${escape(fallback)}"` : "";
  const mediaHtml = isVid
    ? `<video class="img-lightbox__image" src="${escape(src)}" controls autoplay muted loop playsinline style="max-width:100%; max-height:80vh; object-fit:contain; background:#000;"></video>`
    : `<img class="img-lightbox__image" src="${escape(src)}"${fb} alt="${escape(label || "Design preview")}" />`;
  const backdrop = document.createElement("div");
  backdrop.className = "img-lightbox";
  backdrop.innerHTML = `
    <div class="img-lightbox__dialog" role="dialog" aria-modal="true" aria-label="${escape(label || "Design preview")}">
      <div class="img-lightbox__header">
        <h2 class="img-lightbox__title">${escape(label || "Design preview")}</h2>
        <button type="button" class="img-lightbox__close" aria-label="Close preview">×</button>
      </div>
      <div class="img-lightbox__body">
        ${mediaHtml}
      </div>
    </div>
  `;
  if (!isVid) wireImageFallbacks(backdrop);
  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    backdrop.remove();
  };
  const onKeydown = (ev) => {
    if (ev.key === "Escape") close();
  };
  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) close();
  });
  backdrop.querySelector(".img-lightbox__close")?.addEventListener("click", close);
  document.addEventListener("keydown", onKeydown);
  document.body.appendChild(backdrop);
  backdrop.querySelector(".img-lightbox__close")?.focus();
}

// Reproduce a saved crop transform {scale,x,y} on a thumbnail. The thumb
// frame is the same shape the customer cropped in (circle for the cake, 2:3
// for the card), so the visible region matches what they set.
function cropStyle(crop) {
  if (!crop || typeof crop !== "object") return "";
  const s = typeof crop.scale === "number" ? crop.scale : 1;
  const x = typeof crop.x === "number" ? crop.x : 0;
  const y = typeof crop.y === "number" ? crop.y : 0;
  return `transform: translate(${x}%, ${y}%) scale(${s}); transform-origin: center center;`;
}

// ─── Image optimization ─────────────────────────────────────
// Cake/delivery/design photos live on Vercel Blob at full camera resolution
// (multi-MB). Rendered raw, the browser downloads the whole file for a
// thumbnail, which is slow and sometimes leaves the <img> blank until the
// decode finishes. Route blob images through Vercel's image optimizer
// (/_vercel/image, configured in vercel.json) so they're resized + served as
// WebP at the size we actually display. Allowlisted to Blob https hosts only
// (the optimizer 400s on un-allowlisted hosts); data:/blob:/other URLs pass
// through untouched. `width` snaps to a configured size; keep IMG_SIZES in
// sync with vercel.json `images.sizes`.
const IMG_SIZES = [64, 128, 256, 384, 640, 828, 1080, 1600, 1920];
function optimizedSrc(url, width) {
  if (typeof url !== "string" || !url) return url;
  if (!/^https:\/\/[^/]*\.public\.blob\.vercel-storage\.com\//i.test(url)) return url;
  const w = IMG_SIZES.find((s) => s >= width) || IMG_SIZES[IMG_SIZES.length - 1];
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
}

// A cake/delivery photo can also be a short video clip. Videos can't go
// through the image optimizer or render in an <img>, so callers branch on
// this and emit a <video> with the raw blob URL instead.
function isVideoUrl(url) {
  return typeof url === "string" && /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url);
}

// Safety net: if an optimized src fails (optimizer disabled, unsupported
// source format, etc.) swap the <img> back to the original blob URL once, so
// a misconfig degrades to "slow but visible" instead of a broken image. CSP
// blocks inline onerror=, so the handler is attached here in-module.
function wireImageFallbacks(root) {
  (root || document).querySelectorAll("img[data-fallback]").forEach((img) => {
    img.addEventListener(
      "error",
      () => {
        const fb = img.getAttribute("data-fallback");
        img.removeAttribute("data-fallback");
        if (fb && img.getAttribute("src") !== fb) img.src = fb;
      },
      { once: true },
    );
  });
}

// Same render pattern as the customer surface: a frame-sized .crop-pan
// wrapper carries the transform, and the img inside is the whole image at
// cover size (real overflow, clipped by the thumb), so edge regions the
// customer panned into the print show up here too.
function cropImgHtml(url, alt, crop) {
  const opt = optimizedSrc(url, 384);
  const fb = opt !== url ? ` data-fallback="${escape(url)}"` : "";
  // New uploads are BAKED prints (already cropped customer-side) and render
  // whole; legacy {scale,x,y} crops still render through the pan wrapper.
  if (crop && typeof crop.scale === "number") {
    return `<div class="crop-pan" style="${cropStyle(crop)}"><img src="${escape(opt)}"${fb} alt="${escape(alt)}" loading="lazy" decoding="async" /></div>`;
  }
  return `<img class="crop-flat" src="${escape(opt)}"${fb} alt="${escape(alt)}" loading="lazy" decoding="async" />`;
}

// Size a .crop-pan image to its pan box's exact cover dimensions. CSS alone
// can't express "cover, but keep the overflow real" (width:auto renders the
// natural px size), so the cover math runs here once the image has loaded.
function sizeCropImg(img) {
  const pan = img.closest(".crop-pan");
  if (!pan || !img.naturalWidth) return;
  const fw = pan.clientWidth;
  const fh = pan.clientHeight;
  if (!fw || !fh) return;
  const cover = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
  img.style.width = `${img.naturalWidth * cover}px`;
  img.style.height = `${img.naturalHeight * cover}px`;
}

function initCropPans(root) {
  (root || document).querySelectorAll(".crop-pan > img").forEach((img) => {
    if (img.complete && img.naturalWidth > 0) sizeCropImg(img);
    else img.addEventListener("load", () => sizeCropImg(img), { once: true });
  });
}

// A cake print or box card can be an uploaded PDF (the customer wizard
// accepts them). Neither <img> nor the image optimizer can render a PDF,
// so those thumbs become links that open the file in a new tab instead
// of a broken image. The download button already ships the real file.
function isPdfUrl(url) {
  return typeof url === "string" && /\.pdf(\?|#|$)/i.test(url);
}

function designThumbHtml(url, thumbClass, label, alt, crop) {
  if (isPdfUrl(url)) {
    return `<a class="cake-cell__thumb ${thumbClass} cake-cell__thumb--pdf" href="${escape(url)}" target="_blank" rel="noopener" aria-label="Open ${escape(label)} PDF in a new tab" title="PDF - click to open" data-pdf-preview="${escape(url)}" data-pdf-preview-class="crop-flat"><span class="cake-cell__pdf-badge">PDF</span></a>`;
  }
  return `<div class="cake-cell__thumb ${thumbClass} is-zoomable" data-action="view-image" data-src="${escape(optimizedSrc(url, 1600))}" data-src-full="${escape(url)}" data-label="${escape(label)}" role="button" tabindex="0" title="Click to view full size">${cropImgHtml(url, alt, crop)}</div>`;
}
export {
  CARD_BACK_URL,
  designThumbHtml,
  initCropPans,
  isPdfUrl,
  isVideoUrl,
  openImageLightbox,
  optimizedSrc,
  wireImageFallbacks,
};
