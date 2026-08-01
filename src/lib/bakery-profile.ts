/**
 * The bakery onboarding questionnaire, as data.
 *
 * The profile is what both halves of the product are built on: the ad copy is
 * written from it, and the phone agent is briefed from it. A thin profile
 * produces generic ads and an agent that has to say "let me check on that" to
 * every second question, so the questionnaire is deliberately long — the
 * questions here are the ones a bakery gets asked over and over by real
 * customers.
 *
 * Storage is split (see src/lib/server/db.ts): the fields the storefront and
 * the order engine need are real columns on `bakeries`; everything else rides
 * in a `profile` jsonb column, so adding a question is a change to this file
 * and nothing else.
 */

import type { Bakery, DeliveryPricing } from "./types";

/* ------------------------------- vocabulary ------------------------------- */

export const CAKE_TYPE_OPTIONS = [
  "Birthday",
  "Wedding",
  "Anniversary",
  "Baby shower",
  "Custom / themed",
  "Corporate & branded",
  "Cupcakes",
  "Cake pops & minis",
  "Sheet cakes",
  "Cheesecake",
  "Number & letter cakes",
  "Tiered celebration",
];

export const FLAVOR_OPTIONS = [
  "Vanilla bean",
  "Chocolate fudge",
  "Red velvet",
  "Carrot",
  "Lemon",
  "Funfetti",
  "Marble",
  "Almond",
  "Coconut",
  "Tres leches",
  "Ube",
  "Matcha",
  "Pistachio",
  "Banana",
  "Spice",
];

export const FILLING_OPTIONS = [
  "American buttercream",
  "Swiss meringue buttercream",
  "Cream cheese",
  "Chocolate ganache",
  "Whipped cream",
  "Fruit preserves",
  "Lemon curd",
  "Salted caramel",
  "Custard / pastry cream",
  "Fresh berries",
];

export const DECORATION_OPTIONS = [
  "Hand-piped buttercream",
  "Fondant finish",
  "Sculpted / 3D shapes",
  "Sugar flowers",
  "Fresh flowers",
  "Edible photo print",
  "Hand-painted",
  "Airbrush",
  "Drip & ganache",
  "Isomalt & sails",
  "Metallic leaf",
  "Toy / topper placement",
];

export const DIETARY_OPTIONS = [
  "Vegan",
  "Gluten-free",
  "Dairy-free",
  "Egg-free",
  "Nut-free",
  "Refined-sugar-free",
  "Halal",
  "Kosher",
];

export const ALLERGEN_OPTIONS = [
  "Wheat / gluten",
  "Eggs",
  "Dairy",
  "Tree nuts",
  "Peanuts",
  "Soy",
  "Sesame",
];

export const PAYMENT_METHOD_OPTIONS = [
  "Card in store",
  "Card over the phone",
  "Payment link",
  "Cash",
  "Venmo / Zelle",
  "Invoice (net 30)",
];

/** The three ways a bakery prices a delivery, in the order /setup offers them. */
export const DELIVERY_PRICING_OPTIONS: Array<{
  value: DeliveryPricing;
  label: string;
  hint: string;
}> = [
  {
    value: "per_mile",
    label: "Priced by distance",
    hint: "A rate per mile driven, plus an optional call-out fee.",
  },
  { value: "flat", label: "One flat fee", hint: "The same fee anywhere in the zone." },
  { value: "free", label: "Free delivery", hint: "No fee anywhere in the zone." },
];

export const PEAK_SEASON_OPTIONS = [
  "Valentine's Day",
  "Easter",
  "Mother's Day",
  "Graduation (May–June)",
  "Wedding season (June–Sep)",
  "Halloween",
  "Thanksgiving",
  "Christmas & New Year",
];

export const TARGET_CUSTOMER_OPTIONS = [
  "Parents planning kids' parties",
  "Couples & wedding planners",
  "Offices & corporate gifting",
  "Event planners",
  "Local walk-in regulars",
  "Milestone birthdays (30/40/50)",
];

export const TONE_OPTIONS = [
  "Warm & homey",
  "Upbeat & playful",
  "Calm & professional",
  "Boutique & elegant",
];

/** JS getDay() order, rotated so the week starts on Monday for humans. */
export const WEEKDAYS: Array<{ value: number; short: string; long: string }> = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 0, short: "Sun", long: "Sunday" },
];

/* -------------------------------- defaults -------------------------------- */

/**
 * What an unanswered questionnaire looks like. Numbers are the median answer
 * a small custom-cake bakery gives, so a profile saved after a quick pass is
 * still internally consistent; the free-text fields start empty because a
 * guessed differentiator in ad copy is worse than none.
 */
