# Step 0 research — how bakery ordering platforms actually work

Four parallel research passes were run before any code was written:
cakeiteasy.no + its merchant platform foodspace.no (live public API inspected),
garcon.no (a real single-bakery WooCommerce shop, page source + public Store
API inspected), a comparative pass over other Norwegian bakery shops (Baker
Hansen, W.B. Samson, Valaker, Baker Brun, Bakehuset's grocery white-labels),
and a generic pass over bakery/pre-order systems worldwide (Shopify+Zapiet,
Wix Restaurant Orders, Square Online, Bakeronline.be, BakeSmart, Bakesy,
OrderNova). Full structured findings live in the workflow transcript; this
file is the distilled summary that shaped our domain model.

Note on method: research was read-only page/API inspection, with one
exception - the garcon.no pass created a temporary anonymous cart via the
public WooCommerce Store API to expose the checkout form, then emptied it.
No order was submitted and no customer data or payment was ever entered.

## The systems studied, in one line each

- **cakeiteasy.no / Foodspace**: marketplace + white-label shops for ~700
  Nordic bakeries; the richest data model (per-size option sets, per-weekday
  deadlines, outlet slot calendars, capacity caps).
- **garcon.no**: one Lillestrøm bakery on WooCommerce; size variants +
  addon-form options, lead time enforced as cart-conditional checkout date
  fields (cakes 3 days, buns same-day), two pickup locations with separate
  calendars.
- **Baker Hansen / W.B. Samson / Bakehuset shops**: same shape on WooCommerce,
  Magento and custom stacks: sizes in persons, paid inscription, noon cutoff
  the day before, pickup at outlet or zone-limited delivery.
- **Global systems**: confirm the same core, and supply the canonical order
  lifecycles (Square: PROPOSED->RESERVED->PREPARED->COMPLETED; Wix:
  New->Accepted->Ready->Fulfilled).

## The 10 core concepts every system shares

1. **Merchant -> products -> variants/options -> cart -> order -> pickup
   window.** Universal skeleton; single-bakery shops just skip the
   "choose merchant" step.
2. **Size is THE price-bearing variant, expressed in persons/pieces.** Every
   Norwegian site prices cakes per size with an absolute price (8 biter kr
   490, 12 biter kr 690 ...), shown as "fra kr X" on product cards. Sizes can
   change shape (round -> sheet) at the big end.
3. **Option groups are separate from sizes**: single-select groups (filling,
   decoration theme, marzipan color) whose choices are free or carry a small
   surcharge; multi-select exists but is rare. Defaults are marked.
4. **Text on the cake is a paid add-on with rules** (kr 75-199, only letters
   and digits, max length can depend on size, hand-piped by the bakery).
   Photo-on-cake is the same pattern at a higher price; both are per-line
   free-input fields, not variants.
5. **Lead time is day-granular with a cutoff clock, not slot logistics**: the
   Norwegian norm is "order before 12:00 the day before", cakes need 1-3
   days, everyday bakes are same-day/next-day. Weekends collapse (Monday
   pickup = order by Friday noon). The strictest item in the cart governs the
   whole order (verified in Zapiet's docs and garcon's cart-conditional date
   fields).
6. **Pickup-first fulfillment**: choose location -> date (calendar filtered
   by lead time and closed days) -> a coarse time window (typically 1 hour,
   derived from opening hours). Delivery is a secondary mode gated by postal
   code with a flat fee; grocery white-labels even skip payment online.
7. **Full prepayment at order** (Vipps + card is the Norwegian baseline;
   Klarna/invoice for B2B). The automatic confirmation email IS the binding
   agreement; prepaid platforms have no merchant-accept step. Cancellation
   windows mirror lead times (e.g. 2 business days).
8. **Order lifecycle is a 4-step board plus cancel**: new/paid -> confirmed ->
   ready -> picked_up, terminal cancelled. Merchants work from a list of
   orders grouped by pickup date - which doubles as the daily production
   list ("what do I bake tomorrow morning?").
9. **Server-side validation of required options at add-to-cart/order time**,
   never just in JS (garcon's API literally rejects an add-to-cart missing a
   required option; prices are recomputed server-side everywhere).
10. **Prices include 15% food VAT**; allergen declaration per product is
    standard in the EU market.

## What belongs in our MVP vs later

**MVP (built now):** one bakery record (with opening hours, cutoff hour,
closed weekdays); products with category, image, description, active flag and
per-product lead-time days; single-select option groups with price deltas
(sizes displayed as absolute prices); a paid text-on-cake add-on on cake
products; localStorage cart; pickup date picker driven by the
strictest-item-in-cart rule + cutoff + closed days; hourly pickup windows
from opening hours; full mock prepayment; order with frozen line snapshots;
status board new -> confirmed -> ready -> picked_up (+ cancelled); admin
order list filterable by status (sorted by pickup date = production list) and
product create/edit/deactivate.

**Later (deliberately skipped, but the model does not block them):**
multi-bakery marketplace (every row already has bakery_id), real payments
(provider interface exists), delivery zones/fees, photo-on-cake uploads,
allergen structures, per-slot capacity caps, per-weekday deadline tables,
seasonal availability, B2B/invoice, deposits/quotes, order modification with
recalculation, notifications, customer accounts.

## Direct influences on our build

- Sizes and options both live in one `product_options` table (group + value +
  price delta + default), the smallest model that renders every observed
  configurator; the storefront displays size prices as absolutes
  (base + delta) like every Norwegian shop does.
- `lead_time_days` per product + `order_cutoff_hour` + `closed_weekdays` on
  the bakery, combined with a max-over-cart rule, reproduces the observed
  behavior of cakeiteasy, garcon, Baker Hansen and Bakehuset with three
  fields.
- Text-on-cake is `can_have_cake_text` + `cake_text_price_cents` on the
  product and a `cake_text` string on the order line, priced like Baker
  Hansen (+95) / garcon (+80).
- The admin "orders by pickup date, stepping through statuses" view is the
  production-list pattern every merchant system converges on.
- Statuses: `new`, `confirmed`, `ready`, `picked_up`, `cancelled` - the
  common denominator of Square's and Wix's lifecycles, with `new` meaning
  paid (prepaid platforms auto-confirm payment, not fulfillment).
