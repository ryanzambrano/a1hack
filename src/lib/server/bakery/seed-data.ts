// Seed catalog, ported from bakery-platform/lib/seed.js and translated to
// English/USD. The shape of the data is unchanged: sizes are an ordinary
// option group whose deltas the UI renders as absolute prices, fillings are
// free choices, text on the cake is a paid extra on some cakes and included on
// others, and lead times are day-granular.
//
// Prices map 1:1 from the original øre by dropping a decimal (52000 øre ->
// 5200 cents), which lands on realistic US bakery pricing.
//
// The bakery matches SweetLeads' demo profile in src/app/setup/page.tsx, so
// the storefront and the lead-gen side describe the same business. Its
// "Tue-Sun, 8 AM - 6 PM" hours are what closedWeekdays [1] and the 8/18 open
// hours encode here.

// Relative, with extensions: pricing.test.ts imports this file and Node runs
// it directly, without the "@/" alias.
import { PROFILE_DEFAULTS, type BakeryProfileDetail } from "../../bakery-profile.ts";

import type { ShopBakery } from "./types";

export type SeedOption = {
  groupName: string;
  valueName: string;
  priceDeltaCents: number;
  isDefault?: boolean;
};

export type SeedProduct = {
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  basePriceCents: number;
  leadTimeDays: number;
  canHaveCakeText: boolean;
  cakeTextPriceCents: number;
  options: SeedOption[];
};

/**
 * The demo bakery's answers to the setup questionnaire. A half-empty profile
 * makes the generated ad and the agent's brief look thin in a fresh database,
 * so the seed answers every question the way a real shop would.
 */
export const seedProfile: BakeryProfileDetail = {
  ...PROFILE_DEFAULTS,
  website: "sweetstreetbakery.com",
  instagram: "@sweetstreetatx",
  foundedYear: 2014,
  flavors: [
    "Vanilla bean",
    "Chocolate fudge",
    "Red velvet",
    "Carrot",
    "Lemon",
    "Tres leches",
    "Funfetti",
  ],
  fillings: [
    "Swiss meringue buttercream",
    "Cream cheese",
    "Chocolate ganache",
    "Salted caramel",
    "Fresh berries",
  ],
  decorations: [
    "Hand-piped buttercream",
    "Fondant finish",
    "Sculpted / 3D shapes",
    "Sugar flowers",
    "Edible photo print",
    "Drip & ganache",
  ],
  maxTiers: 4,
  minServings: 8,
  maxServings: 120,
  pricePerServing: 7,
  signatureItems: "Berry cream layer cake, brown-butter carrot cake, tres leches sheet cake",
  tastingsOffered: true,
  dietaryOptions: ["Gluten-free", "Vegan", "Egg-free"],
  allergensOnSite: ["Wheat / gluten", "Eggs", "Dairy", "Tree nuts", "Soy"],
  sharedKitchen: true,
  leadTimeDays: 3,
  weddingLeadTimeDays: 28,
  rushAvailable: true,
  rushFeeUsd: 40,
  weeklyCakeCapacity: 30,
  peakSeasons: ["Mother's Day", "Graduation (May–June)", "Wedding season (June–Sep)", "Christmas & New Year"],
  deliveryRadiusMiles: 15,
  deliveryPricing: "per_mile",
  deliveryPerMileUsd: 2,
  deliveryBaseFeeUsd: 5,
  deliveryFeeUsd: 20,
  deliveryMinimumUsd: 60,
  // 1408 South Congress Ave, Austin — pinned rather than geocoded so a fresh
  // database can quote a delivery on the very first call.
  latitude: 30.2504,
  longitude: -97.7501,
  weddingSetup: true,
  nationwideShipping: false,
  depositPercent: 50,
  paymentMethods: ["Card in store", "Payment link", "Cash"],
  cancellationDays: 7,
  customQuoteThresholdUsd: 300,
  tone: "Warm & homey",
  greeting: "",
  differentiators:
    "Everything is scratch-baked each morning, and every custom cake is sketched with the customer before it is quoted.",
  doNotPromise:
    "A same-day wedding cake, a guaranteed allergen-free cake, or any discount over 10%.",
  escalationContact: "Nadia, head baker — (512) 555-0148",
  targetCustomers: [
    "Parents planning kids' parties",
    "Couples & wedding planners",
    "Offices & corporate gifting",
  ],
  adRadiusMiles: 20,
  currentOffer: "",
};

export const seedBakery: Omit<ShopBakery, "id"> = {
  slug: "sweet-street-bakery",
  name: "Sweet Street Bakery",
  description:
    "A small craft bakery in the middle of town. Everything is made from scratch, every morning.",
  address: "1408 South Congress Ave, Austin, TX 78704",
  phone: "(512) 555-0148",
  email: "hello@sweetstreetbakery.com",
  currency: "USD",
  orderCutoffHour: 12,
  openHour: 8,
  closeHour: 18,
  closedWeekdays: [1], // Monday
};

const opt = (
  groupName: string,
  valueName: string,
  priceDeltaCents: number,
  isDefault = false
): SeedOption => ({ groupName, valueName, priceDeltaCents, isDefault });

