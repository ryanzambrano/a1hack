# How bakery pricing works, and what every bakery actually charges

Reference for how a cake's price is assembled on Daymaker, plus the full
per-bakery price and delivery-fee data behind it.

**Data snapshot:** 2026-07-31, read from prod (`bakery_platform.bakeries`,
`bakery_platform.delivery_zones`). 86 bakeries not soft-deleted, 172 delivery
zones. All figures below are as-stored; nothing is smoothed or imputed.

**Formula sources:** `api/_lib/cake-pricing.ts`, `api/_lib/cake-sizes.ts`,
`api/_lib/zone-fees.ts`, `api/_lib/gift-pricing.ts`, `api/_lib/fx.ts`,
`apps/customer/scripts/campaign/pricing.js`.

---

## 1. The shape of the problem

Every bakery prices independently. There is no platform price list. Two
separate per-bakery inputs combine into one customer price:

```
        bakeries.cake_prices_cents          delivery_zones
        { size → local cents }              polygon + fee + volume tiers
                    │                              │
                    │                              │ point-in-polygon on the
                    │                              │ recipient's lat/lng
                    ▼                              ▼
             cake price (local)  +  per-cake delivery fee (local)
                              │
                              │  toUsdCents() — static FX table
                              ▼
                        cost in USD cents
                              │
                              │  max(ceil_to_dollar(1.65 × cost), floor[size])
                              ▼
                    what the customer is charged
```

The bakery is paid `cake price + zone fee` — the raw inputs, converted back to
its own currency. Daymaker keeps the 0.65 spread. There is no take rate, no
commission, no per-bakery negotiated margin: the 1.65 multiplier is a platform
constant applied identically to every bakery.

So "bakeries are priced differently" means exactly two things: **they set
different per-size cake prices**, and **they draw different delivery zones with
different fees**. Everything downstream is uniform.

---

## 2. Cake price

### Storage

`bakeries.cake_prices_cents` — a `jsonb` map of size code → integer cents **in
the bakery's own currency**. Keys come from `CAKE_SIZE_CODES`:

| Code | Label | Feeds | Customer floor (USD) |
|---|---|---|--:|
| `6in` | 6" round | 6–8 | $80 |
| `8in` | 8" round | 10–14 | $100 |
| `10in` | 10" round | 18–24 | $150 |
| `12in` | 12" round | 28–40 | $200 |
| `half_sheet` | Half sheet | ~50 | $300 |
| `sheet` | Sheet | ~100 | $500 |

The price is **all-in for the cake**: cake + edible print + box card. It
excludes delivery. A size absent from the map (or priced `0`) means the bakery
does not offer it — that is the only expression of what a bakery can make.
`8in` is the default and the one every bakery must price at onboarding.

Two adjacent columns:

- `cake_retail_prices_cents` — what a walk-in would pay that bakery directly.
  Optional, collected to anchor a future marketplace. Almost entirely unset
  (see §7).
- `cake_base_price_cents` — legacy single-size integer, superseded by the map.
  Still populated on 72 rows; **not read by any pricing path**.

### Coverage — who prices what

Of 86 bakeries:

| Size | Bakeries pricing it | Of active (64) |
|---|--:|--:|
| `6in` | 55 | 52 |
| `8in` | 72 | 64 |
| `10in` | 33 | 30 |
| `12in` | 11 | 10 |
| `half_sheet` | 23 | 22 |
| `sheet` | 11 | 11 |

Sizes priced per bakery: 3 sizes (22 bakeries), 2 (19), 0 (14), 1 (13), 4 (7),
5 (6), 6 (5). **Every one of the 64 active bakeries prices `8in` and has at
least one delivery zone** — the roster is complete where it matters. All 14
bakeries pricing nothing are Norwegian and `pending_review` (never onboarded).

### Price distribution, USD cents

Converted at the static FX table. All 86 first, then active-only — use the
active numbers as the real population.

**All bakeries:**

| Size | n | min | p25 | median | p75 | max | mean |
|---|--:|--:|--:|--:|--:|--:|--:|
| `6in` | 55 | $25.90 | $41.44 | $55.00 | $81.00 | $190.50 | $64.60 |
| `8in` | 72 | $32.50 | $55.00 | $70.00 | $94.53 | $215.90 | $78.28 |
| `10in` | 33 | $56.00 | $75.00 | $95.90 | $115.00 | $210.00 | $106.40 |
| `12in` | 11 | $57.79 | $85.00 | $100.00 | $144.00 | $280.00 | $121.07 |
| `half_sheet` | 23 | $65.00 | $115.00 | $150.00 | $199.90 | $250.00 | $156.02 |
| `sheet` | 11 | $75.00 | $200.00 | $259.00 | $325.00 | $400.00 | $256.81 |

**Active only (64):**

| Size | n | min | p25 | median | p75 | max |
|---|--:|--:|--:|--:|--:|--:|
| `6in` | 52 | $25.90 | $41.44 | $60.00 | $82.55 | $190.50 |
| `8in` | 64 | $33.30 | $55.00 | $65.00 | $95.00 | $215.90 |
| `10in` | 30 | $56.00 | $75.00 | $95.90 | $120.00 | $210.00 |
| `12in` | 10 | $57.79 | $90.00 | $105.00 | $144.00 | $280.00 |
| `half_sheet` | 22 | $65.00 | $120.00 | $150.00 | $199.90 | $250.00 |
| `sheet` | 11 | $75.00 | $200.00 | $259.00 | $325.00 | $400.00 |

The 8" spread is **6.5×** min to max. That is the single most important fact
about this dataset: the same product costs $33 in one city and $216 in another,
and nothing in the platform normalizes it.

### By currency and country (8", the comparable size)

| Currency | n | min (local) | median (local) | max (local) | median USD |
|---|--:|--:|--:|--:|--:|
| USD | 51 | 4000 | 7000 | 17000 | $70.00 |
| CAD | 8 | 4500 | 8500 | 15000 | $62.90 |
| GBP | 5 | 3150 | 8500 | 17000 | $107.95 |
| AUD | 2 | 5000 | 6200 | 6200 | $40.30 |
| EUR | 2 | 5000 | 10800 | 10800 | $116.64 |
| SEK | 2 | 50000 | 99500 | 99500 | $94.53 |
| DKK | 1 | 50000 | 50000 | 50000 | $72.00 |
| NOK | 1 | 45000 | 45000 | 45000 | $42.30 |

| Country | n | min | median | max |
|---|--:|--:|--:|--:|
| US | 50 | $40.00 | $72.00 | $170.00 |
| CA | 8 | $33.30 | $62.90 | $111.00 |
| GB | 5 | $40.01 | $107.95 | $215.90 |
| AU | 2 | $32.50 | $40.30 | $40.30 |
| SE | 2 | $47.50 | $94.53 | $94.53 |
| DK / FR / NG / NL / NO | 1 each | — | $72.00 / $116.64 / $70.00 / $54.00 / $42.30 | — |