export const DEFAULT_BAKERY: Bakery = {
  // identity
  name: "",
  location: "",
  address: "",
  phone: "",
  email: "",
  description: "",
  website: "",
  instagram: "",
  foundedYear: 0,

  // hours
  hours: "",
  openHour: 8,
  closeHour: 18,
  closedWeekdays: [1],
  orderCutoffHour: 12,

  // catalog
  cakeTypes: ["Birthday", "Custom / themed", "Cupcakes"],
  flavors: ["Vanilla bean", "Chocolate fudge", "Red velvet", "Lemon"],
  fillings: ["American buttercream", "Cream cheese", "Chocolate ganache"],
  decorations: ["Hand-piped buttercream", "Fondant finish", "Drip & ganache"],
  maxTiers: 3,
  minServings: 8,
  maxServings: 100,
  priceMin: 45,
  priceMax: 350,
  pricePerServing: 6,
  signatureItems: "",
  tastingsOffered: false,

  // dietary
  dietaryOptions: ["Gluten-free"],
  allergensOnSite: ["Wheat / gluten", "Eggs", "Dairy", "Tree nuts"],
  sharedKitchen: true,

  // capacity
  leadTimeDays: 3,
  weddingLeadTimeDays: 21,
  rushAvailable: true,
  rushFeeUsd: 35,
  weeklyCakeCapacity: 25,
  peakSeasons: ["Mother's Day", "Graduation (May–June)", "Christmas & New Year"],

  // fulfillment
  fulfillment: ["pickup", "delivery"],
  deliveryRadiusMiles: 15,
  deliveryPricing: "per_mile",
  deliveryPerMileUsd: 2,
  deliveryBaseFeeUsd: 5,
  deliveryFeeUsd: 20,
  deliveryMinimumUsd: 75,
  latitude: 0,
  longitude: 0,
  weddingSetup: false,
  nationwideShipping: false,

  // policies
  depositPercent: 50,
  paymentMethods: ["Card in store", "Payment link", "Cash"],
  cancellationDays: 7,
  customQuoteThresholdUsd: 300,

  // phone agent brief
  tone: "Warm & homey",
  greeting: "",
  differentiators: "",
  doNotPromise: "",
  escalationContact: "",

  // ads
  monthlyBudget: 300,
  targetCustomers: ["Parents planning kids' parties", "Milestone birthdays (30/40/50)"],
  adRadiusMiles: 20,
  currentOffer: "",
};

/**
 * The fields that live in the `profile` jsonb column — everything the
 * storefront and the order engine do not read off a real column.
 */
export const PROFILE_KEYS = [
  "website",
  "instagram",
  "foundedYear",
  "flavors",
  "fillings",
  "decorations",
  "maxTiers",
  "minServings",
  "maxServings",
  "pricePerServing",
  "signatureItems",
  "tastingsOffered",
  "dietaryOptions",
  "allergensOnSite",
  "sharedKitchen",
  "leadTimeDays",
  "weddingLeadTimeDays",
  "rushAvailable",
  "rushFeeUsd",
  "weeklyCakeCapacity",
  "peakSeasons",
  "deliveryRadiusMiles",
  "deliveryPricing",
  "deliveryPerMileUsd",
  "deliveryBaseFeeUsd",
  "deliveryFeeUsd",
  "deliveryMinimumUsd",
  "latitude",
  "longitude",
  "weddingSetup",
  "nationwideShipping",
  "depositPercent",
  "paymentMethods",
  "cancellationDays",
  "customQuoteThresholdUsd",
  "tone",
  "greeting",
  "differentiators",
  "doNotPromise",
  "escalationContact",
  "targetCustomers",
  "adRadiusMiles",
  "currentOffer",
] as const;

export type ProfileKey = (typeof PROFILE_KEYS)[number];

/** The jsonb half of a bakery profile. */
export type BakeryProfileDetail = Pick<Bakery, ProfileKey>;

export const PROFILE_DEFAULTS: BakeryProfileDetail = Object.fromEntries(
  PROFILE_KEYS.map((key) => [key, DEFAULT_BAKERY[key]])
) as BakeryProfileDetail;

/* -------------------------------- helpers --------------------------------- */

/** 8 -> "8 AM", 12 -> "12 PM", 0 -> "12 AM". */
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${suffix}`;
}

/**
 * The spoken/printed opening-hours line, derived from the structured hours so
 * the sentence the agent reads out can never drift from the days the order
 * engine actually accepts pickups on.
 */
export function describeHours(
  openHour: number,
  closeHour: number,
  closedWeekdays: number[]
): string {
  const open = WEEKDAYS.filter((d) => !closedWeekdays.includes(d.value));
  if (!open.length) return "By appointment only";

  // Collapse Monday-first runs of open days into ranges: Tue,Wed,…,Sun -> Tue–Sun.
  const runs: string[] = [];
  let start = 0;
  const indexes = open.map((d) => WEEKDAYS.findIndex((w) => w.value === d.value));
  for (let i = 0; i <= indexes.length; i++) {
    const broken = i === indexes.length || indexes[i] !== indexes[i - 1] + 1;
    if (i > 0 && broken) {
      const from = open[start].short;
      const to = open[i - 1].short;
      runs.push(i - 1 - start === 0 ? from : i - 1 - start === 1 ? `${from}, ${to}` : `${from}–${to}`);
      start = i;
    }
  }

  const days = runs.length === 1 && open.length === 7 ? "Every day" : runs.join(", ");
  return `${days}, ${formatHour(openHour)} – ${formatHour(closeHour)}`;
}

/** Days the bakery is closed, spelled out for a prompt. */
export function describeClosedDays(closedWeekdays: number[]): string {
  const names = WEEKDAYS.filter((d) => closedWeekdays.includes(d.value)).map((d) => d.long);
  if (!names.length) return "never — open seven days";
  return names.join(", ");
}
