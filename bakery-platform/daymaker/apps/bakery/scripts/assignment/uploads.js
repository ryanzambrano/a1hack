// Extracted from bakery-assignment.js — uploads cluster.
// All sibling imports share one ?v= pin; bump them in lockstep
// (they must resolve to the same module instances).
import { escape } from "/scripts/api.js";
import { els, state } from "./core.js?v=20260729unified2";
import { isVideoUrl, optimizedSrc, wireImageFallbacks } from "./media.js?v=20260729unified2";
import {
  onDone,
  openMarkUnsuccessfulModal,
  setActionResult,
  undoMarkUnsuccessful,
} from "./actions.js?v=20260729unified2";
import { loadAndRender } from "./app.js?v=20260729unified2";


/**
 * Render one upload block per cake_item. Each block has the cake's
 * recipient label at the top, then a cake-photo + delivery-photo
 * drop pair. Status pill flips from "required" to "uploaded" as the
 * URLs land on each cake_item.
 */
function renderUploadStatus(a) {
  const items = Array.isArray(a.cake_items) ? a.cake_items : [];
  const completable = ["accepted", "in_production", "ready", "in_transit"].includes(a.status);

  // Fallback for assignments without cake_items: render a single
  // assignment-level pair, same as the original behaviour.
  if (items.length === 0) {
    renderPerCakeUploadsLegacy(a, completable);
    return;
  }

  els.perCakeUploads.innerHTML = items.map((it, i) => renderUploadBlock(it, i + 1)).join("");
  wireImageFallbacks(els.perCakeUploads);

  // Wire each block's inputs
  els.perCakeUploads.querySelectorAll(".upload-drop").forEach((drop) => {
    const cakeId = drop.getAttribute("data-cake-id");
    const kind = drop.getAttribute("data-kind");
    const input = drop.querySelector("input[type='file']");
    if (!input) return;
    drop.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      drop.classList.add("is-dragover");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-dragover"));
    drop.addEventListener("drop", (ev) => {
      ev.preventDefault();
      drop.classList.remove("is-dragover");
      const file = ev.dataTransfer?.files?.[0];
      if (file) void handleUpload(file, kind, cakeId);
    });
    input.addEventListener("change", (ev) => {
      const file = ev.target.files?.[0];
      if (file) void handleUpload(file, kind, cakeId);
      input.value = "";
    });
  });

  // Wire each block's "Mark unsuccessful" button (failed cakes don't have one).
  els.perCakeUploads.querySelectorAll('[data-action="mark-unsuccessful"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      openMarkUnsuccessfulModal(
        btn.getAttribute("data-cake-id") || "",
        btn.getAttribute("data-recipient") || "this recipient",
      );
    });
  });

  // Failed cakes get an "Undo" instead, putting them back in the photo flow.
  els.perCakeUploads.querySelectorAll('[data-action="undo-unsuccessful"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      void undoMarkUnsuccessful(btn.getAttribute("data-cake-id") || "");
    });
  });

  // Gating: cake_items marked failed are considered resolved (no photos
  // required for them). Everything else needs both photos.
  const liveItems = items.filter((it) => it.status !== "failed");
  const failedCount = items.length - liveItems.length;
  const totalRequired = liveItems.length * 2;
  const uploadedCount = liveItems.reduce(
    (sum, it) => sum + (it.cake_photo_url ? 1 : 0) + (it.delivery_photo_url ? 1 : 0),
    0,
  );
  const allDone = totalRequired === 0 || uploadedCount === totalRequired;

  if (els.doneBtn) {
    const ready = allDone && completable;
    if (ready) els.doneBtn.removeAttribute("disabled");
    else els.doneBtn.setAttribute("disabled", "true");
  }
  if (els.doneHint) {
    const failNote = failedCount > 0 ? ` (${failedCount} marked unsuccessful)` : "";
    if (!completable) {
      els.doneHint.textContent = "";
    } else if (totalRequired === 0) {
      els.doneHint.textContent = `All cakes marked unsuccessful. Mark the order complete to wrap up.`;
    } else if (uploadedCount === 0) {
      els.doneHint.textContent = `Upload ${totalRequired} photos to enable${failNote}.`;
    } else if (!allDone) {
      const remaining = totalRequired - uploadedCount;
      els.doneHint.textContent = `${remaining} photo${remaining === 1 ? "" : "s"} still needed${failNote}.`;
    } else {
      els.doneHint.textContent = `All photos in${failNote}. Mark the order complete when you're done.`;
    }
  }
}