Country populations outside the US are small; treat anything with n < 5 as
anecdote, not distribution.

### The size ladder

Each bakery's other sizes as a percentage of **its own** 8" price. This is the
within-bakery structure, and it is far more consistent than the cross-bakery
level:

| Size | n | min | median | max |
|---|--:|--:|--:|--:|
| `6in` | 55 | 51% | **80%** | 100% |
| `8in` | 72 | 100% | 100% | 100% |
| `10in` | 33 | 109% | **133%** | 174% |
| `12in` | 11 | 133% | **167%** | 263% |
| `half_sheet` | 23 | 80% | **208%** | 413% |
| `sheet` | 11 | 133% | **400%** | 612% |

A usable prior for imputing a missing size: 0.8 / 1.0 / 1.33 / 1.67 / 2.08 /
4.0. Note `half_sheet` min of 80% — at least one bakery prices a half sheet
below its 8" round, which is either a deliberate volume call or an error.

---

## 3. Delivery

Delivery is priced per bakery, per **zone**, and optionally per **quantity**.
It never depends on distance at price time — only on which polygon the
recipient's coordinates fall inside.

### Zone resolution (`api/_lib/zone-fees.ts`)

1. Point-in-polygon the recipient's lat/lng against every active,
   non-deleted zone belonging to that bakery.
2. Among **all** matching zones, take the **cheapest** fee — not the first, not
   the smallest polygon. Zones routinely nest as concentric rings, so a
   recipient near the bakery matches all of them; cheapest-wins keeps that from
   over-billing and makes the result independent of row order.
3. A zone with `delivery_fee_override_cents = NULL` counts as **free (0)**.
4. No lat/lng, or no zone contains the point → **0**, not an error. A recipient
   outside every zone is a coverage question, not a pricing one.

Fees are in the bakery's local currency.

### Volume tiers

`delivery_zones.delivery_fee_tiers` — `[{ min_qty, fee_cents }]`, local cents.
The per-cake fee drops when one order sends at least `min_qty` cakes into that
zone, because a single drive amortizes over the batch. Parsing keeps only
integer entries with `min_qty >= 2` and `fee_cents >= 0`, sorted ascending;
malformed entries are dropped silently.

Resolution is `min(base_fee, every tier the quantity qualifies for)` — the
minimum, not "deepest tier wins". A non-monotonic tier list can therefore only
ever discount, never raise the fee above base.

Quantity is counted per **zone**, over the cakes in the same order that resolve
to that zone — not per order and not per address.

Six zones use tiers today, across four bakeries:

| Bakery | Zone | Base | Tier |
|---|---|--:|---|
| Sweet Lady Jane | Zone 1 | $30.00 | 20+ → $10.00 |
| Sweet Lady Jane | Zone 2 | $50.00 | 20+ → $20.00 |
| Sweet Lady Jane | Zone 3 | $50.00 | 20+ → $20.00 |
| Sweet Lady Jane | Zone 4 | $100.00 | 20+ → $35.00 |
| Joeycakes Custom Cakes | Zone 1 | $10.00 | 10+ → $5.00 |
| Creative Cakes & Events | Zone 2 | 250000 SEK¢ | 10+ → 100000 SEK¢ |

The discounts are steep: 50–67% off the single-cake fee.

### Distribution

- 172 zones total, all active. 69 of 86 bakeries have at least one.
- Zones per bakery: 1 (46 bakeries), 7 (6), 8 (5), 3 (4), 4 (3), 2 (2), 5 (2),
  6 (1). Median 1, max 8.
- 13 zones have `NULL` fee (free), 1 has an explicit `0`, 158 charge.
- `min_order_value_cents`: **set on zero zones.** The column exists and is
  unused.

Paid-zone fee, USD:

| | min | p25 | median | p75 | max | mean |
|---|--:|--:|--:|--:|--:|--:|
| All 158 paid zones | $2.00 | $12.00 | $22.50 | $40.00 | $200.00 | $34.62 |
| All active-bakery zones (167, incl. free) | $0.00 | $10.80 | $22.20 | $40.00 | $200.00 | — |

A **100× spread**, wider than cake price. Delivery is where bakeries differ
most.

### Ring structure

Multi-zone bakeries almost always price a linear ramp outward. Cheapest →
dearest, USD:

| Bakery | Zones | Ladder |
|---|--:|---|
| Livie's Couture Bakeshop | 8 | 2 → 4 → 6 → 8 → 10 → 12 → 14 → 15 |
| Irresistible Cakes | 8 | 3.55 → 7.10 → 10.66 → 14.21 → 17.76 → 21.31 → 24.86 → 26.64 |
| DreamScape Desserts | 8 | 4 → 8 → 12 → 16 → 20 → 24 → 28 → 30 |
| Made With Love Cakery | 8 | 7.50 → 15 → 22.50 → 30 → 37.50 → 45 → 52.50 → 60 |
| Ideal Bakery | 8 | 20 → 40 → 60 → 80 → 100 → 120 → 140 → 160 |
| Cakestar | 7 | 4.44 → 8.88 → 13.32 → 17.76 → 22.20 → 26.64 → 27.75 |
| Kiss My Cakes LLC | 7 | 6 → 12 → 18 → 24 → 30 → 36 → 40 |
| Cedars Cakes | 7 | 10 → 20 → 30 → 40 → 50 → 60 → 70 |
| Cassie Cakes | 7 | 15 → 30 → 45 → 60 → 75 → 90 → 100 |
| Pastry is Art | 7 | 17.50 → 35 → 52.50 → 70 → 87.50 → 105 → 122.50 |
| Sweet Peach Confections | 7 | 4 → 8 → 12 → 16 → 20 → 24 → 25 |
| Frudeco | 6 | 30 → 40 → 40 → 60 → 80 → 115 |

The pattern is a constant per-ring increment `k`, with the outermost ring often
capped below the extrapolated value. `k` ranges from $2 to $20 — that single
per-bakery constant explains nearly all delivery variance.

### How the rings got drawn: `bakeries.delivery_pricing`

47 bakeries have this config, which records how the zone editor's "simple mode"
was filled in. **Nothing prices off it** — the generated polygons in
`delivery_zones` remain the only source of truth. It is useful as a statement
of the bakery's intent:

| Mode | n | Meaning |
|---|--:|---|
| `radius_flat` | 23 | One flat fee out to `max_distance` |
| `radius_per_distance` | 13 | `per_distance_fee_cents` per unit of distance |
| `custom` | 11 | Polygons drawn by hand |

