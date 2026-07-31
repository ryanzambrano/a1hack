# Decision log — bakery-platform

Every significant decision made during the autonomous build, in order. Written
so the reviewer can audit choices without replaying the whole process.

## D1. Docs live inside `bakery-platform/docs/`, not repo-root `docs/`
The brief says "all code lives in a completely separate top-level folder" and
the folder must be self-contained. A repo-root `docs/` would leak into the
host repository, so `research.md`, `decisions.md` and `variants.md` live in
`bakery-platform/docs/`.

## D2. Stack: Node.js + Express + built-in `node:sqlite`, vanilla front end
The brief suggests "e.g. Next.js/React + TypeScript + ORM" but asks for few
moving parts above architectural purity. Chosen instead:

- **Express 5 + Node's built-in `node:sqlite`** (available in Node >= 22.5,
  verified working on this machine, Node 25). Zero native dependencies, zero
  ORM, one runtime dependency total (`express`). The DB is a single file.
- **Vanilla HTML/CSS/JS front ends, no build step.** Five independent variants
  x four pages each are being authored in parallel by 20 agents; with plain
  static pages a broken page cannot break a build shared with 19 others, and
  cherry-picking pages across variants at assembly time is file copying, not
  refactoring. This also matches the maintaining team's existing skill set
  (their production app is static HTML/JS + serverless).
- **Plain JS with JSDoc, not TypeScript**: removes the compiler/build moving
  part entirely. The server core is ~500 lines; JSDoc keeps editor
  intellisense. Swapping to TS later is mechanical if the team wants it.
- **Tests via built-in `node:test`**: no test-runner dependency.

Trade-off accepted: no React means slightly more manual DOM code in the admin
page. For a 4-page MVP that is cheaper than owning a build pipeline.

## D3. One server, five variant folders, shared API
The five variants are five independent FRONT ENDS over one shared server +
database (`server.js`, `lib/`). Rationale: the brief requires all variants to
build against the same locked domain model and seed data so pages are
interchangeable; sharing the actual API (not five copies of it) makes that
guarantee structural instead of aspirational. Variants own everything above
the API line: their pages, scripts and styles. Teams did not share any page
code with each other.

## D4. Team styling seeded up front via `DESIGN.md` + `theme.css` per variant
Within a team, 4 agents build 4 pages in parallel and cannot coordinate
mid-flight. Each team therefore gets a pre-written design brief and a theme
stylesheet (CSS custom properties + base elements) that all four pages load
first. Directions: A warm/rustic "Håndverk", B stark minimal "Stram",
C editorial "Tidsskrift", D playful "Lekent", E classic Nordic "Nordisk".

## D5. All UI copy in Norwegian bokmål, code and comments in English
The brief requires Norwegian customer-facing copy. The admin page is also in
Norwegian: its user is the (Norwegian) bakery, not a developer. No em-dashes
in any copy.

## D6. Cart lives in localStorage under a single global contract
Key `bakeri_cart_v1`, value `{ lines: [{ productId, qty, optionIds, cakeText }] }`.
The cart stores REFERENCES only, never prices; every page re-resolves prices
from `/api/products` and the server re-computes all prices at order time from
the DB. One global key (not per-variant) because all variants sell the same
seeded products against the same API, and cross-variant page assembly (the
whole point of the exercise) requires one contract anyway.

## D7. Payment is a provider interface with a mock implementation
`lib/payments.js` exposes `getPaymentProvider()` returning
`{ name, charge(order) -> { ok, reference } }`. The MVP wires in
`MockPaymentProvider` which always succeeds with a `DEMO-...` reference; the
order row records `payment_provider = "mock"` and `payment_status =
"demo_paid"`. Swapping in Vipps/Stripe later means implementing `charge` (and
its async confirmation flow) behind the same call site in the order handler.

## D8b. Research-driven model choices (added after Step 0)
- Sizes are option-group rows with price DELTAS in the DB but displayed as
  ABSOLUTE prices (base + delta), reconciling the spec's tiny
  Bakery/Product/ProductOption/Order/OrderLine model with the absolute
  per-size pricing every Norwegian shop shows.
- Text-on-cake became a first-class product flag (`can_have_cake_text` +
  price) rather than a generic option, mirroring garcon (+80), Baker Hansen
  (+95) and cakeiteasy (85-199); it is a per-line free-text input, priced.
- Lead time is day-granular (`lead_time_days` per product) + a bakery cutoff
  hour + closed weekdays, with max-over-cart at checkout - the observed
  Norwegian norm - instead of slot-capacity logistics (skipped as advanced).