function renderUploadBlock(item, n) {
  const cakeDone = !!item.cake_photo_url;
  const deliveryDone = !!item.delivery_photo_url;
  const isFailed = item.status === "failed";
  return `
    <div class="per-cake-block ${isFailed ? "is-failed" : ""}" data-cake-id="${escape(item.id)}">
      <div class="per-cake-block__head">
        <span class="per-cake-block__num">${n}</span>
        <div class="per-cake-block__who">
          <strong>${escape(item.recipient_name)}</strong>
          ${item.recipient_address ? `<span class="quiet">${escape(item.recipient_address)}</span>` : ""}
        </div>
        <span class="per-cake-block__cake">${escape(item.cake_label)}</span>
      </div>
      ${isFailed
        ? `<div class="per-cake-block__failed">
            <strong>✗ Unsuccessful.</strong>
            <span>${escape(item.failure_reason || "no reason recorded")}</span>
          </div>
          <div class="per-cake-block__foot">
            <button type="button" class="btn-ghost-undo" data-action="undo-unsuccessful"
                    data-cake-id="${escape(item.id)}">
              Undo
            </button>
          </div>`
        : `<div class="upload-pair">
            <label class="upload-drop ${cakeDone ? "is-done" : ""}" data-cake-id="${escape(item.id)}" data-kind="cake">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" hidden />
              <span class="upload-drop__text">Cake photo</span>
              <span class="upload-drop__sub">finished cake</span>
              ${cakeDone
                ? (isVideoUrl(item.cake_photo_url)
                    ? `<video class="upload-drop__preview" src="${escape(item.cake_photo_url)}" muted playsinline preload="metadata" style="object-fit:cover;"></video>`
                    : `<img class="upload-drop__preview" src="${escape(optimizedSrc(item.cake_photo_url, 256))}"${optimizedSrc(item.cake_photo_url, 256) !== item.cake_photo_url ? ` data-fallback="${escape(item.cake_photo_url)}"` : ""} alt="Uploaded cake photo" loading="lazy" decoding="async" />`)
                : ""}
              <span class="upload-drop__status">${cakeDone ? "✓ uploaded" : "required"}</span>
            </label>
            <label class="upload-drop ${deliveryDone ? "is-done" : ""}" data-cake-id="${escape(item.id)}" data-kind="delivery">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" hidden />
              <span class="upload-drop__text">Delivery photo</span>
              <span class="upload-drop__sub">at drop-off</span>
              ${deliveryDone
                ? (isVideoUrl(item.delivery_photo_url)
                    ? `<video class="upload-drop__preview" src="${escape(item.delivery_photo_url)}" muted playsinline preload="metadata" style="object-fit:cover;"></video>`
                    : `<img class="upload-drop__preview" src="${escape(optimizedSrc(item.delivery_photo_url, 256))}"${optimizedSrc(item.delivery_photo_url, 256) !== item.delivery_photo_url ? ` data-fallback="${escape(item.delivery_photo_url)}"` : ""} alt="Uploaded delivery photo" loading="lazy" decoding="async" />`)
                : ""}
              <span class="upload-drop__status">${deliveryDone ? "✓ uploaded" : "required"}</span>
            </label>
          </div>
          ${state.source.markUnsuccessful
            ? `<div class="per-cake-block__foot">
                <button type="button" class="btn-ghost-danger" data-action="mark-unsuccessful"
                        data-cake-id="${escape(item.id)}" data-recipient="${escape(item.recipient_name)}">
                  Mark unsuccessful
                </button>
              </div>`
            : ""}`}
    </div>
  `;
}