```json
{"mode":"radius_per_distance","unit":"km","max_distance":50,"flat_fee_cents":null,"per_distance_fee_cents":150}
{"mode":"radius_flat","unit":"km","max_distance":30,"flat_fee_cents":10000,"per_distance_fee_cents":null}
```

`unit` is `km` on every row. `max_distance` observed: 14–50 km.
`per_distance_fee_cents` observed: 120–150 (i.e. $1.20–$1.50/km).
`flat_fee_cents` observed: 1000–30000.

---

## 4. Currency

`api/_lib/fx.ts` holds a **static** USD-per-unit table, last refreshed
2026-05-29. Rates relevant to the current roster:

| | USD | CAD | GBP | EUR | AUD | SEK | DKK | NOK |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| USD per unit | 1 | 0.74 | 1.27 | 1.08 | 0.65 | 0.095 | 0.144 | 0.094 |

Customer prices are always USD. Conversion happens at estimate time. The table
is deliberately approximate — final prices are set when Daymaker accepts a
campaign — but the payout close cron settles **real money** against it, and
`fxTableAgeDays()` exists so it can say out loud when the table is stale. Any
model trained on USD figures inherits this table's error.

Payout runs the conversion **backwards** (`api/_lib/bakery-payout.ts`):
`assignments.payout_amount_cents` is always USD, but the bakery invoices in its
own currency, so each cake is converted back individually — per-cake first,
total second, so `5 × £31.50 = £157.50` rather than a £157.51 rounding artifact.

---

## 5. From cost to customer price

### The per-cake formula

```
cost_usd     = toUsdCents(cake_price_local + zone_fee_local, currency)
marked_up    = ceil(cost_usd × 1.65 / 100) × 100      // round UP to whole dollars
customer     = max(marked_up, CAKE_SIZE_FLOOR_CENTS[size])
```

`CUSTOMER_MARKUP = 1.65` is a constant in `api/_lib/cake-pricing.ts`. Daymaker
keeps the 65% spread over bakery cost (~40% of revenue). Rounding up to the
whole dollar means the charged total never carries cents and margin is never
rounded down.

The size floor is a **silent minimum on the charged total** — margin
protection. It is never shown as the cake line.

### Which term binds

Using each bakery's median zone fee:

| Size | n | markup wins | floor binds | customer price min | median | max |
|---|--:|--:|--:|--:|--:|--:|
| `6in` | 55 | 48 | 6 (+1 tie) | $80 | $132 | $367 |
| `8in` | 72 | 62 | 10 | $100 | $149 | $409 |
| `10in` | 33 | 28 | 5 | $150 | $198 | $396 |
| `12in` | 11 | 6 | 5 | $200 | $227 | $512 |
| `half_sheet` | 23 | 13 | 10 | $300 | $314 | $439 |
| `sheet` | 11 | 6 | 5 | $500 | $504 | $660 |

The markup dominates at small sizes; at `12in` and above the floor binds
roughly half the time, because few bakeries price large formats high enough to
clear it. **The realized margin on a floor-bound cake is higher than 1.65×** —
that is the point of the floor, and any margin model has to branch on it.

### Campaigns: group, then average

`priceByEffectiveSize()` groups recipients by their effective size and prices
each group at `max(1.65 × mean(cost within group), floor)`, then sums
`count × per-cake`. One uniform per-cake price per size, not per recipient —
so a campaign spanning a cheap and an expensive bakery charges the average of
the two, and the itemized lines always reconcile to the total exactly.

Effective size resolution, in order: explicit override (honored only if the
recipient's own bakery prices it — otherwise it's a blocking
`size_override_issue`, never a silent downgrade) → the campaign default if
**every** assigned bakery prices it → that recipient's bakery's cheapest priced
size. If the bakery prices nothing, the recipient is excluded rather than billed
a floor for an undeliverable cake.

### Gifts: address unknown at checkout

`api/_lib/gift-pricing.ts` produces two numbers per size:

- **Worst case** — for each bakery, cake price + its **most expensive** zone
  fee, run through the standard formula; keep the **maximum** across bakeries.
  Used by the prepaid model so the locked price can never undercharge wherever
  the recipient turns out to live.
- **Estimate** — same, but each bakery's **median** zone fee, then the median
  across bakeries. Median so one pricey outlier doesn't set the number every
  sender sees. Even-count medians take the upper middle — always a real
  observed value, erring slightly conservative.

### What the receipt shows

Display-only decomposition (`apps/customer/scripts/campaign/pricing.js`); the
charged total is untouched.

```
n              = price_per_cake(8") - $100        // clamped >= 0
cake_image_fee = min($15, n)
shipping       = n - cake_image_fee
cake_line      = price_per_cake - n
```

The 8" cake line is pinned at $100 and shipping is derived from that baseline,
so switching size moves only the cake line — delivery cancels out. The shipping
line is itemized as `n × $X` only when the unit divides the total exactly.

---

## 6. What the bakery is paid

`cake_price + zone_fee` — the raw inputs, no deductions. Zero take rate. The
markup is charged **on top of**, never taken **out of**, the bakery's price.

Surcharges (`docs/SURCHARGES.md`) are grossed up rather than netted, so a
bakery asking for X receives exactly X: `Y = (X + fixed) / (1 - pct)`, with
`pct`/`fixed` configured per currency. Daymaker absorbs the processing fee
difference.

Other per-bakery operational fields that constrain but don't price:

- `lead_time_hours` — 24h (40 bakeries), 48h (19), 72h (17), 36h (3), 96h (2),
  120h (2), and singletons at 5, 30, 168.
- `max_daily_deliveries` — 20 (51), 10 (10), 50 (7), 5 (7), then a long tail to
  500.
- `default_tax_rate_bp` — **0 on 84 of 86**. One at 500bp, one at 875bp. Tax is
  effectively not modeled.

---

## 7. Data-quality caveats

Read these before training on anything above.

1. **22 of 86 bakeries are not active** (18 `pending_review`, 4 `blocked`).
   They carry prices that were never transacted. Filter to
   `status = 'active'` unless you specifically want the lead pool.
2. **All 14 zero-price bakeries are Norwegian `pending_review` rows** — scraped
   leads, not onboarded bakeries. Their absence is not a signal about Norwegian
   pricing. Only 1 of 15 NO bakeries (Holtsmark Catering, 45000 NOK¢) has a real
   price.
3. **Retail prices are effectively absent** — 2 rows of 86, and one is a unit
   error: *Not Your Grandma's Cupcakes* has an 8" retail of `300000` (i.e.
   $3,000) against a $60 bulk price, a nonsensical 98% "discount". The only
   trustworthy retail row is *SmallCakes Clermont*: 6" 4500→7500 and 8"
   6500→9500, a **31–40% bulk discount off retail**. Do not train a
   retail-vs-bulk margin on n=1.
