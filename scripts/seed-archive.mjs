// Seeds a stand-in cake archive so retrieval and comps-based pricing can be
// built and tested before a bakery's real photo library is imported.
//
//   node scripts/seed-archive.mjs [count]
//
// Everything written here has source='seed'. That flag is load-bearing: a
// quote assembled from invented history must never be mistaken for one backed
// by real sales, so the proposal page labels seeded designs and the estimator
// reports how many of its comparables were real.
//
// Replacing this with a real archive means writing rows with source='archive'
// and a real photo_url. Nothing else in the pipeline changes.
//
// Prices and hours are generated from a consistent cost model (size, coating,
// decoration complexity) with noise, so nearest-neighbour pricing has a real
// signal to find rather than uniform randomness.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const BAKERY_ID = "default";

/** Deterministic PRNG, so a reseed produces the same archive. */
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260731);
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);

/* ------------------------------- archetypes ------------------------------- */

// Exactly one coating per cake. Sweet Lady Jane's constraint — "you can't put
// fondant on buttercream, you can't put buttercream on whipped cream" — is
// only expressible if coating is a single value rather than a free tag list.
const COATINGS = {
  fondant: { premium: 0.25, hours: 1.6 },
  buttercream: { premium: 0, hours: 0 },
  "whipped cream": { premium: -0.05, hours: -0.2 },
};

const DECORATIONS = {
  piping: { premium: 0.1, hours: 0.8 },
  "hand-painted": { premium: 0.4, hours: 2.5 },
  sculpted: { premium: 0.8, hours: 4 },
  drip: { premium: 0.08, hours: 0.5 },
  "fresh flowers": { premium: 0.15, hours: 0.6 },
  "edible print": { premium: 0.05, hours: 0.3 },
  "gold leaf": { premium: 0.3, hours: 1.2 },
};

const ARCHETYPES = [
  { theme: "rainbow", occasion: ["birthday"], colors: ["rainbow", "pink", "yellow", "blue"],
    coatings: ["buttercream", "fondant"], decorations: ["piping", "drip"], sizes: [12, 16, 24, 30] },
  { theme: "bear", occasion: ["birthday", "christening"], colors: ["brown", "cream"],
    coatings: ["fondant", "buttercream"], decorations: ["sculpted", "piping"], sizes: [12, 16, 20] },
  { theme: "princess", occasion: ["birthday"], colors: ["pink", "gold", "white"],
    coatings: ["fondant"], decorations: ["hand-painted", "gold leaf"], sizes: [16, 20, 24] },
  { theme: "unicorn", occasion: ["birthday"], colors: ["pastel", "pink", "gold"],
    coatings: ["buttercream"], decorations: ["piping", "gold leaf"], sizes: [12, 16, 24] },
  { theme: "dinosaur", occasion: ["birthday"], colors: ["green", "brown"],
    coatings: ["fondant"], decorations: ["sculpted"], sizes: [16, 20, 24] },
  { theme: "safari", occasion: ["birthday", "christening"], colors: ["green", "beige", "brown"],
    coatings: ["fondant"], decorations: ["sculpted", "hand-painted"], sizes: [20, 30, 40] },
  { theme: "floral", occasion: ["wedding", "birthday", "anniversary"], colors: ["white", "pastel", "blush"],
    coatings: ["buttercream", "fondant"], decorations: ["piping", "fresh flowers"], sizes: [20, 30, 40, 60] },
  { theme: "classic wedding", occasion: ["wedding"], colors: ["white", "ivory"],
    coatings: ["fondant"], decorations: ["piping", "fresh flowers", "gold leaf"], sizes: [40, 60, 80, 100] },
  { theme: "naked cake", occasion: ["wedding", "birthday"], colors: ["cream", "berry"],
    coatings: ["buttercream"], decorations: ["fresh flowers"], sizes: [20, 30, 40] },
  { theme: "chocolate drip", occasion: ["birthday"], colors: ["chocolate", "gold"],
    coatings: ["buttercream"], decorations: ["drip", "gold leaf"], sizes: [12, 16, 24, 30] },
  { theme: "number", occasion: ["birthday"], colors: ["gold", "pink", "blue"],
    coatings: ["buttercream", "fondant"], decorations: ["piping", "gold leaf"], sizes: [12, 16, 24] },
  { theme: "superhero", occasion: ["birthday"], colors: ["red", "blue"],
    coatings: ["fondant"], decorations: ["hand-painted", "edible print"], sizes: [16, 20, 24] },
  { theme: "minimalist", occasion: ["birthday", "wedding", "corporate"], colors: ["white", "beige"],
    coatings: ["buttercream"], decorations: ["piping"], sizes: [12, 20, 30] },
  { theme: "photo print", occasion: ["birthday", "corporate"], colors: ["white"],
    coatings: ["buttercream"], decorations: ["edible print"], sizes: [12, 16, 24] },
  { theme: "graduation", occasion: ["graduation"], colors: ["navy", "gold"],
    coatings: ["fondant"], decorations: ["hand-painted", "edible print"], sizes: [16, 24, 30] },
  { theme: "christening", occasion: ["christening"], colors: ["white", "pastel", "blue"],
    coatings: ["fondant", "buttercream"], decorations: ["piping", "hand-painted"], sizes: [16, 24, 30] },
];

const tiersFor = (servings) => (servings >= 60 ? 4 : servings >= 40 ? 3 : servings >= 20 ? 2 : 1);

