// Seed data: one demo bakery and ten realistic products, shaped by the Step 0
// research (sizes in persons/pieces with absolute display prices, free filling
// choices, paid text-on-cake, day-granular lead times). Prices are øre and
// include 15% food VAT, matching Norwegian shops.

export const bakery = {
  slug: "bakeriet-pa-hjornet",
  name: "Bakeriet på Hjørnet",
  description:
    "Et lite håndverksbakeri midt i byen. Alt bakes fra bunnen av, hver morgen.",
  address: "Storgata 14, 2000 Lillestrøm",
  phone: "+47 63 80 12 34",
  email: "post@bakeriethjornet.no",
  currency: "NOK",
  orderCutoffHour: 12,
  openHour: 8,
  closeHour: 16,
  closedWeekdays: [0], // Sunday
};

// options: [groupName, valueName, priceDeltaCents, isDefault]
export const products = [
  {
    name: "Bløtkake med friske bær",
    description:
      "Klassisk bløtkake med vaniljekrem, friske bær og luftig krem. En sikker vinner til enhver feiring.",
    category: "Kaker",
    imageUrl: "/img/blotkake.svg",
    basePriceCents: 52000,
    leadTimeDays: 2,
    canHaveCakeText: true,
    cakeTextPriceCents: 8000,
    options: [
      ["Størrelse", "8 personer", 0, true],
      ["Størrelse", "12 personer", 26000, false],
      ["Størrelse", "16 personer", 46000, false],
      ["Fyll", "Vaniljekrem og jordbær", 0, true],
      ["Fyll", "Bringebær", 0, false],
      ["Fyll", "Sjokoladekrem", 0, false],
    ],
  },
  {
    name: "Sjokoladekake",
    description:
      "Saftig sjokoladekake med silkemyk sjokoladekrem. Velg fyllet du liker best.",
    category: "Kaker",
    imageUrl: "/img/sjokoladekake.svg",
    basePriceCents: 49000,
    leadTimeDays: 2,
    canHaveCakeText: true,
    cakeTextPriceCents: 8000,
    options: [
      ["Størrelse", "8 biter", 0, true],
      ["Størrelse", "12 biter", 20000, false],
      ["Størrelse", "16 biter", 44000, false],
      ["Størrelse", "24 biter", 90000, false],
      ["Fyll", "Sjokoladekrem", 0, true],
      ["Fyll", "Bringebær og vaniljekrem", 0, false],
      ["Fyll", "Oreokrem", 0, false],
    ],
  },
  {
    name: "Gulrotkake",
    description:
      "Krydret gulrotkake med ostekrem og valnøtter. Bakes på bestilling.",
    category: "Kaker",
    imageUrl: "/img/gulrotkake.svg",
    basePriceCents: 42000,
    leadTimeDays: 2,
    canHaveCakeText: true,
    cakeTextPriceCents: 8000,
    options: [
      ["Størrelse", "8 personer", 0, true],
      ["Størrelse", "12 personer", 20000, false],
    ],
  },
  {
    name: "Kransekake",
    description:
      "Tradisjonsrik kransekake av mandler, stablet og pyntet for hånd. Perfekt til høytid og fest.",
    category: "Kaker",
    imageUrl: "/img/kransekake.svg",
    basePriceCents: 99000,
    leadTimeDays: 3,
    canHaveCakeText: false,
    cakeTextPriceCents: 0,
    options: [
      ["Størrelse", "18 ringer", 0, true],
      ["Størrelse", "24 ringer", 30000, false],
      ["Pynt", "Norske flagg", 0, true],
      ["Pynt", "Hvite sløyfer", 0, false],
      ["Pynt", "Uten pynt", 0, false],
    ],
  },
  {
    name: "Festkake med hilsen",
    description:
      "Vår festkake med marsipanlokk, pyntet for anledningen. Hilsen på kaken er inkludert i prisen.",
    category: "Kaker",
    imageUrl: "/img/festkake.svg",
    basePriceCents: 78000,
    leadTimeDays: 3,
    canHaveCakeText: true,
    cakeTextPriceCents: 0,
    options: [
      ["Størrelse", "12 personer", 0, true],
      ["Størrelse", "20 personer", 37000, false],
      ["Størrelse", "30 personer (rektangulær)", 91000, false],
      ["Pynt", "Fødselsdag", 0, true],
      ["Pynt", "Dåp", 9500, false],
      ["Pynt", "Konfirmasjon", 9500, false],
      ["Pynt", "Nøytral", 0, false],
    ],
  },
  {
    name: "Skolebrød, 6 stk",
    description:
      "Seks nystekte skolebrød med vaniljekrem og kokos. Hentes samme uke som de bakes, altså alltid ferske.",
    category: "Bakst",
    imageUrl: "/img/skolebrod.svg",
    basePriceCents: 18000,
    leadTimeDays: 1,
    canHaveCakeText: false,
    cakeTextPriceCents: 0,
    options: [],
  },
  {
    name: "Kanelboller",
    description:
      "Myke kanelboller med rikelig fyll og perlesukker. Bakes gjennom hele dagen.",
    category: "Bakst",
    imageUrl: "/img/kanelbolle.svg",
    basePriceCents: 12000,
    leadTimeDays: 0,
    canHaveCakeText: false,
    cakeTextPriceCents: 0,
    options: [
      ["Antall", "4 stykker", 0, true],
      ["Antall", "8 stykker", 10000, false],
    ],
  },
  {
    name: "Makroner",
    description:
      "Delikate franske makroner i eske. Velg blandet utvalg eller din favorittsmak.",
    category: "Bakst",
    imageUrl: "/img/makroner.svg",
    basePriceCents: 15000,
    leadTimeDays: 1,
    canHaveCakeText: false,
    cakeTextPriceCents: 0,
    options: [
      ["Eske", "6 makroner", 0, true],
      ["Eske", "12 makroner", 14000, false],
      ["Smak", "Blandet utvalg", 0, true],
      ["Smak", "Bringebær", 0, false],
      ["Smak", "Pistasj", 0, false],
      ["Smak", "Sjokolade", 0, false],
    ],
  },
  {
    name: "Croissant",
    description:
      "Sprø smørcroissant laminert over to dager. Best samme dag som den stekes.",
    category: "Bakst",
    imageUrl: "/img/croissant.svg",
    basePriceCents: 4200,
    leadTimeDays: 0,
    canHaveCakeText: false,
    cakeTextPriceCents: 0,
    options: [],
  },
  {
    name: "Surdeigsbrød",
    description:
      "Rustikt surdeigsbrød med sprø skorpe, bakt på egen surdeigskultur. Steinovnsbakt hver morgen.",
    category: "Brød",
    imageUrl: "/img/surdeigsbrod.svg",
    basePriceCents: 6500,
    leadTimeDays: 0,
    canHaveCakeText: false,
    cakeTextPriceCents: 0,
    options: [
      ["Skjæring", "Hel", 0, true],
      ["Skjæring", "Skåret i skiver", 0, false],
    ],
  },
];