4. **`cake_base_price_cents` is populated on 72 rows and read by nothing.** It
   will disagree with `cake_prices_cents`. Ignore it.
5. **`min_order_value_cents` is set on zero zones** — the feature is unused, not
   defaulted.
6. **`delivery_pricing` is intent, not truth.** 47 rows describe how the zone
   editor was filled in; the polygons are authoritative and may have been edited
   since.
7. **FX is a static table** dated 2026-05-29. Every non-USD figure carries that
   staleness. The NOK/SEK/DKK medians rest on n=1–2 bakeries each.
8. **Free zones are `NULL`, not `0`.** 13 zones are `NULL` and 1 is an explicit
   `0`; they behave identically in pricing but a naive `AVG()` will drop the
   `NULL`s and overstate the mean fee.
9. **One test row is in the data** — a bakery named "William Lindholm" (CA, CAD,
   active, 100.00/100.00, one free zone). Exclude it.
10. **Everything here is config, not transactions.** These are list prices, not
    realized order values. What was actually charged lives in
    `campaigns.locked_price_cents`.

---

## 8. Worked example

*Cakestar*, Canada, CAD. `cake_prices_cents = {"6in":7000,"8in":8500,"10in":14500,"sheet":35000}`.
Seven zones ramping $6.00 → $37.50 CAD. Recipient lands in ring 3 (CA$18.00),
ordering one 8".

```
cost_local  = 8500 + 1800              = CA$103.00
cost_usd    = 10300 × 0.74             = 7622  ($76.22)
marked_up   = ceil(7622 × 1.65 / 100)  = $126.00
floor[8in]                             = $100.00
customer    = max(126, 100)            = $126.00     ← markup binds
bakery paid = CA$103.00
```

Receipt display: `n = 126 - 100 = $26` → cake image fee $15, shipping $11, cake
line $100.

Same cake to that bakery's innermost zone (CA$6.00): cost CA$91.00 → $67.34 →
`ceil(111.11) = $112`. Same cake, same bakery, **$14 cheaper** purely on which
polygon the address falls in.

---

## Appendix A — every bakery

Prices are **local-currency** units (not cents). Empty = size not offered. Fee
columns are that bakery's zone fees, local units.