function priceAndHours(servings, coating, decorations) {
  // Base: per-serving cost plus a per-tier assembly charge.
  const tiers = tiersFor(servings);
  let cents = servings * 220 + tiers * 3500;
  let hours = 1.2 + tiers * 0.7 + servings * 0.02;

  cents *= 1 + COATINGS[coating].premium;
  hours += COATINGS[coating].hours;
  for (const d of decorations) {
    cents *= 1 + DECORATIONS[d].premium;
    hours += DECORATIONS[d].hours;
  }

  // Real jobs vary; without spread there is nothing for a confidence score to
  // measure and comps would look implausibly tight.
  cents *= between(0.92, 1.08);
  hours *= between(0.9, 1.1);

  return {
    price_cents: Math.round(cents / 500) * 500,
    labor_hours: Math.round(hours * 2) / 2,
  };
}

function describe(theme, coating, decorations, servings) {
  const tiers = tiersFor(servings);
  const tierWord = ["", "single-tier", "two-tier", "three-tier", "four-tier"][tiers];
  const decor = decorations.join(" and ");
  return `A ${tierWord} ${coating} ${theme} cake with ${decor}, serving about ${servings}.`;
}

/* --------------------------------- build ---------------------------------- */

const count = Number(process.argv[2] ?? 120);
const rows = [];
const today = new Date("2026-07-31");

for (let i = 0; i < count; i++) {
  const a = ARCHETYPES[i % ARCHETYPES.length];
  const coating = pick(a.coatings);
  const decorations = [...new Set([pick(a.decorations), ...(rnd() < 0.35 ? [pick(a.decorations)] : [])])];
  const servings = pick(a.sizes);
  const { price_cents, labor_hours } = priceAndHours(servings, coating, decorations);
  const occasion = a.occasion.slice(0, 1 + Math.floor(rnd() * a.occasion.length));
  const madeOn = new Date(today.getTime() - Math.floor(between(5, 540)) * 86400000);

  rows.push({
    bakery_id: BAKERY_ID,
    source: "seed",
    photo_url: "",
    thumbnail_url: "",
    title: `${a.theme[0].toUpperCase()}${a.theme.slice(1)} — ${coating}, serves ${servings}`,
    spoken_description: describe(a.theme, coating, decorations, servings),
    occasion,
    themes: [a.theme, ...decorations.filter((d) => d === "drip" || d === "sculpted")],
    colors: a.colors.slice(0, 1 + Math.floor(rnd() * a.colors.length)),
    techniques: [coating, ...decorations],
    tiers: tiersFor(servings),
    servings,
    // A tenth of a real archive has no recorded price. The estimator must
    // cope with that rather than assume complete history.
    price_cents: rnd() < 0.1 ? null : price_cents,
    labor_hours: rnd() < 0.1 ? null : labor_hours,
    made_on: madeOn.toISOString().slice(0, 10),
    active: true,
  });
}

// The archive is keyed to a bakery, but this script does not own the bakery
// profile — /setup and the storefront seeder do. Create a minimal row only if
// the table is empty (the demo reset clears it), and never overwrite one that
// already exists.
const { data: existing, error: bakeryReadError } = await sb
  .from("bakeries")
  .select("id")
  .eq("id", BAKERY_ID)
  .maybeSingle();
if (bakeryReadError) {
  console.error("bakery lookup failed:", bakeryReadError.message);
  process.exit(1);
}
if (!existing) {
  const { error } = await sb.from("bakeries").insert({
    id: BAKERY_ID,
    name: "Sweet Street Bakery",
    location: "Austin, TX",
    address: "1912 South Congress Avenue, Austin, TX 78704",
    cake_types: ["Birthday", "Custom / themed", "Wedding"],
    price_min: 45,
    price_max: 900,
    fulfillment: ["pickup", "delivery"],
    phone: "(512) 555-0148",
    hours: "Tuesday to Sunday, 8 AM to 6 PM",
    monthly_budget: 300,
    slug: "sweet-street-bakery",
    currency: "USD",
    order_cutoff_hour: 12,
    open_hour: 8,
    close_hour: 18,
    closed_weekdays: [1],
  });
  if (error) {
    console.error("bakery create failed:", error.message);
    process.exit(1);
  }
  console.log("created the missing bakery profile (id=default)");
}

const { error: clearError } = await sb
  .from("archive_cakes")
  .delete()
  .eq("bakery_id", BAKERY_ID)
  .eq("source", "seed");
if (clearError) {
  console.error("clear failed:", clearError.message);
  process.exit(1);
}

const { data, error } = await sb.from("archive_cakes").insert(rows).select("id");
if (error) {
  console.error("insert failed:", error.message);
  process.exit(1);
}

const priced = rows.filter((r) => r.price_cents !== null);
const prices = priced.map((r) => r.price_cents).sort((a, b) => a - b);
console.log(`seeded ${data.length} archive cakes (${priced.length} with recorded price/hours)`);
console.log(
  `price range $${(prices[0] / 100).toFixed(0)} - $${(prices[prices.length - 1] / 100).toFixed(0)}, ` +
    `median $${(prices[Math.floor(prices.length / 2)] / 100).toFixed(0)}`
);
const byTheme = {};
for (const r of rows) byTheme[r.themes[0]] = (byTheme[r.themes[0]] ?? 0) + 1;
console.log("themes:", Object.entries(byTheme).map(([t, n]) => `${t}(${n})`).join(" "));