- Statuses `new/confirmed/ready/picked_up/cancelled`: the common denominator
  of Square's and Wix's lifecycles; `new` means paid.
- Order numbers are `B-<1000+id>`: human-friendly for phone calls, no
  sequence table needed.

## D9. Final assembly: adapted to daymaker.com, systematic not playful
Instead of cherry-picking variant winners, the reviewer redirected the
assembly: adapt the canonical app to daymaker.com's design language, tuned
"systemaktig" rather than playful. Executed in `app/`:
- Tokens extracted from the host repo's front ends (apps/customer, bakery,
  admin): white paper, ink #0A0A0A, hot pink #FF2D2D as a signal color,
  muted #6B6358, hairline rgba(10,10,10,0.12); fonts Inter (UI), Bricolage
  Grotesque (titles), Fraunces (prices/numerals) loaded like daymaker.com.
- Deliberately dropped Daymaker's playful layer: Caveat script, rotated
  elements, hard offset shadows, pulsing dots, background orbs. Flat 1px
  hairline surfaces, no shadows, transitions capped at 120ms.
- Page bases: variant-e for storefront/product/cart/checkout (the most
  sober structure), variant-b for admin (the densest); JS logic and the
  API/cart contract carried over unchanged.
- Customer-facing copy stays Norwegian bokmål: the reviewer asked only for
  a style change, and Norwegian was an explicit project requirement. (The
  host repo's English-only rule applies to Daymaker's own surfaces.)
- Variants A-E are kept in the repo for reference; the hub links the
  canonical app first.

## D10. Order system = the vendored Daymaker bakery dashboard (same code)
Per direction, the platform's order system IS Daymaker's bakery dashboard,
identical and the same code, just in a different place. Approach:
- **Vendored verbatim** into `daymaker/`: `bakery.html`, the
  `bakery-assignment` detail page, every `assignment/*` module, `bakery-ui.js`,
  the dashboard CSS/token files, `auth.js`, `api.js`, and the brand assets -
  byte-for-byte. The server serves them at their ORIGINAL absolute paths
  (`/scripts`, `/styles`, `/apps/bakery`, `/brand`, `/assets`) so not one line
  of the dashboard changes. The backend is adapted to the frontend, never the
  reverse.
- **No Clerk**: the vendored `auth.js` already has a `dev_auto_auth` branch.
  The platform's `/api/v1/config` returns `{ dev_auto_auth: true }`, so the
  unmodified auth.js skips Clerk entirely. `/scripts/posthog.js` is a no-op
  stub so nothing phones home. So even auth.js stays byte-identical.
- **Adapter** (`lib/daymaker-adapter.js`) speaks the exact Daymaker API the
  dashboard expects and maps each platform order into an "assignment"
  (snake_case; list returns scalar `cake_count`, detail returns the roster;
  money is `payout_local_cents` in NOK). Endpoints: `me`, `payouts`,
  `assignments` (list + detail), `complete`, `delivery-date`, `photo`,
  `mark-unsuccessful`. A platform order is one pickup, so it maps to the
  dashboard's legacy single-fulfilment path (empty `cake_items`, two
  order-level photos).
- **Status mapping**: platform `new`->`accepted`, `confirmed`->`in_production`,
  `ready`->`ready`, `picked_up`->`delivered`, `cancelled`->`cancelled`. A paid
  order maps to `accepted` (not `pending`) because the dashboard's Done button
  only enables for completable states. Marking complete in the dashboard walks
  the platform order to `picked_up`, keeping both admins in sync.
- **Stubbed** (per the chosen "queue + detail" scope): chat, blob uploads and
  PDF preview are no-op modules; the customer chat never mounts for these
  `manual`-source orders anyway. The VC queue stays dormant (`is_vc_bakery`
  false). Photos upload as inline base64 data URLs stored in a new
  `orders.assignment_state` JSON column, so the platform's core order model is
  untouched.
- **Placement**: served at `/app/bakery` (+ detail `/bakery/assignments/:id`).
  The product admin (`app/admin.html`) keeps its Produkter tab; its
  Bestillinger tab now opens the dashboard.

## D8. No auth on the admin routes in the MVP
Customer accounts and login are explicitly out of scope. The admin page and
`/api/admin/*` are unauthenticated; the README flags this as the first thing
to add before any real deployment. Kept out deliberately rather than building
a fake login that real auth would replace anyway.