| Bakery | Country | Cur | Status | 6in | 8in | 10in | 12in | half_sheet | sheet | 8in USD | Zones | Fee lo | Fee med | Fee hi | Tiers |
|---|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|
| Brøndums | AU | AUD | blocked |  | 50.00 |  |  |  |  | 32.50 |  |  |  |  |  |
| Sugar Whipped Cakes  | AU | AUD | active | 52.00 | 62.00 |  |  |  |  | 40.30 | 1 | 18.00 | 18.00 | 18.00 |  |
| Just Cakes Bakeshop | CA | CAD | active | 57.00 | 87.00 |  |  |  |  | 64.38 | 4 | 15.00 | 30.00 | 30.00 |  |
| William Lindholm | CA | CAD | active | 100.00 | 100.00 |  |  |  |  | 74.00 | 1 | 0.00 | 0.00 | 0.00 |  |
| Baking My Feels | CA | CAD | active | 125.00 | 150.00 |  |  | 275.00 |  | 111.00 | 5 | 15.00 | 45.00 | 75.00 |  |
| Cakestar | CA | CAD | active | 70.00 | 85.00 | 145.00 |  |  | 350.00 | 62.90 | 7 | 6.00 | 24.00 | 37.50 |  |
| For The Love of Cakes | CA | CAD | active |  | 60.00 |  |  |  |  | 44.40 | 1 | 100.00 | 100.00 | 100.00 |  |
| Gold Cherry Bakery | CA | CAD | active | 35.00 | 65.00 |  |  |  |  | 48.10 | 1 | 15.00 | 15.00 | 15.00 |  |
| Irresistible Cakes | CA | CAD | active | 56.00 | 76.00 | 96.00 |  |  |  | 56.24 | 8 | 4.80 | 24.00 | 36.00 |  |
| Shirinisara Pastry House | CA | CAD | active | 38.00 | 45.00 |  |  |  |  | 33.30 | 1 | 10.00 | 10.00 | 10.00 |  |
| Bakery By Hermann | DK | DKK | active | 350.00 | 500.00 | 650.00 | 1000.00 | 1500.00 | 2000.00 | 72.00 | 1 | 300.00 | 300.00 | 300.00 |  |
| Berkoparis | FR | EUR | active | 85.00 | 108.00 | 188.00 |  |  |  | 116.64 | 2 | 0.00 | 0.00 | 0.00 |  |
| Cake Me Over | GB | GBP | active | 65.00 | 85.00 |  |  |  |  | 107.95 | 1 | 35.00 | 35.00 | 35.00 |  |
| GC COUTURE | GB | GBP | active | 150.00 | 170.00 |  |  |  |  | 215.90 | 1 | 25.00 | 25.00 | 25.00 |  |
| Good Cake Day | GB | GBP | active | 80.00 | 110.00 | 150.00 |  |  |  | 139.70 | 1 | 15.00 | 15.00 | 15.00 |  |
| bakerdays | GB | GBP | blocked |  | 60.00 |  |  |  |  | 76.20 | 1 | 0.00 | 0.00 | 0.00 |  |
| bakerdays Ltd | GB | GBP | active |  | 31.50 |  | 45.50 |  |  | 40.01 | 1 | 0.00 | 0.00 | 0.00 |  |
| Franjipan Cakes & Desserts | NG | USD | pending_review |  | 70.00 |  |  |  |  | 70.00 |  |  |  |  |  |
| Oh là là, Charlotte ! Patisserie | NL | EUR | active |  | 50.00 |  |  |  |  | 54.00 | 1 | 10.00 | 10.00 | 10.00 |  |
| Bakery Creations | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| Brown Sugar Bakery  | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| Buttercoop | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| Buzz Bakeshop | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| Cocoa & Stardust | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| Custom Cake Cakery | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| Holtsmark Catering | NO | NOK | active |  | 450.00 |  |  |  |  | 42.30 | 1 | 0.00 | 0.00 | 0.00 |  |
| Palermo Bakery | NO | NOK | pending_review |  |  |  |  |  |  |  | 1 | 20.00 | 20.00 | 20.00 |  |
| Party Favors | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| Sophies | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| Sweet Frostings Blissful Bakeshop | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| Sweet Thomas Bakery | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| SweetArts Bakery | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| Taste of Cakery | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| The Sweet Tooth Parlor Bakery | NO | NOK | pending_review |  |  |  |  |  |  |  |  |  |  |  |  |
| Creative Cakes & Events | SE | SEK | active |  | 500.00 |  |  |  |  | 47.50 | 1 | 250.00 | 250.00 | 250.00 | 10+→100.00 |
| Glossy cakes | SE | SEK | active | 695.00 | 995.00 |  |  |  |  | 94.53 | 1 | 295.00 | 295.00 | 295.00 |  |
| Marie's Sweets and Treats LLC  | US | USD | active |  | 65.00 |  |  |  |  | 65.00 | 1 | 5.00 | 5.00 | 5.00 |  |
| Piece of Cake Desserts | US | USD | active | 45.00 | 60.00 | 75.00 |  |  |  | 60.00 | 1 | 65.00 | 65.00 | 65.00 |  |
| Cocola Bakery | US | USD | active | 48.00 | 65.00 | 70.85 |  | 199.00 | 398.00 | 65.00 | 1 | 0.00 | 0.00 | 0.00 |  |
| Sugar Rush Cakery | US | USD | blocked | 60.00 | 72.00 | 108.00 |  |  |  | 72.00 | 1 | 0.00 | 0.00 | 0.00 |  |
| Casa Gioia | US | USD | active | 75.00 | 85.00 | 105.00 |  |  |  | 85.00 | 1 | 20.00 | 20.00 | 20.00 |  |
| Frudeco | US | USD | active | 90.00 | 110.00 |  |  |  |  | 110.00 | 6 | 30.00 | 60.00 | 115.00 |  |
| Pastry is Art | US | USD | active | 36.00 | 46.00 | 56.00 |  | 150.00 | 250.00 | 46.00 | 7 | 17.50 | 70.00 | 122.50 |  |
| SmallCakes Clermont  | US | USD | active | 45.00 | 65.00 |  |  |  |  | 65.00 | 1 | 20.00 | 20.00 | 20.00 |  |
| Livie's Couture Bakeshop  | US | USD | active | 106.00 | 128.00 |  |  |  |  | 128.00 | 8 | 2.00 | 10.00 | 15.00 |  |
| Cake 2 Taste | US | USD | blocked |  | 150.00 |  |  |  |  | 150.00 | 1 | 0.00 | 0.00 | 0.00 |  |
| Cassie Cakes | US | USD | active |  | 99.00 |  |  |  |  | 99.00 | 7 | 15.00 | 60.00 | 100.00 |  |
| Kiki'z Passion Bakery | US | USD | active | 75.00 | 90.00 | 125.00 |  |  |  | 90.00 | 1 | 40.00 | 40.00 | 40.00 |  |
| Smallcakes Smyrna | US | USD | active | 50.00 | 60.00 |  |  | 150.00 |  | 60.00 | 1 | 30.00 | 30.00 | 30.00 |  |
| Smallcakes West Cobb Marietta | US | USD | active | 50.00 | 60.00 |  |  | 150.00 |  | 60.00 | 1 | 30.00 | 30.00 | 30.00 |  |
| Sweet Peach Confections | US | USD | active | 60.00 | 75.00 |  |  | 250.00 |  | 75.00 | 7 | 4.00 | 16.00 | 25.00 |  |
| Boise Custom Cakes, LLC | US | USD | active | 115.00 | 170.00 | 210.00 | 280.00 |  |  | 170.00 | 1 | 30.00 | 30.00 | 30.00 |  |
| Ideal Bakery | US | USD | active | 30.00 | 50.00 |  |  |  |  | 50.00 | 8 | 20.00 | 100.00 | 160.00 |  |
| Palermo Bakery | US | USD | active |  | 60.00 | 75.00 | 90.00 | 115.00 |  | 60.00 | 1 | 20.00 | 20.00 | 20.00 |  |
| Les Amis Bake Shoppe | US | USD | active | 50.00 | 70.00 |  |  |  |  | 70.00 | 1 | 0.00 | 0.00 | 0.00 |  |
| Cedars Cakes | US | USD | active | 50.00 | 75.00 | 100.00 |  | 150.00 |  | 75.00 | 7 | 10.00 | 40.00 | 70.00 |  |
| Ivory BakerY | US | USD | active | 77.75 | 97.75 | 120.00 |  |  |  | 97.75 | 1 | 0.00 | 0.00 | 0.00 |  |
| La Luce Pastry | US | USD | active | 35.00 | 40.00 | 68.00 | 105.00 | 165.00 |  | 40.00 | 1 | 35.00 | 35.00 | 35.00 |  |
| DreamScape Desserts | US | USD | active |  | 47.00 |  |  |  |  | 47.00 | 8 | 4.00 | 20.00 | 30.00 |  |
| Raleigh Cakes | US | USD | active | 95.00 | 120.00 | 165.00 |  |  |  | 120.00 | 4 | 7.00 | 16.00 | 20.00 |  |
| Sweet Joy by Lily | US | USD | active | 75.00 | 95.00 |  |  | 105.00 |  | 95.00 | 3 | 10.00 | 20.00 | 25.00 |  |
| Goldenrod Pastries | US | USD | active | 50.00 | 60.00 | 89.96 |  | 100.00 |  | 60.00 | 1 | 20.00 | 20.00 | 20.00 |  |
| Made With Love Cakery | US | USD | active | 40.00 | 60.00 | 80.00 | 100.00 | 100.00 | 130.00 | 60.00 | 8 | 7.50 | 37.50 | 60.00 |  |
| Cake on Sunday | US | USD | active |  | 75.00 |  |  |  |  | 75.00 | 1 | 15.00 | 15.00 | 15.00 |  |
| Joeycakes Custom Cakes | US | USD | active | 40.00 | 47.00 |  |  |  |  | 47.00 | 1 | 10.00 | 10.00 | 10.00 | 10+→5.00 |
| SugarTown Bakery Cafe | US | USD | active | 65.00 | 75.00 | 95.00 |  | 150.00 | 200.00 | 75.00 | 1 | 20.00 | 20.00 | 20.00 |  |
| Betty Bakery | US | USD | active | 130.00 | 150.00 | 200.00 |  |  |  | 150.00 | 1 | 15.00 | 15.00 | 15.00 |  |
| Circo's Pasty Shop | US | USD | active |  | 60.00 | 90.00 |  | 125.00 |  | 60.00 | 5 | 40.00 | 120.00 | 200.00 |  |
| La Gran Via Bakery | US | USD | pending_review |  | 45.00 |  |  |  |  | 45.00 | 1 | 5.00 | 5.00 | 5.00 |  |
| Not Your Grandma’s Cupcakes | US | USD | active | 36.00 | 60.00 | 99.00 |  |  |  | 60.00 | 1 | 10.00 | 10.00 | 10.00 |  |
| Kiss My Cakes LLC | US | USD | active | 28.00 | 55.00 | 85.00 | 120.00 | 200.00 | 325.00 | 55.00 | 7 | 6.00 | 24.00 | 40.00 |  |
| The Irving Bakery | US | USD | active | 40.00 | 65.00 |  |  |  |  | 65.00 | 1 | 10.00 | 10.00 | 10.00 |  |
| Storybook Bakery | US | USD | pending_review | 50.00 | 60.00 | 70.00 | 80.00 | 100.00 |  | 60.00 | 1 | 15.00 | 15.00 | 15.00 |  |
| Desserts By Sara | US | USD | active |  | 60.00 |  |  | 175.00 |  | 60.00 | 3 | 10.00 | 20.00 | 20.00 |  |
| Aria’s Sweet Treats  | US | USD | active | 60.00 | 75.00 | 120.00 | 180.00 | 225.00 | 400.00 | 75.00 | 1 | 0.00 | 0.00 | 0.00 |  |
| BabyCake's Bakery | US | USD | pending_review | 55.00 | 85.00 | 115.00 |  |  |  | 85.00 |  |  |  |  |  |
| Bake Me A Cake | US | USD | active | 110.00 | 150.00 |  |  | 120.00 | 200.00 | 150.00 | 1 | 0.00 | 0.00 | 0.00 |  |
| Cake Hoopla | US | USD | active | 90.00 | 120.00 |  |  |  |  | 120.00 | 1 | 25.00 | 25.00 | 25.00 |  |
| Caked | US | USD | active | 30.00 | 55.00 |  |  |  |  | 55.00 | 1 | 0.00 | 0.00 | 0.00 |  |
| Dessert Works  | US | USD | active | 81.00 | 92.00 | 108.00 |  |  |  | 92.00 | 3 | 30.00 | 40.00 | 50.00 |  |
| Flie Cakes | US | USD | active | 125.00 | 150.00 |  |  | 175.00 |  | 150.00 | 3 | 10.00 | 15.00 | 25.00 |  |
| Katy Bakes TX | US | USD | active | 65.00 | 75.00 | 104.99 |  |  |  | 75.00 | 1 | 20.00 | 20.00 | 20.00 |  |
| Kennedy’s Kakes | US | USD | active | 45.00 | 55.00 | 70.00 | 90.00 | 65.00 | 75.00 | 55.00 | 1 | 10.00 | 10.00 | 10.00 |  |
| NY Bakery and Desserts | US | USD | active | 69.90 | 85.90 | 95.90 |  | 199.90 | 299.90 | 85.90 | 1 | 5.00 | 5.00 | 5.00 |  |
| Sweet Lady Jane | US | USD | active | 65.00 | 75.00 | 85.00 |  |  |  | 75.00 | 4 | 30.00 | 50.00 | 100.00 | 20+→10.00; 20+→20.00; 20+→20.00; 20+→35.00 |
| palisadespark bakery | US | USD | active | 38.00 | 48.00 | 60.00 | 85.00 |  |  | 48.00 | 2 | 5.00 | 5.00 | 5.00 |  |