export const seedProducts: SeedProduct[] = [
  {
    name: "Berry Cream Layer Cake",
    description:
      "Classic sponge layer cake with vanilla cream, fresh berries and airy whipped cream. A safe win for any celebration.",
    category: "Cakes",
    imageUrl: "/img/blotkake.svg",
    basePriceCents: 5200,
    leadTimeDays: 2,
    canHaveCakeText: true,
    cakeTextPriceCents: 800,
    options: [
      opt("Size", "Serves 8", 0, true),
      opt("Size", "Serves 12", 2600),
      opt("Size", "Serves 16", 4600),
      opt("Filling", "Vanilla cream and strawberry", 0, true),
      opt("Filling", "Raspberry", 0),
      opt("Filling", "Chocolate cream", 0),
    ],
  },
  {
    name: "Chocolate Fudge Cake",
    description:
      "Rich chocolate cake with a silky chocolate cream. Pick whichever filling you like best.",
    category: "Cakes",
    imageUrl: "/img/sjokoladekake.svg",
    basePriceCents: 4900,
    leadTimeDays: 2,
    canHaveCakeText: true,
    cakeTextPriceCents: 800,
    options: [
      opt("Size", "8 slices", 0, true),
      opt("Size", "12 slices", 2000),
      opt("Size", "16 slices", 4400),
      opt("Size", "24 slices", 9000),
      opt("Filling", "Chocolate cream", 0, true),
      opt("Filling", "Raspberry and vanilla cream", 0),
      opt("Filling", "Cookies and cream", 0),
    ],
  },
  {
    name: "Carrot Cake",
    description:
      "Spiced carrot cake with cream cheese frosting and walnuts. Baked to order.",
    category: "Cakes",
    imageUrl: "/img/gulrotkake.svg",
    basePriceCents: 4200,
    leadTimeDays: 2,
    canHaveCakeText: true,
    cakeTextPriceCents: 800,
    options: [
      opt("Size", "Serves 8", 0, true),
      opt("Size", "Serves 12", 2000),
    ],
  },
  {
    name: "Almond Ring Cake",
    description:
      "Traditional stacked almond ring cake, decorated by hand. Perfect for holidays and big occasions.",
    category: "Cakes",
    imageUrl: "/img/kransekake.svg",
    basePriceCents: 9900,
    leadTimeDays: 3,
    canHaveCakeText: false,
    cakeTextPriceCents: 0,
    options: [
      opt("Size", "18 rings", 0, true),
      opt("Size", "24 rings", 3000),
      opt("Decoration", "Flags", 0, true),
      opt("Decoration", "White ribbons", 0),
      opt("Decoration", "No decoration", 0),
    ],
  },
  {
    name: "Celebration Cake",
    description:
      "Our party cake under a marzipan lid, decorated for the occasion. A greeting on the cake is included in the price.",
    category: "Cakes",
    imageUrl: "/img/festkake.svg",
    basePriceCents: 7800,
    leadTimeDays: 3,
    canHaveCakeText: true,
    cakeTextPriceCents: 0,
    options: [
      opt("Size", "Serves 12", 0, true),
      opt("Size", "Serves 20", 3700),
      opt("Size", "Serves 30 (rectangular)", 9100),
      opt("Decoration", "Birthday", 0, true),
      opt("Decoration", "Christening", 950),
      opt("Decoration", "Graduation", 950),
      opt("Decoration", "Neutral", 0),
    ],
  },
  {
    name: "Custard Buns, 6-pack",
    description:
      "Six freshly baked custard buns with vanilla cream and coconut. Picked up the same week they are baked, so always fresh.",
    category: "Pastries",
    imageUrl: "/img/skolebrod.svg",
    basePriceCents: 1800,
    leadTimeDays: 1,
    canHaveCakeText: false,
    cakeTextPriceCents: 0,
    options: [],
  },
  {
    name: "Cinnamon Rolls",
    description:
      "Soft cinnamon rolls with a generous filling and pearl sugar. Baked throughout the day.",
    category: "Pastries",
    imageUrl: "/img/kanelbolle.svg",
    basePriceCents: 1200,
    leadTimeDays: 0,
    canHaveCakeText: false,
    cakeTextPriceCents: 0,
    options: [
      opt("Count", "4 rolls", 0, true),
      opt("Count", "8 rolls", 1000),
    ],
  },
  {
    name: "French Macarons",
    description:
      "Delicate French macarons in a box. Choose an assorted selection or your favorite flavor.",
    category: "Pastries",
    imageUrl: "/img/makroner.svg",
    basePriceCents: 1500,
    leadTimeDays: 1,
    canHaveCakeText: false,
    cakeTextPriceCents: 0,
    options: [
      opt("Box", "6 macarons", 0, true),
      opt("Box", "12 macarons", 1400),
      opt("Flavor", "Assorted selection", 0, true),
      opt("Flavor", "Raspberry", 0),
      opt("Flavor", "Pistachio", 0),
      opt("Flavor", "Chocolate", 0),
    ],
  },
  {
    name: "Butter Croissant",
    description:
      "Crisp butter croissant laminated over two days. Best on the day it is baked.",
    category: "Pastries",
    imageUrl: "/img/croissant.svg",
    basePriceCents: 420,
    leadTimeDays: 0,
    canHaveCakeText: false,
    cakeTextPriceCents: 0,
    options: [],
  },
  {
    name: "Sourdough Loaf",
    description:
      "Rustic sourdough with a crackling crust, built on our own starter. Stone baked every morning.",
    category: "Bread",
    imageUrl: "/img/surdeigsbrod.svg",
    basePriceCents: 650,
    leadTimeDays: 0,
    canHaveCakeText: false,
    cakeTextPriceCents: 0,
    options: [
      opt("Slicing", "Whole", 0, true),
      opt("Slicing", "Sliced", 0),
    ],
  },
];
