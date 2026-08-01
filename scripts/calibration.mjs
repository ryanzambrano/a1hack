// The calibration loop: ask the bakery to price a small, well-chosen set of
// their own past cakes, then feed the answers back so the pricing model can be
// fitted.
//
//   node scripts/calibration.mjs export [--count 30] [--out calibration.csv]
//   node scripts/calibration.mjs import calibration.csv
//   node scripts/calibration.mjs status
//
// CSV because it is the one format every bakery office already has open. The
// exported file has three blank columns — price, servings, hours — and a link
// to each photo. Filling it in is the entire ask.

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const args = process.argv.slice(2);
const command = args[0];
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const BAKERY_ID = value("bakery", "default");
const APP = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(/\/$/, "");

const COATINGS = ["fondant", "buttercream", "whipped cream"];

async function loadArchive() {
  const { data, error } = await sb
    .from("archive_cakes")
    .select("*")
    .eq("bakery_id", BAKERY_ID)
    .eq("active", true);
  if (error) {
    console.error("load failed:", error.message);
    process.exit(1);
  }
  return data ?? [];
}

/* ---------------- selection (mirrors src/lib/archive/calibration.ts) -------- */

const tagsOf = (c) =>
  new Set([
    ...c.themes.map((t) => `theme:${t}`),
    ...c.techniques.map((t) => `${COATINGS.includes(t) ? "coating" : "decor"}:${t}`),
    ...c.occasion.map((o) => `occasion:${o}`),
    `tiers:${c.tiers}`,
  ]);

function distance(a, b) {
  if (!a.size && !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return 1 - shared / (a.size + b.size - shared);
}

function selectCalibrationSet(archive, count) {
  const candidates = archive.filter((c) => c.price_cents === null);
  if (!candidates.length) return [];

  const tags = new Map(candidates.map((c) => [c.id, tagsOf(c)]));
  const frequency = new Map();
  for (const set of tags.values()) for (const t of set) frequency.set(t, (frequency.get(t) ?? 0) + 1);

  const typicality = (c) => {
    const set = tags.get(c.id);
    if (!set.size) return 0;
    let total = 0;
    for (const t of set) total += frequency.get(t) ?? 0;
    return total / set.size;
  };

  const sorted = [...candidates].sort((a, b) => typicality(b) - typicality(a));
  const chosen = [sorted[0]];
  const remaining = new Set(candidates.slice(1).map((c) => c.id));
  const byId = new Map(candidates.map((c) => [c.id, c]));

  while (chosen.length < count && remaining.size) {
    let best = null;
    for (const id of remaining) {
      let nearest = Infinity;
      for (const picked of chosen) {
        const d = distance(tags.get(id), tags.get(picked.id));
        if (d < nearest) nearest = d;
      }
      if (!best || nearest > best.score) best = { id, score: nearest };
    }
    if (!best) break;
    remaining.delete(best.id);
    chosen.push(byId.get(best.id));
  }
  return chosen;
}

/* --------------------------------- csv ------------------------------------ */

const escape = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/* ------------------------------- commands --------------------------------- */

if (command === "export") {
  const archive = await loadArchive();
  const count = Number(value("count", "30"));
  const picks = selectCalibrationSet(archive, count);

  if (!picks.length) {
    console.log("Nothing to price — every cake in the archive already has a price.");
    process.exit(0);
  }

  const header = [
    "id", "photo", "title", "description", "themes", "techniques", "tiers",
    "PRICE_USD", "SERVINGS", "HOURS",
  ];
  const lines = [header.join(",")];
  for (const c of picks) {
    lines.push([
      c.id,
      c.photo_url || `${APP}/api/archive/photo/${c.id}`,
      c.title,
      c.spoken_description,
      c.themes.join(" / "),
      c.techniques.join(" / "),
      c.tiers,
      "", "", "",
    ].map(escape).join(","));
  }

  const out = value("out", "calibration.csv");
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`wrote ${picks.length} cakes to ${out}`);
  console.log("\nSend this to the bakery. They fill in three columns:");
  // The archive spans years. What a cake sold for in 2017 is not what it is
  // worth quoting in 2026, and every estimate built from these numbers is a
  // quote for today — so ask for today's price, not the historical one.
  console.log("  PRICE_USD  what you would charge for this cake TODAY");
  console.log("  SERVINGS   how many people it fed");
  console.log("  HOURS      decorating time, optional but improves the estimate");
  console.log(`\nThen: node scripts/calibration.mjs import ${out}`);
} else if (command === "import") {
  const file = args[1];
  if (!file) {
    console.error("usage: node scripts/calibration.mjs import <file.csv>");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(file, "utf8"));
  const header = rows[0].map((h) => h.trim().toUpperCase());
  const col = (name) => header.indexOf(name);
  const [idCol, priceCol, servingsCol, hoursCol] = [
    col("ID"), col("PRICE_USD"), col("SERVINGS"), col("HOURS"),
  ];
  if (idCol === -1 || priceCol === -1) {
    console.error("CSV needs at least an 'id' and a 'PRICE_USD' column");
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const id = Number(row[idCol]);
    const dollars = parseFloat(String(row[priceCol] ?? "").replace(/[^0-9.]/g, ""));
    if (!id || !Number.isFinite(dollars) || dollars <= 0) { skipped++; continue; }

    const servings = servingsCol >= 0 ? parseInt(row[servingsCol], 10) : NaN;
    const hours = hoursCol >= 0 ? parseFloat(row[hoursCol]) : NaN;

    const patch = { price_cents: Math.round(dollars * 100) };
    if (Number.isFinite(servings) && servings > 0) patch.servings = servings;
    if (Number.isFinite(hours) && hours > 0) patch.labor_hours = hours;

    const { error } = await sb.from("archive_cakes").update(patch).eq("id", id);
    if (error) { console.warn(`  ! id ${id}: ${error.message}`); skipped++; }
    else updated++;
  }

  console.log(`priced ${updated} cakes (${skipped} rows skipped)`);
  const archive = await loadArchive();
  const withPrice = archive.filter((c) => c.price_cents !== null);
  const withServings = withPrice.filter((c) => c.servings);
  console.log(`archive now has ${withPrice.length} priced, ${withServings.length} with servings`);
  if (withServings.length < 12) {
    console.log("Fewer than 12 usable rows — the model needs servings as well as price.");
  } else {
    console.log("\nNext: GET /api/archive/backtest to see the error and the learning curve.");
  }
} else if (command === "status") {
  const archive = await loadArchive();
  const priced = archive.filter((c) => c.price_cents !== null);
  const usable = priced.filter((c) => c.servings);
  const covered = new Set(priced.flatMap((c) => [...c.techniques, ...c.themes]));
  const all = new Set(archive.flatMap((c) => [...c.techniques, ...c.themes]));
  const uncovered = [...all].filter((t) => !covered.has(t));

  console.log(`archive:  ${archive.length} cakes`);
  console.log(`priced:   ${priced.length}`);
  console.log(`usable:   ${usable.length} (price and servings both present)`);
  if (uncovered.length) {
    console.log(`\nno priced example yet for: ${uncovered.slice(0, 15).join(", ")}`);
    console.log("Those designs will fall back to the fitted model rather than comparables.");
  }
} else {
  console.error("usage: node scripts/calibration.mjs <export|import|status>");
  process.exit(1);
}