## Appendix B — every delivery zone

| Bakery | Country | Cur | Zone | Fee (local) | Fee (USD) | Volume tiers |
|---|---|---|---|--:|--:|---|
| Sugar Whipped Cakes  | AU | AUD | Zone 1 | 18.00 | 11.70 |  |
| Baking My Feels | CA | CAD | Within 10 km | 15.00 | 11.10 |  |
| Baking My Feels | CA | CAD | 10–20 km | 30.00 | 22.20 |  |
| Baking My Feels | CA | CAD | 20–30 km | 45.00 | 33.30 |  |
| Baking My Feels | CA | CAD | 30–40 km | 60.00 | 44.40 |  |
| Baking My Feels | CA | CAD | 40–50 km | 75.00 | 55.50 |  |
| Cakestar | CA | CAD | Within 4 km | 6.00 | 4.44 |  |
| Cakestar | CA | CAD | 4–8 km | 12.00 | 8.88 |  |
| Cakestar | CA | CAD | 8–12 km | 18.00 | 13.32 |  |
| Cakestar | CA | CAD | 12–16 km | 24.00 | 17.76 |  |
| Cakestar | CA | CAD | 16–20 km | 30.00 | 22.20 |  |
| Cakestar | CA | CAD | 20–24 km | 36.00 | 26.64 |  |
| Cakestar | CA | CAD | 24–25 km | 37.50 | 27.75 |  |
| For The Love of Cakes | CA | CAD | Delivery area | 100.00 | 74.00 |  |
| Gold Cherry Bakery | CA | CAD | Delivery area | 15.00 | 11.10 |  |
| Irresistible Cakes | CA | CAD | Within 4 km | 4.80 | 3.55 |  |
| Irresistible Cakes | CA | CAD | 4–8 km | 9.60 | 7.10 |  |
| Irresistible Cakes | CA | CAD | 8–12 km | 14.40 | 10.66 |  |
| Irresistible Cakes | CA | CAD | 12–16 km | 19.20 | 14.21 |  |
| Irresistible Cakes | CA | CAD | 16–20 km | 24.00 | 17.76 |  |
| Irresistible Cakes | CA | CAD | 20–24 km | 28.80 | 21.31 |  |
| Irresistible Cakes | CA | CAD | 24–28 km | 33.60 | 24.86 |  |
| Irresistible Cakes | CA | CAD | 28–30 km | 36.00 | 26.64 |  |
| Just Cakes Bakeshop | CA | CAD | Surrey | 15.00 | 11.10 |  |
| Just Cakes Bakeshop | CA | CAD | Abbotsford | 30.00 | 22.20 |  |
| Just Cakes Bakeshop | CA | CAD | Van-Burn-Coquitlam | 30.00 | 22.20 |  |
| Just Cakes Bakeshop | CA | CAD | Richmond-New West | 30.00 | 22.20 |  |
| Shirinisara Pastry House | CA | CAD | Delivery area | 10.00 | 7.40 |  |
| William Lindholm | CA | CAD | Zone 1 | (none) | 0.00 |  |
| Bakery By Hermann | DK | DKK | Delivery area | 300.00 | 43.20 |  |
| Berkoparis | FR | EUR | Zone | (none) | 0.00 |  |
| Berkoparis | FR | EUR | Zone 2 | (none) | 0.00 |  |
| Cake Me Over | GB | GBP | Delivery area | 35.00 | 44.45 |  |
| GC COUTURE | GB | GBP | Delivery area | 25.00 | 31.75 |  |
| Good Cake Day | GB | GBP | Delivery area | 15.00 | 19.05 |  |
| bakerdays | GB | GBP | UK | (none) | 0.00 |  |
| bakerdays Ltd | GB | GBP | Zone 1 | (none) | 0.00 |  |
| Oh là là, Charlotte ! Patisserie | NL | EUR | Zone 1 | 10.00 | 10.80 |  |
| Holtsmark Catering | NO | NOK | Zone 1 | 0.00 | 0.00 |  |
| Creative Cakes & Events | SE | SEK | Zone 2 | 250.00 | 23.75 | 10+ → 100.00 |
| Glossy cakes | SE | SEK | Zone 2 | 295.00 | 28.03 |  |
| Aria’s Sweet Treats  | US | USD | Zone | (none) | 0.00 |  |
| Bake Me A Cake | US | USD | Zone | (none) | 0.00 |  |
| Betty Bakery | US | USD | Zone 1 | 15.00 | 15.00 |  |
| Boise Custom Cakes, LLC | US | USD | Delivery area | 30.00 | 30.00 |  |
| Cake 2 Taste | US | USD | Delivery area | (none) | 0.00 |  |
| Cake Hoopla | US | USD | Zone 1 | 25.00 | 25.00 |  |
| Cake on Sunday | US | USD | Delivery area | 15.00 | 15.00 |  |
| Caked | US | USD | Zone | (none) | 0.00 |  |
| Casa Gioia | US | USD | Delivery area | 20.00 | 20.00 |  |
| Cassie Cakes | US | USD | Within 3 mi | 15.00 | 15.00 |  |
| Cassie Cakes | US | USD | 3–6 mi | 30.00 | 30.00 |  |
| Cassie Cakes | US | USD | 6–9 mi | 45.00 | 45.00 |  |
| Cassie Cakes | US | USD | 9–12 mi | 60.00 | 60.00 |  |
| Cassie Cakes | US | USD | 12–15 mi | 75.00 | 75.00 |  |
| Cassie Cakes | US | USD | 15–18 mi | 90.00 | 90.00 |  |
| Cassie Cakes | US | USD | 18–20 mi | 100.00 | 100.00 |  |
| Cedars Cakes | US | USD | Within 5 mi | 10.00 | 10.00 |  |
| Cedars Cakes | US | USD | 5–10 mi | 20.00 | 20.00 |  |
| Cedars Cakes | US | USD | 10–15 mi | 30.00 | 30.00 |  |
| Cedars Cakes | US | USD | 15–20 mi | 40.00 | 40.00 |  |
| Cedars Cakes | US | USD | 20–25 mi | 50.00 | 50.00 |  |
| Cedars Cakes | US | USD | 25–30 mi | 60.00 | 60.00 |  |
| Cedars Cakes | US | USD | 30–35 mi | 70.00 | 70.00 |  |
| Circo's Pasty Shop | US | USD | Within 2 mi | 40.00 | 40.00 |  |
| Circo's Pasty Shop | US | USD | 2–4 mi | 80.00 | 80.00 |  |
| Circo's Pasty Shop | US | USD | 4–6 mi | 120.00 | 120.00 |  |
| Circo's Pasty Shop | US | USD | 6–8 mi | 160.00 | 160.00 |  |
| Circo's Pasty Shop | US | USD | 8–10 mi | 200.00 | 200.00 |  |
| Cocola Bakery | US | USD | Zone 1 | (none) | 0.00 |  |
| Dessert Works  | US | USD | Zone 1 | 30.00 | 30.00 |  |
| Dessert Works  | US | USD | Zone 2 | 40.00 | 40.00 |  |
| Dessert Works  | US | USD | Zone 3 | 50.00 | 50.00 |  |
| Desserts By Sara | US | USD | Zone 1 | 10.00 | 10.00 |  |
| Desserts By Sara | US | USD | Zone 2 | 20.00 | 20.00 |  |
| Desserts By Sara | US | USD | Zone 3 | 20.00 | 20.00 |  |
| DreamScape Desserts | US | USD | Within 2 mi | 4.00 | 4.00 |  |
| DreamScape Desserts | US | USD | 2–4 mi | 8.00 | 8.00 |  |
| DreamScape Desserts | US | USD | 4–6 mi | 12.00 | 12.00 |  |
| DreamScape Desserts | US | USD | 6–8 mi | 16.00 | 16.00 |  |
| DreamScape Desserts | US | USD | 8–10 mi | 20.00 | 20.00 |  |
| DreamScape Desserts | US | USD | 10–12 mi | 24.00 | 24.00 |  |
| DreamScape Desserts | US | USD | 12–14 mi | 28.00 | 28.00 |  |
| DreamScape Desserts | US | USD | 14–15 mi | 30.00 | 30.00 |  |
| Flie Cakes | US | USD | Zone 1 | 10.00 | 10.00 |  |
| Flie Cakes | US | USD | Zone 2 | 15.00 | 15.00 |  |
| Flie Cakes | US | USD | Zone 3 | 25.00 | 25.00 |  |
| Frudeco | US | USD | Zone 1 | 30.00 | 30.00 |  |
| Frudeco | US | USD | Zone 4 | 40.00 | 40.00 |  |
| Frudeco | US | USD | Zone 2 | 40.00 | 40.00 |  |
| Frudeco | US | USD | Zone 3 | 60.00 | 60.00 |  |
| Frudeco | US | USD | Zone 5 | 80.00 | 80.00 |  |
| Frudeco | US | USD | Zone 6 | 115.00 | 115.00 |  |
| Goldenrod Pastries | US | USD | Delivery area | 20.00 | 20.00 |  |
| Ideal Bakery | US | USD | Within 5 mi | 20.00 | 20.00 |  |
| Ideal Bakery | US | USD | 5–10 mi | 40.00 | 40.00 |  |
| Ideal Bakery | US | USD | 10–15 mi | 60.00 | 60.00 |  |
| Ideal Bakery | US | USD | 15–20 mi | 80.00 | 80.00 |  |
| Ideal Bakery | US | USD | 20–25 mi | 100.00 | 100.00 |  |
| Ideal Bakery | US | USD | 25–30 mi | 120.00 | 120.00 |  |
| Ideal Bakery | US | USD | 30–35 mi | 140.00 | 140.00 |  |
| Ideal Bakery | US | USD | 35–40 mi | 160.00 | 160.00 |  |
| Ivory BakerY | US | USD | Delivery area | (none) | 0.00 |  |
| Joeycakes Custom Cakes | US | USD | Zone 1 | 10.00 | 10.00 | 10+ → 5.00 |
| Katy Bakes TX | US | USD | Zone 1 | 20.00 | 20.00 |  |
| Kennedy’s Kakes | US | USD | Zone 2 | 10.00 | 10.00 |  |
| Kiki'z Passion Bakery | US | USD | Delivery area | 40.00 | 40.00 |  |
| Kiss My Cakes LLC | US | USD | Within 3 mi | 6.00 | 6.00 |  |
| Kiss My Cakes LLC | US | USD | 3–6 mi | 12.00 | 12.00 |  |
| Kiss My Cakes LLC | US | USD | 6–9 mi | 18.00 | 18.00 |  |
| Kiss My Cakes LLC | US | USD | 9–12 mi | 24.00 | 24.00 |  |
| Kiss My Cakes LLC | US | USD | 12–15 mi | 30.00 | 30.00 |  |
| Kiss My Cakes LLC | US | USD | 15–18 mi | 36.00 | 36.00 |  |
| Kiss My Cakes LLC | US | USD | 18–20 mi | 40.00 | 40.00 |  |
| La Gran Via Bakery | US | USD | Zone 1 | 5.00 | 5.00 |  |
| La Luce Pastry | US | USD | Delivery area | 35.00 | 35.00 |  |
| Les Amis Bake Shoppe | US | USD | Delivery area | (none) | 0.00 |  |
| Livie's Couture Bakeshop  | US | USD | Within 2 mi | 2.00 | 2.00 |  |
| Livie's Couture Bakeshop  | US | USD | 2–4 mi | 4.00 | 4.00 |  |
| Livie's Couture Bakeshop  | US | USD | 4–6 mi | 6.00 | 6.00 |  |
| Livie's Couture Bakeshop  | US | USD | 6–8 mi | 8.00 | 8.00 |  |
| Livie's Couture Bakeshop  | US | USD | 8–10 mi | 10.00 | 10.00 |  |
| Livie's Couture Bakeshop  | US | USD | 10–12 mi | 12.00 | 12.00 |  |
| Livie's Couture Bakeshop  | US | USD | 12–14 mi | 14.00 | 14.00 |  |
| Livie's Couture Bakeshop  | US | USD | 14–15 mi | 15.00 | 15.00 |  |
| Made With Love Cakery | US | USD | Within 5 mi | 7.50 | 7.50 |  |
| Made With Love Cakery | US | USD | 5–10 mi | 15.00 | 15.00 |  |
| Made With Love Cakery | US | USD | 10–15 mi | 22.50 | 22.50 |  |
| Made With Love Cakery | US | USD | 15–20 mi | 30.00 | 30.00 |  |
| Made With Love Cakery | US | USD | 20–25 mi | 37.50 | 37.50 |  |
| Made With Love Cakery | US | USD | 25–30 mi | 45.00 | 45.00 |  |
| Made With Love Cakery | US | USD | 30–35 mi | 52.50 | 52.50 |  |
| Made With Love Cakery | US | USD | 35–40 mi | 60.00 | 60.00 |  |
| Marie's Sweets and Treats LLC  | US | USD | Delivery area | 5.00 | 5.00 |  |
| NY Bakery and Desserts | US | USD | Zone | 5.00 | 5.00 |  |
| Not Your Grandma’s Cupcakes | US | USD | Zone 1 | 10.00 | 10.00 |  |
| Palermo Bakery | US | USD | Delivery area | 20.00 | 20.00 |  |
| Pastry is Art | US | USD | Within 5 mi | 17.50 | 17.50 |  |
| Pastry is Art | US | USD | 5–10 mi | 35.00 | 35.00 |  |
| Pastry is Art | US | USD | 10–15 mi | 52.50 | 52.50 |  |
| Pastry is Art | US | USD | 15–20 mi | 70.00 | 70.00 |  |
| Pastry is Art | US | USD | 20–25 mi | 87.50 | 87.50 |  |
| Pastry is Art | US | USD | 25–30 mi | 105.00 | 105.00 |  |
| Pastry is Art | US | USD | 30–35 mi | 122.50 | 122.50 |  |
| Piece of Cake Desserts | US | USD | Delivery area | 65.00 | 65.00 |  |
| Raleigh Cakes | US | USD | Zone 1 | 7.00 | 7.00 |  |
| Raleigh Cakes | US | USD | Zone 2 | 12.00 | 12.00 |  |
| Raleigh Cakes | US | USD | Zone 3 | 16.00 | 16.00 |  |
| Raleigh Cakes | US | USD | Zone 4 | 20.00 | 20.00 |  |
| SmallCakes Clermont  | US | USD | Zone 1 | 20.00 | 20.00 |  |
| Smallcakes Smyrna | US | USD | Delivery area | 30.00 | 30.00 |  |
| Smallcakes West Cobb Marietta | US | USD | Delivery area | 30.00 | 30.00 |  |
| Storybook Bakery | US | USD | Delivery area | 15.00 | 15.00 |  |
| Sugar Rush Cakery | US | USD | Denver Metro Area | (none) | 0.00 |  |
| SugarTown Bakery Cafe | US | USD | Delivery area | 20.00 | 20.00 |  |
| Sweet Joy by Lily | US | USD | Zone 1 | 10.00 | 10.00 |  |
| Sweet Joy by Lily | US | USD | Zone 2 | 20.00 | 20.00 |  |
| Sweet Joy by Lily | US | USD | Zone 3 | 25.00 | 25.00 |  |
| Sweet Lady Jane | US | USD | Zone 1 | 30.00 | 30.00 | 20+ → 10.00 |
| Sweet Lady Jane | US | USD | Zone 3 | 50.00 | 50.00 | 20+ → 20.00 |
| Sweet Lady Jane | US | USD | Zone 2 | 50.00 | 50.00 | 20+ → 20.00 |
| Sweet Lady Jane | US | USD | Zone 4 | 100.00 | 100.00 | 20+ → 35.00 |
| Sweet Peach Confections | US | USD | Within 4 mi | 4.00 | 4.00 |  |
| Sweet Peach Confections | US | USD | 4–8 mi | 8.00 | 8.00 |  |
| Sweet Peach Confections | US | USD | 8–12 mi | 12.00 | 12.00 |  |
| Sweet Peach Confections | US | USD | 12–16 mi | 16.00 | 16.00 |  |
| Sweet Peach Confections | US | USD | 16–20 mi | 20.00 | 20.00 |  |
| Sweet Peach Confections | US | USD | 20–24 mi | 24.00 | 24.00 |  |
| Sweet Peach Confections | US | USD | 24–25 mi | 25.00 | 25.00 |  |
| The Irving Bakery | US | USD | Delivery area | 10.00 | 10.00 |  |
| palisadespark bakery | US | USD | Zone 2 | 5.00 | 5.00 |  |
| palisadespark bakery | US | USD | Zone 1 | 5.00 | 5.00 |  |
