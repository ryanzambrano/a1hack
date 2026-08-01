// Import a folder of cake photographs into the archive.
//
//   node scripts/ingest-archive.mjs "~/Downloads/Kids cakes" --dry-run
//   node scripts/ingest-archive.mjs "~/Downloads/Kids cakes"
//   node scripts/ingest-archive.mjs "~/Downloads/Kids cakes" --thumbs-only
//   node scripts/ingest-archive.mjs "~/Downloads/Kids cakes" --limit 20
//
// WHAT A REAL BAKERY FOLDER LOOKS LIKE
//
// Camera filenames, no metadata, and the same cake shot two or three times
// from slightly different angles. Even Dough's folder is 518 photographs of
// roughly 357 cakes going back to 2017. Three things follow from that:
//
//   Dates are free. The filenames carry a capture timestamp, so `made_on` is
//   recovered without asking anyone and without a vision call. It also gives
//   a join key to the bakery's own order records if those ever turn up.
//
//   Bursts are one cake. Photos taken within a few minutes of each other are
//   the same cake from another angle. Captioning each one would pay three
//   times for one design and let it vote three times in the pricing
//   comparables. One representative per burst is ingested.
//
//   Photos are 3000x4000. Downscaling to 1024px before captioning cuts the
//   cost and latency by an order of magnitude and loses nothing a caption
//   needs. macOS `sips` does it with no dependencies.
//
// WHAT THIS DOES NOT PRODUCE
//
// Price, servings and labour hours stay null. Vision cannot read what a cake
// sold for, and a sheet cake serves twenty or forty depending on how it is
// cut. Those come from `scripts/calibration.mjs`, where the bakery prices a
// small chosen subset by hand. Guessing them here would poison every later
// quote with numbers nobody at the bakery ever agreed to.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--"));
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

if (!folder) {
  console.error(
    "usage: node scripts/ingest-archive.mjs <folder> [--dry-run] [--thumbs-only] [--limit N]"
  );
  process.exit(1);
}

const DRY_RUN = flag("dry-run");
const THUMBS_ONLY = flag("thumbs-only");
const LIMIT = Number(value("limit", "0")) || Infinity;
const BAKERY_ID = value("bakery", "default");
const CONCURRENCY = Number(value("concurrency", "4"));
const BURST_MINUTES = Number(value("burst", "10"));
const THUMB_PX = Number(value("thumb", "1024"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const THUMB_DIR = new URL("../public/archive/", import.meta.url).pathname;
const TMP_DIR = "/tmp/cake-ingest";

/* --------------------------------- files ---------------------------------- */

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (IMAGE_EXT.has(extname(entry).toLowerCase())) out.push({ path: full, size: st.size });
  }
  return out;
}

/**
 * Capture time from the filename. Handles the two shapes this archive uses:
 * `20240712_090414.jpg` and `result_img_2023_05_03_11_10_09.jpg`.
 */
function timestampOf(path) {
  const name = basename(path);
  const compact = /(20\d{2})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/.exec(name);
  const spaced = /(20\d{2})[_-](\d{2})[_-](\d{2})[_-](\d{2})[_-](\d{2})[_-](\d{2})/.exec(name);
  const m = compact ?? spaced;
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Photos within a few minutes of each other are one cake, shot repeatedly. */
function groupBursts(files, minutes) {
  const stamped = files.filter((f) => f.taken).sort((a, b) => a.taken - b.taken);
  const loose = files.filter((f) => !f.taken);

  const groups = [];
  let current = [];
  for (const file of stamped) {
    if (!current.length || file.taken - current[current.length - 1].taken <= minutes * 60_000) {
      current.push(file);
    } else {
      groups.push(current);
      current = [file];
    }
  }
  if (current.length) groups.push(current);
  // A photo with no timestamp cannot be grouped, so it stands alone.
  return [...groups, ...loose.map((f) => [f])];
}

/** Downscale with sips. Also converts HEIC, which nothing else here reads. */
function downscale(src, dest, px) {
  execFileSync("sips", ["-s", "format", "jpeg", "-Z", String(px), src, "--out", dest], {
    stdio: "ignore",
  });
}

/* ------------------------------- captioning -------------------------------- */

const SCHEMA_INSTRUCTION = `You are cataloguing a bakery's photographs of cakes they have made, so the bakery can find past work by description and quote similar cakes.

Reply with ONE JSON object and nothing else:
{
  "title": "short human label, e.g. 'Minnie Mouse sheet cake, pastel buttercream'",
  "spoken_description": "one sentence, written to be READ ALOUD on a phone call, describing the look. No measurements, no price.",
  "themes": ["lowercase nouns for what it depicts: minnie mouse, unicorn, dinosaur, football, rainbow, floral, number, ..."],
  "colors": ["lowercase colour words clearly visible on the cake"],
  "coating": "fondant | buttercream | whipped cream",
  "decorations": ["piping, drip, sculpted, hand-painted, fresh flowers, gold leaf, edible print, character topper"],
  "shape": "round | rectangular | sheet | novelty",
  "tiers": <integer, stacked tiers; a flat sheet cake is 1>,
  "occasion": ["birthday, christening, communion, graduation, baby shower, wedding"],
  "has_name_text": <true if a person's name or a message is written on the cake>,
  "complexity": <1-5, how much skilled decorating time this took>
}

Rules:
- Describe only what is visible. Never invent a flavour: you cannot see the inside.
- Do NOT estimate price or servings. Those are recorded separately by the bakery.
- Exactly one coating. Smooth matte covering is usually fondant; piped swirls and rosettes are buttercream.
- Empty array is fine when nothing applies.`;

async function caption(imagePath) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.VISION_MODEL || "claude-sonnet-5",
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: readFileSync(imagePath).toString("base64"),
              },
            },
            { type: "text", text: SCHEMA_INSTRUCTION },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`vision ${res.status}: ${(await res.text()).slice(0, 160)}`);

  const data = await res.json();
  const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("vision returned no JSON");
  return JSON.parse(text.slice(start, end + 1));
}

