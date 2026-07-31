// The Daymaker insert card - the QR card that ships inside a VC cake box.
//
// It is NOT a section of the page and has no controls of its own. The card is
// DRAWN, once, and handed to the cakes table as an ordinary `card_image_url`,
// so it shows up in the Card column exactly the way a campaign order's card
// does: a thumbnail you can click to view full size, and a file the row's
// Download button hands over with everything else. Nothing downstream knows a
// VC card is generated rather than uploaded.
//
// Drawn on a canvas rather than rasterised off the DOM with html2canvas.
// html2canvas cannot lay out an SVG that declares width="100%" height="100%"
// with no intrinsic size, which is exactly what the Daymaker wordmark is - it
// came out as half a logo. Painting it ourselves is deterministic, needs no
// CDN import, and is the only way to be sure the thing that ships in the box
// is the thing on screen.
import { els, state } from "./core.js?v=20260729unified2";
import { qrImageUrl } from "./source.js?v=20260729unified2";

const CARD_W = 420;
const CARD_H = 452;
const SCALE = 3; // print-ish; the cell shows it at ~90px

/** Keep the off-screen card (the print host) in step with this order. */
function renderInsertCard(a) {
  if (!els.insertCardWrap) return;
  const qrUrl = a.qr_url;
  if (!qrUrl) {
    els.insertCardWrap.hidden = true;
    return;
  }
  if (els.insertCardQr) {
    els.insertCardQr.src = qrImageUrl(qrUrl, 600);
    els.insertCardQr.alt = `QR code that opens ${qrUrl}`;
  }
  const greeting = document.querySelector(".insert-card__greeting");
  const msg = document.querySelector(".insert-card__msg");
  if (greeting && msg) {
    greeting.textContent = cardCopy(a).greeting;
    msg.textContent = cardCopy(a).msg;
  }
  els.insertCardWrap.hidden = false;
}

// Apply-flow orders get the "we picked a winner for you" wording; an ordinary
// VC cake gets the plain one.
function cardCopy(a) {
  return {
    greeting: a.vc_greeting || "A cake for you.",
    msg: a.vc_message || "Scan the QR code to find out who sent it.",
  };
}

function loadImage(src, crossOrigin) {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * The wordmark ships as `width="100%" height="100%"`, so a browser gives it
 * no intrinsic size and drawImage renders nothing usable. Stamp the viewBox
 * onto it and load that instead.
 */
async function loadWordmark(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    let svg = await res.text();
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    if (box) {
      svg = svg.replace(/width="100%"\s+height="100%"/, `width="${box[1]}" height="${box[2]}"`);
    }
    return await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  } catch {
    return null;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function drawCard(a) {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * SCALE;
  canvas.height = CARD_H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);

  const [wordmark, cocola, qr] = await Promise.all([
    loadWordmark("/assets/daymaker-wordmark.svg"),
    loadImage("/assets/cocola-bakery-logo.png"),
    loadImage(qrImageUrl(a.qr_url, 600), true),
  ]);
  // Canvas can only use a font the document has actually loaded.
  try { await document.fonts.ready; } catch { /* fonts are best effort */ }

  // Card body
  ctx.fillStyle = "#fffdf6";
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 12);
  ctx.fill();
  ctx.strokeStyle = "#2a2826";
  ctx.lineWidth = 2;
  ctx.stroke();

  const cx = CARD_W / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#2a2826";

  // Brand row: wordmark × bakery logo, measured then laid out so the pair is
  // centred as a unit rather than each piece guessing.
  const markH = 20;
  const cocolaH = 26;
  const gap = 12;
  const markW = wordmark
    ? markH * ((wordmark.naturalWidth || 3857) / (wordmark.naturalHeight || 1731))
    : 0;
  const cocolaW = cocola
    ? cocolaH * ((cocola.naturalWidth || 298) / (cocola.naturalHeight || 79))
    : 0;
  ctx.font = '400 14px "Inter", system-ui, sans-serif';
  const xW = ctx.measureText("×").width;
  const rowW = markW + gap + xW + gap + cocolaW;
  let x = cx - rowW / 2;
  const rowTop = 30;
  if (wordmark) {
    ctx.drawImage(wordmark, x, rowTop + (cocolaH - markH) / 2, markW, markH);
    x += markW + gap;
  }
  ctx.textAlign = "left";
  ctx.fillText("×", x, rowTop + cocolaH / 2 - 9);
  x += xW + gap;
  if (cocola) ctx.drawImage(cocola, x, rowTop, cocolaW, cocolaH);
  ctx.textAlign = "center";

  const { greeting, msg } = cardCopy(a);

  ctx.font = '700 24px "Fraunces", Georgia, serif';
  ctx.fillText(greeting, cx, rowTop + cocolaH + 26);

  ctx.font = '400 13px "Inter", system-ui, sans-serif';
  ctx.fillStyle = "#5b5651";
  ctx.fillText(msg, cx, rowTop + cocolaH + 64);

  // QR
  const qrSize = 200;
  const qrTop = rowTop + cocolaH + 92;
  if (qr) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - qrSize / 2, qrTop, qrSize, qrSize);
    ctx.drawImage(qr, cx - qrSize / 2, qrTop, qrSize, qrSize);
  }

  ctx.fillStyle = "#2a2826";
  ctx.font = 'italic 400 14px "Fraunces", Georgia, serif';
  ctx.fillText("Love,", cx, qrTop + qrSize + 22);
  ctx.fillText("William & Christian", cx, qrTop + qrSize + 42);

  try {
    return canvas.toDataURL("image/png");
  } catch {
    // Tainted canvas (the QR host refused CORS) - no thumbnail, no crash.
    return null;
  }
}

// One order per page, so one draw. Cached as a promise so the 20s poll can't
// kick off a second one.
let cardImage = null;

/**
 * Draw the card and hand it to the cake row as its card image. Resolves true
 * when the table should repaint to show it; no-op once it has one.
 */
async function attachInsertCardImage(a) {
  const item = a?.cake_items?.[0];
  if (!item || !a.qr_url || item.card_image_url) return false;
  if (!cardImage) cardImage = drawCard(a);
  const url = await cardImage;
  if (!url) return false;
  item.card_image_url = url;
  // The poll may have swapped the order out from under us while we drew.
  return state.assignment === a;
}

export { attachInsertCardImage, renderInsertCard };