/** Insert the seed bakery + products into an empty database. */
export function runSeed(db) {
  const bkStmt = db.prepare(
    `INSERT INTO bakeries (slug, name, description, address, phone, email, currency,
       order_cutoff_hour, open_hour, close_hour, closed_weekdays)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const bk = bkStmt.run(
    bakery.slug, bakery.name, bakery.description, bakery.address, bakery.phone,
    bakery.email, bakery.currency, bakery.orderCutoffHour, bakery.openHour,
    bakery.closeHour, JSON.stringify(bakery.closedWeekdays)
  );
  const bakeryId = Number(bk.lastInsertRowid);

  const pStmt = db.prepare(
    `INSERT INTO products (bakery_id, name, description, category, image_url,
       base_price_cents, lead_time_days, can_have_cake_text, cake_text_price_cents,
       active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  );
  const oStmt = db.prepare(
    `INSERT INTO product_options (product_id, group_name, value_name,
       price_delta_cents, is_default, position)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  products.forEach((p, i) => {
    const res = pStmt.run(
      bakeryId, p.name, p.description, p.category, p.imageUrl,
      p.basePriceCents, p.leadTimeDays, p.canHaveCakeText ? 1 : 0,
      p.cakeTextPriceCents, i + 1
    );
    const productId = Number(res.lastInsertRowid);
    p.options.forEach(([group, value, delta, isDefault], j) => {
      oStmt.run(productId, group, value, delta, isDefault ? 1 : 0, j);
    });
  });

  return bakeryId;
}
