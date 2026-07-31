# bakery-platform

A minimal e-commerce platform for bakeries: product catalog, customer
storefront, cart + mock checkout with pickup-date rules, and a small order/
product admin. Built as **five independent front-end variants over one shared
core**, so the best pages can be cherry-picked into the final app.

Customer-facing language is Norwegian; code and docs are English.

## Run it

Requires Node.js >= 22.5 (uses the built-in `node:sqlite`; no native deps).

```bash
cd bakery-platform
npm install        # or pnpm install - installs express, the only dependency
npm run dev        # http://localhost:4600
```

The SQLite database (`data/bakery.sqlite`) is created and seeded with the
demo bakery + 10 products on first boot. `npm run seed` wipes and reseeds.
`npm test` runs the critical-path tests (price calculation with options,
pickup-date rules, creating orders from a cart).

Open http://localhost:4600 for the hub. **The canonical app lives at
`/app`**: the final assembly adapted to daymaker.com's design language
(white/ink/pink, Inter + Bricolage Grotesque + Fraunces) rendered systematic
and flat, without the playful layer. The five exploration variants remain for
reference:

- `/variant-a` "Håndverk" (warm rustic) ... `/variant-e` "Nordisk" (classic
  Nordic) - each has `index.html` (storefront), `product.html`, `cart.html` +
  `checkout.html`, and `admin.html`.

## Stack, and why

- **Node + Express 5 + built-in `node:sqlite`.** One runtime dependency
  total. No ORM: the schema is 5 tables and raw SQL keeps the whole data
  layer readable in one file. The DB is a single file; swapping to Postgres
  later is a data-layer change, not an architecture change.
- **Vanilla HTML/CSS/JS front ends, no build step.** The five variants are
  static pages against the same JSON API; a broken page can never break a
  shared build, and assembling the final app from winning pages is file
  copying. (This also matches how the team's existing production app is
  built.)
- **Plain JS with JSDoc over TypeScript**: removes the compile step; the
  server core is ~600 lines. Mechanical to convert later if wanted.
- Tests use the built-in `node:test` runner.

Full decision log: [docs/decisions.md](docs/decisions.md). Step 0 research
that shaped the model: [docs/research.md](docs/research.md). The API/cart
contract all variants build against: [docs/contract.md](docs/contract.md).

## Domain model

```
Bakery 1 ──< Product 1 ──< ProductOption     (group_name + value_name + price delta)
   │
   └──< Order 1 ──< OrderLine                (frozen snapshots of name/price/options)
```

- **Bakery**: name/contact plus fulfillment rules: `order_cutoff_hour`,
  `open_hour`/`close_hour` (pickup windows), `closed_weekdays`. Every product
  and order carries `bakery_id`, so multi-tenancy is additive later.
- **Product**: name, description, category, image, `base_price_cents`,
  `lead_time_days` (0 = same day), `can_have_cake_text` +
  `cake_text_price_cents` (the paid inscription add-on every Norwegian cake
  shop has), `active` flag (deactivate, never delete), `sort_order`.
- **ProductOption**: one row per selectable value; rows sharing `group_name`
  form a single-select group ("Størrelse", "Fyll"). Sizes are a group like
  any other; the UI shows base+delta as absolute prices ("12 biter - kr 690").
- **Order**: customer contact, `pickup_date` + `pickup_slot`, status
  (`new → confirmed → ready → picked_up`, plus `cancelled`), total, payment
  fields. `new` means paid - prepaid shops auto-confirm payment, not
  fulfillment.
- **OrderLine**: frozen snapshot (product name, unit price, chosen options as
  JSON, cake text) so catalog edits never rewrite order history.

Money is integer øre, VAT included (15% food VAT, Norwegian convention).

### Pickup rules (from research)

Earliest pickup = today + the strictest `lead_time_days` in the cart, +1 day
if ordering after the bakery's cutoff hour, skipping closed weekdays. Slots
are hourly windows from opening hours. Validated server-side on every order;
`GET /api/pickup-options?products=...` exposes the same rule to the UI.

### Payments

`lib/payments.js` defines the provider interface (`charge() -> {ok,
reference, status}`); the MVP wires a mock that always succeeds and stamps
orders `payment_status = "demo_paid"`. A real provider (Vipps ePayment,
Stripe) implements the same interface behind `getPaymentProvider()`; its
async confirmation flow slots in at the single call site in
`lib/domain.js#createOrder`.

## Layout

```
server.js            express app: /api + static app + variants
lib/                 db bootstrap, schema.sql, seed, domain logic, payments, api routes
test/                node:test critical-path tests
scripts/             e2e-browser.cjs: full Playwright flow per surface + screenshots
app/                 THE canonical app (Daymaker System design)
public/              comparison hub (index.html) + shared product images (img/*.svg)
variant-a ... -e/    the five exploration variants (DESIGN.md + theme.css each)
docs/                research.md, contract.md, decisions.md, variants.md, shots/
```

The browser e2e (`node scripts/e2e-browser.cjs`, needs `playwright` installed
separately; `ONLY=app` limits the run) walks every surface end to end on a
390px viewport and captures the screenshots in `docs/shots/`.

## Honest limitations (MVP)

- **Admin routes have no auth** - add auth before any real deployment.
- `GET /api/orders/:id` is unauthenticated and ids are sequential, so a
  guessed id exposes a customer's name/phone/email. Replace with an opaque
  token before any real deployment.
- Payment is a mock; orders are marked demo-paid.
- One bakery seeded; no delivery, no notifications, no customer accounts -
  see docs/research.md for the deliberate MVP boundary.