/* --------------------------------- shape ---------------------------------- */

// The model occasionally returns a comma-joined string where the schema asks
// for an array ("piping, sculpted, edible print"). Left unsplit that becomes a
// single nonsense tag that matches nothing, so split on commas regardless of
// whether we were handed a string or a list.
const norm = (xs) => {
  const list = Array.isArray(xs) ? xs : typeof xs === "string" ? [xs] : [];
  return [
    ...new Set(
      list
        .flatMap((x) => String(x).split(","))
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
};

function toRow(cap, { hash, representative, taken, burstSize }) {
  const coating = String(cap.coating ?? "buttercream").trim().toLowerCase();
  const decorations = norm(cap.decorations);

  return {
    bakery_id: BAKERY_ID,
    source: "archive",
    source_hash: hash,
    source_path: relative(folder, representative),
    photo_url: `/archive/${hash}.jpg`,
    thumbnail_url: `/archive/${hash}.jpg`,
    title: String(cap.title ?? "Cake").slice(0, 120),
    spoken_description: String(cap.spoken_description ?? "").slice(0, 400),
    themes: norm(cap.themes),
    colors: norm(cap.colors),
    techniques: [coating, ...decorations],
    shape: String(cap.shape ?? "round").trim().toLowerCase().slice(0, 20),
    tiers: Math.max(1, Math.min(6, Number(cap.tiers) || 1)),
    has_name_text: Boolean(cap.has_name_text),
    occasion: norm(cap.occasion),
    made_on: taken ? taken.toISOString().slice(0, 10) : null,
    // How many photographs this one row stands for.
    photos_represented: burstSize,
    // Left null deliberately — see the header.
    servings: null,
    price_cents: null,
    labor_hours: null,
    active: true,
  };
}

/* ---------------------------------- run ----------------------------------- */

const files = walk(folder).map((f) => ({ ...f, taken: timestampOf(f.path) }));
if (!files.length) {
  console.error(`no images found under ${folder}`);
  process.exit(1);
}

const bursts = groupBursts(files, BURST_MINUTES);
// The largest file in a burst is usually the sharpest, least-cropped shot.
const cakes = bursts.map((group) => {
  const representative = [...group].sort((a, b) => b.size - a.size)[0];
  return {
    representative: representative.path,
    taken: representative.taken ?? group.find((g) => g.taken)?.taken ?? null,
    burstSize: group.length,
  };
});

const dated = cakes.filter((c) => c.taken);
console.log(`${files.length} photos in ${folder}`);
console.log(`${cakes.length} distinct cakes after grouping bursts within ${BURST_MINUTES} min`);
if (dated.length) {
  const dates = dated.map((c) => c.taken).sort((a, b) => a - b);
  console.log(
    `${dated.length} carry a date (${dates[0].toISOString().slice(0, 10)} to ${dates[dates.length - 1]
      .toISOString()
      .slice(0, 10)})`
  );
}

const { data: existingRows, error: existingError } = await sb
  .from("archive_cakes")
  .select("source_hash")
  .eq("bakery_id", BAKERY_ID)
  .not("source_hash", "is", null);
if (existingError) {
  console.error("could not read existing hashes:", existingError.message);
  process.exit(1);
}
const already = new Set((existingRows ?? []).map((r) => r.source_hash));

mkdirSync(THUMB_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

const queue = [];
let skipped = 0;
for (const cake of cakes) {
  // Checked before hashing: hashing reads the whole file, and with a --limit
  // there is no reason to read hundreds of megabytes we will not look at.
  if (queue.length >= LIMIT) break;
  const hash = createHash("sha256").update(readFileSync(cake.representative)).digest("hex").slice(0, 32);
  if (already.has(hash)) {
    skipped++;
    continue;
  }
  queue.push({ ...cake, hash });
}

// Counted rather than inferred from the totals: subtracting the queue length
// reports everything past a --limit as "already imported", which is a lie
// that makes a limited run look like a finished one.
const beyondLimit = cakes.length - skipped - queue.length;
console.log(
  `${skipped} already imported, ${queue.length} to process` +
    (beyondLimit > 0 ? `, ${beyondLimit} left for a later run` : "")
);

// Rows imported before photos_represented existed still report 1. Repair them
// from the grouping we just computed, so the photo-to-cake ratio stays true.
if (!DRY_RUN) {
  const { data: stale } = await sb
    .from("archive_cakes")
    .select("id, source_hash, photos_represented")
    .eq("bakery_id", BAKERY_ID)
    .not("source_hash", "is", null);
  const wanted = new Map();
  for (const cake of cakes) {
    const h = createHash("sha256").update(readFileSync(cake.representative)).digest("hex").slice(0, 32);
    wanted.set(h, cake.burstSize);
  }
  let repaired = 0;
  for (const row of stale ?? []) {
    const want = wanted.get(row.source_hash);
    if (want && want !== row.photos_represented) {
      await sb.from("archive_cakes").update({ photos_represented: want }).eq("id", row.id);
      repaired++;
    }
  }
  if (repaired) console.log(`repaired burst counts on ${repaired} rows`);
}

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

// A preview must work without a key — checking what an import would do is
// exactly what you want before paying for one.
if (DRY_RUN) {
  const estimate = (queue.length * 0.008).toFixed(2);
  console.log(`\nwould caption ${queue.length} cakes at roughly $${estimate} total`);
  for (const item of queue.slice(0, 8)) {
    console.log(
      `  ${relative(folder, item.representative)}` +
        `${item.burstSize > 1 ? `  (+${item.burstSize - 1} more angles)` : ""}` +
        `${item.taken ? `  ${item.taken.toISOString().slice(0, 10)}` : ""}`
    );
  }
  if (queue.length > 8) console.log(`  ... and ${queue.length - 8} more`);
  if (!hasKey) console.log("\nANTHROPIC_API_KEY is not set — captioning would fail.");
  process.exit(0);
}

if (!THUMBS_ONLY && !hasKey) {
  console.error(
    "\nANTHROPIC_API_KEY is not set, so these photos cannot be captioned.\n" +
      "Filenames here are camera timestamps and carry no description, so there is\n" +
      "nothing to fall back on. Set the key, or run with --thumbs-only to prepare\n" +
      "the images now and caption later."
  );
  process.exit(1);
}

let done = 0;
let failed = 0;
const rows = [];

async function worker(items) {
  for (const item of items) {
    const thumb = join(THUMB_DIR, `${item.hash}.jpg`);
    const working = join(TMP_DIR, `${item.hash}.jpg`);
    try {
      if (!existsSync(thumb)) downscale(item.representative, thumb, THUMB_PX);
      if (!THUMBS_ONLY) {
        downscale(item.representative, working, THUMB_PX);
        rows.push(toRow(await caption(working), item));
        unlinkSync(working);
      }
    } catch (err) {
      failed++;
      console.warn(`  ! ${relative(folder, item.representative)}: ${err.message}`);
    }
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${queue.length}`);
  }
}

await Promise.all(
  Array.from({ length: Math.max(1, CONCURRENCY) }, (_, i) =>
    worker(queue.filter((_, idx) => idx % CONCURRENCY === i))
  )
);

if (THUMBS_ONLY) {
  console.log(`\nprepared ${done - failed} thumbnails in public/archive (${failed} failed)`);
  console.log("set ANTHROPIC_API_KEY and re-run without --thumbs-only to caption them");
  process.exit(0);
}

let inserted = 0;
for (let i = 0; i < rows.length; i += 100) {
  const batch = rows.slice(i, i + 100);
  const { error } = await sb.from("archive_cakes").insert(batch);
  if (error) console.error(`  batch ${i / 100 + 1} failed: ${error.message}`);
  else inserted += batch.length;
}

console.log(`\ningested ${inserted} cakes (${failed} failed)`);
console.log("price, hours and servings are intentionally blank.");
console.log("next: node scripts/calibration.mjs export  — pick the photos for the bakery to price");
