/**
 * In-app archive import: accepts one cake photograph per request.
 *
 * The browser does the folder walk, burst grouping, and 1024px downscale
 * (see `src/components/archive-import.tsx`); this route owns everything that
 * must be trusted or secret — hashing, dedupe, storage, vision captioning,
 * and the row insert. One photo per request keeps each call comfortably
 * inside a function timeout and lets the client show real progress.
 */

import { createHash } from "node:crypto";

import { captionCake, captionConfigured, type CakeCaption } from "@/lib/server/vision";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BAKERY_ID = "default";
const BUCKET = "archive";

/** Import readiness + current archive size, so the UI can disable itself. */
export async function GET() {
  const { count, error } = await adminClient()
    .from("archive_cakes")
    .select("id", { count: "exact", head: true })
    .eq("bakery_id", BAKERY_ID);
  return Response.json({
    ready: captionConfigured(),
    imported: error ? null : count,
  });
}

// The caption model occasionally returns a comma-joined string where the
// schema asks for an array; left unsplit that becomes one nonsense tag.
function norm(xs: unknown): string[] {
  const list = Array.isArray(xs) ? xs : typeof xs === "string" ? [xs] : [];
  return [
    ...new Set(
      list
        .flatMap((x) => String(x).split(","))
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

function toRow(
  cap: CakeCaption,
  meta: { hash: string; photoUrl: string; sourcePath: string; taken: string | null; burstSize: number }
) {
  const coating = String(cap.coating ?? "buttercream").trim().toLowerCase();
  return {
    bakery_id: BAKERY_ID,
    source: "archive",
    source_hash: meta.hash,
    source_path: meta.sourcePath,
    photo_url: meta.photoUrl,
    thumbnail_url: meta.photoUrl,
    title: String(cap.title ?? "Cake").slice(0, 120),
    spoken_description: String(cap.spoken_description ?? "").slice(0, 400),
    themes: norm(cap.themes),
    colors: norm(cap.colors),
    techniques: [coating, ...norm(cap.decorations)],
    shape: String(cap.shape ?? "round").trim().toLowerCase().slice(0, 20),
    tiers: Math.max(1, Math.min(6, Number(cap.tiers) || 1)),
    has_name_text: Boolean(cap.has_name_text),
    occasion: norm(cap.occasion),
    made_on: meta.taken,
    photos_represented: meta.burstSize,
    // Deliberately blank — priced later by the bakery via calibration.
    servings: null,
    price_cents: null,
    labor_hours: null,
    active: true,
  };
}

export async function POST(req: Request) {
  if (!captionConfigured()) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not set — captioning is off, so nothing was imported." },
      { status: 503 }
    );
  }

  const form = await req.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File)) {
    return Response.json({ error: "missing `photo` file field" }, { status: 400 });
  }
  const sourcePath = String(form.get("source_path") ?? photo.name).slice(0, 500);
  const takenRaw = String(form.get("taken") ?? "");
  const taken = /^\d{4}-\d{2}-\d{2}$/.test(takenRaw) ? takenRaw : null;
  const burstSize = Math.max(1, Number(form.get("burst_size")) || 1);

  const bytes = Buffer.from(await photo.arrayBuffer());
  if (bytes.length === 0) {
    return Response.json({ error: "empty file" }, { status: 400 });
  }
  // Prefer the client's hash of the ORIGINAL file: the CLI ingest hashed
  // originals, so this is what makes web and CLI imports dedupe against each
  // other. Fall back to hashing what we received.
  const clientHash = String(form.get("source_hash") ?? "");
  const hash = /^[0-9a-f]{32}$/.test(clientHash)
    ? clientHash
    : createHash("sha256").update(bytes).digest("hex").slice(0, 32);

  const db = adminClient();
  const existing = await db
    .from("archive_cakes")
    .select("id")
    .eq("bakery_id", BAKERY_ID)
    .eq("source_hash", hash)
    .maybeSingle();
  if (existing.error) {
    return Response.json({ error: existing.error.message }, { status: 500 });
  }
  if (existing.data) {
    return Response.json({ status: "duplicate", id: existing.data.id });
  }

  const path = `cakes/${hash}.jpg`;
  const upload = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (upload.error) {
    return Response.json({ error: `storage: ${upload.error.message}` }, { status: 500 });
  }
  const photoUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  let caption: CakeCaption;
  try {
    caption = await captionCake(bytes.toString("base64"));
  } catch (err) {
    return Response.json(
      { error: `caption: ${err instanceof Error ? err.message : "failed"}` },
      { status: 502 }
    );
  }

  const inserted = await db
    .from("archive_cakes")
    .insert(toRow(caption, { hash, photoUrl, sourcePath, taken, burstSize }))
    .select("id, title")
    .single();
  if (inserted.error) {
    return Response.json({ error: inserted.error.message }, { status: 500 });
  }

  return Response.json({ status: "imported", id: inserted.data.id, title: inserted.data.title });
}