// Legacy path for assignments missing cake_items - mirrors the original
// single-pair flow so older mock state files still render.
function renderPerCakeUploadsLegacy(a, completable) {
  const hasCake = !!a.production_photo_url;
  const hasDelivery = !!a.delivery_photo_url;
  els.perCakeUploads.innerHTML = `
    <div class="upload-pair">
      <label class="upload-drop ${hasCake ? "is-done" : ""}" data-kind="production">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" hidden />
        <span class="upload-drop__text">Cake photo</span>
        <span class="upload-drop__sub">finished cake, before drop-off</span>
        <span class="upload-drop__status">${hasCake ? "✓ uploaded" : "required"}</span>
      </label>
      <label class="upload-drop ${hasDelivery ? "is-done" : ""}" data-kind="delivery">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" hidden />
        <span class="upload-drop__text">Delivery photo</span>
        <span class="upload-drop__sub">snapped at the drop-off</span>
        <span class="upload-drop__status">${hasDelivery ? "✓ uploaded" : "required"}</span>
      </label>
    </div>
  `;
  els.perCakeUploads.querySelectorAll(".upload-drop").forEach((drop) => {
    const kind = drop.getAttribute("data-kind");
    const input = drop.querySelector("input[type='file']");
    if (!input) return;
    input.addEventListener("change", (ev) => {
      const file = ev.target.files?.[0];
      if (file) void handleUpload(file, kind, null);
      input.value = "";
    });
  });
  if (els.doneBtn) {
    const ready = hasCake && hasDelivery && completable;
    if (ready) els.doneBtn.removeAttribute("disabled");
    else els.doneBtn.setAttribute("disabled", "true");
  }
  if (els.doneHint) {
    els.doneHint.textContent = hasCake && hasDelivery
      ? "Looks good - mark the order complete."
      : "Upload both photos to enable.";
  }
}

// ─── Upload ─────────────────────────────────────────────────

function wireUpload() {
  // Per-cake upload slots are wired dynamically inside renderUploadStatus
  // when the cake_items list lands. Only the Done button is static.
  els.doneBtn?.addEventListener("click", () => void onDone());
}

/**
 * Upload a single photo. `cakeId` is the cake_item id for per-cake
 * uploads, or null for the legacy assignment-level fallback.
 * `kind` is "cake" | "delivery" for per-cake, or "production" | "delivery"
 * for legacy.
 */
async function handleUpload(file, kind, cakeId) {
  if (state.busy) return;
  const validKinds = ["cake", "delivery", "production"];
  if (!validKinds.includes(kind)) return;
  if (file.size > 10 * 1024 * 1024) {
    setActionResult("File too large (max 10MB).", true);
    return;
  }
  state.busy = true;
  try {
    els.uploadProgress.hidden = false;
    els.uploadProgressLabel.textContent = `Uploading ${kind === "delivery" ? "delivery" : "cake"} photo…`;
    // Shrink large photos in the browser before upload so they store small
    // and render fast everywhere. Falls back to the original bytes for
    // anything we can't decode here (e.g. HEIC on a browser without support).
    const resized = await downscaleForUpload(file);
    // Shrinking happens here for both order kinds; only the transport differs
    // (inline base64 vs a signed client blob upload), and that lives on the
    // source adapter.
    await state.source.uploadPhoto({
      blob: resized ? resized.blob : file,
      filename: resized ? resized.filename : file.name,
      contentType: resized ? resized.contentType : file.type || "image/jpeg",
      kind,
      cakeId,
    });
    els.uploadProgress.hidden = true;
    setActionResult(
      kind === "delivery" ? "Delivery photo uploaded." : "Cake photo uploaded.",
    );
    await loadAndRender();
  } catch (err) {
    els.uploadProgress.hidden = true;
    setActionResult(err.message || "Upload failed.", true);
  } finally {
    state.busy = false;
  }
}

// Downscale + re-encode a photo client-side before upload. Returns
// { blob, contentType, filename } when it produced a smaller image, or null
// to upload the original untouched (unsupported type, decode failure, or
// already small). Caps the long edge at 2000px and re-encodes to JPEG, which
// turns a 6-12MB camera shot into a few hundred KB.
async function downscaleForUpload(file) {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || "")) return null;
  if (typeof createImageBitmap !== "function") return null;
  const MAX_EDGE = 2000;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    // Already small enough — don't re-encode and lose quality for no gain.
    if (longest <= MAX_EDGE && file.size <= 1_500_000) return null;
    const scale = Math.min(1, MAX_EDGE / longest);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    // No win (e.g. already-tiny PNG) — keep the original.
    if (!blob || blob.size >= file.size) return null;
    const base = (file.name || "photo").replace(/\.[^.]+$/, "");
    return { blob, contentType: "image/jpeg", filename: `${base}.jpg` };
  } catch {
    return null;
  } finally {
    bitmap.close?.();
  }
}

export {
  renderUploadStatus,
  wireUpload,
};
