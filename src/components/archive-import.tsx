"use client";

/**
 * Folder import for the cake archive.
 *
 * The browser does what `scripts/ingest-archive.mjs` does on the command
 * line: walk the folder, recover capture dates from camera filenames, merge
 * bursts (shots of the same cake within minutes of each other), pick the
 * sharpest shot per cake, and downscale to 1024px JPEG before upload — a
 * 4000px camera photo is ~8MB; the downscale makes each upload ~200KB and
 * an order of magnitude cheaper to caption. The server does the rest:
 * dedupe, storage, vision captioning, insert (`/api/archive/upload`).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Card, CardHeader, Note } from "@/components/ui";

const IMAGE_EXT = /\.(jpe?g|png|webp|heic)$/i;
const BURST_MINUTES = 10;
const THUMB_PX = 1024;
const CONCURRENCY = 3;

/**
 * Capture time from the filename — camera rolls carry it even when the OS
 * mtime is lost. Handles `20240712_090414.jpg` and
 * `result_img_2023_05_03_11_10_09.jpg`; falls back to the file's mtime.
 */
function takenAt(file: File): Date | null {
  const name = file.name;
  const compact = /(20\d{2})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/.exec(name);
  const spaced = /(20\d{2})[_-](\d{2})[_-](\d{2})[_-](\d{2})[_-](\d{2})[_-](\d{2})/.exec(name);
  const m = compact ?? spaced;
  if (m) {
    const [, y, mo, d, h, mi, s] = m.map(Number);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return file.lastModified ? new Date(file.lastModified) : null;
}

interface Cake {
  file: File;
  taken: Date | null;
  burstSize: number;
}

/** Photos within a few minutes of each other are one cake, shot repeatedly. */
function groupBursts(files: File[]): Cake[] {
  const stamped = files
    .map((file) => ({ file, taken: takenAt(file) }))
    .sort((a, b) => (a.taken?.getTime() ?? 0) - (b.taken?.getTime() ?? 0));

  const groups: { file: File; taken: Date | null }[][] = [];
  let current: { file: File; taken: Date | null }[] = [];
  for (const item of stamped) {
    const prev = current[current.length - 1];
    if (
      !prev ||
      (item.taken &&
        prev.taken &&
        item.taken.getTime() - prev.taken.getTime() <= BURST_MINUTES * 60_000)
    ) {
      current.push(item);
    } else {
      groups.push(current);
      current = [item];
    }
  }
  if (current.length) groups.push(current);

  // The largest file in a burst is usually the sharpest, least-cropped shot.
  return groups.map((group) => {
    const best = [...group].sort((a, b) => b.file.size - a.file.size)[0];
    return { file: best.file, taken: best.taken, burstSize: group.length };
  });
}

/**
 * Hash of the ORIGINAL file bytes — the same thing `ingest-archive.mjs`
 * hashes — so a folder already imported through the CLI dedupes here too.
 * (Hashing the downscaled JPEG would differ per browser encoder.)
 */
async function sha256Hex32(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** Downscale to a ≤1024px JPEG. Throws on formats the browser can't decode (HEIC on Chrome). */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, THUMB_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) throw new Error("could not encode JPEG");
  return blob;
}

interface Progress {
  total: number;
  done: number;
  imported: number;
  duplicates: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export function ArchiveImport({ onImported }: { onImported?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [scan, setScan] = useState<{ photos: number; cakes: number } | null>(null);

  useEffect(() => {
    fetch("/api/archive/upload")
      .then((r) => r.json())
      .then((body) => setReady(Boolean(body.ready)))
      .catch(() => setReady(false));
  }, []);

  const run = useCallback(
    async (fileList: FileList) => {
      const files = Array.from(fileList).filter(
        (f) => IMAGE_EXT.test(f.name) && !f.name.startsWith(".")
      );
      if (files.length === 0) return;

      const cakes = groupBursts(files);
      setScan({ photos: files.length, cakes: cakes.length });

      const state: Progress = {
        total: cakes.length,
        done: 0,
        imported: 0,
        duplicates: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      };
      setProgress({ ...state });
      setRunning(true);

      const queue = [...cakes];
      const worker = async () => {
        for (;;) {
          const cake = queue.shift();
          if (!cake) return;
          try {
            const jpeg = await downscale(cake.file).catch(() => null);
            if (!jpeg) {
              // Browser can't decode it (usually HEIC outside Safari).
              state.skipped++;
            } else {
              const body = new FormData();
              body.append("photo", jpeg, cake.file.name);
              body.append("source_hash", await sha256Hex32(cake.file));
              body.append("source_path", cake.file.webkitRelativePath || cake.file.name);
              body.append("taken", cake.taken ? cake.taken.toISOString().slice(0, 10) : "");
              body.append("burst_size", String(cake.burstSize));
              const res = await fetch("/api/archive/upload", { method: "POST", body });
              const json = await res.json().catch(() => ({}));
              if (res.ok && json.status === "imported") state.imported++;
              else if (res.ok && json.status === "duplicate") state.duplicates++;
              else {
                state.failed++;
                if (state.errors.length < 5) {
                  state.errors.push(`${cake.file.name}: ${json.error ?? `HTTP ${res.status}`}`);
                }
              }
            }
          } catch {
            state.failed++;
          }
          state.done++;
          setProgress({ ...state });
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      setRunning(false);
      if (state.imported > 0) onImported?.();
    },
    [onImported]
  );

  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <Card>
      <CardHeader
        title="Import your cake photos"
        description="Point it at the folder where you keep photos of your cakes — camera-roll exports are fine. Repeated shots of the same cake are merged, and a vision model catalogues each one so the agent can quote from your real work."
      />
      <div className="flex flex-col gap-4 px-5 py-5">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          // Non-standard but universally supported: lets the picker select a folder.
          {...{ webkitdirectory: "" }}
          onChange={(e) => {
            if (e.target.files?.length) void run(e.target.files);
            e.target.value = "";
          }}
        />

        {ready === false && (
          <Note tone="amber">
            Captioning is not configured. Add <code>ANTHROPIC_API_KEY</code> to{" "}
            <code>.env.local</code> and restart the dev server — photos can&rsquo;t be
            imported without it, because every photo is catalogued by a vision model on
            the way in.
          </Note>
        )}

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={() => inputRef.current?.click()}
            disabled={!ready}
            loading={running}
          >
            {running ? "Importing…" : "Choose folder"}
          </Button>
          {scan && (
            <span className="text-sm text-gray-900">
              {scan.photos} photos → {scan.cakes} distinct cakes
            </span>
          )}
        </div>

        {progress && (
          <div className="flex flex-col gap-2">
            <div className="h-2 w-full overflow-hidden rounded bg-gray-200/60">
              <div
                className="h-full rounded bg-[var(--viz-1,#3987e5)] transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-sm text-gray-900">
              {progress.done}/{progress.total} processed · {progress.imported} imported
              {progress.duplicates > 0 && ` · ${progress.duplicates} already in the archive`}
              {progress.skipped > 0 && ` · ${progress.skipped} skipped (unreadable format)`}
              {progress.failed > 0 && ` · ${progress.failed} failed`}
            </p>
            {progress.errors.length > 0 && (
              <ul className="text-xs text-gray-700">
                {progress.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            )}
            {!running && progress.done === progress.total && progress.imported > 0 && (
              <Note tone="green">
                Imported {progress.imported} cake{progress.imported === 1 ? "" : "s"}. The
                numbers on this page now include them; prices stay blank until you
                hand-price a few via calibration.
              </Note>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
