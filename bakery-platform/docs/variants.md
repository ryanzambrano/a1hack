# Variant comparison

Five teams built the same four pages (storefront, product, cart + checkout,
admin) against the same API, seed data and cart contract, each in a distinct
design direction. Pages are interchangeable across variants: pick the winner
per page and they will work together.

**How to review:** `npm run dev`, open http://localhost:4600/ and click
through each variant; the hub also shows screenshot strips. On a phone-sized
window, run the flow the customer runs: browse, open Sjokoladekake, pick
12 biter + cake text, add to cart, check out with the demo payment, then
open that variant's admin to see the order arrive.

**Verified:** every variant passed a real-browser end-to-end run (Playwright,
390px viewport): browse -> configure (size + fill + cake text) -> cart ->
checkout -> demo payment -> confirmation with order number -> order visible
in admin. Orders B-1001 through B-1005 in the demo DB are those runs. All
scripts pass `node --check`; two independent review agents per variant
(functional + design/copy) had their findings fixed and re-verified.

Screenshots per variant sit in `docs/shots/variant-<x>/`
({storefront,product,cart,checkout,confirmation}.jpg at 390px,
admin.jpg at 1280px).

---

## Variant A - Håndverk (warm rustic)

Cream paper background, espresso text, terracotta accent, serif headings.
Feels like a neighborhood craft bakery; the voice is warm ("Velkommen inn!",
"Vi gleder oss til å bake for deg").

- **Storefront**: hero card with pickup info as a small directory
  (Hentested / Åpningstider / Bestillingsfrist), serif category pills,
  rounded product cards with green same-day badges.
- **Product**: radio pill cards for options, absolute serif prices, live
  total with "N stk à kr Y" note, warm success panel after adding.
- **Cart/checkout**: parchment-style summary, dashed dividers, dark espresso
  footer on every page.
- **Admin**: light take on the theme with filter pills and per-status counts;
  cake text highlighted for the baker.

## Variant B - Stram (stark minimal)

White, near-black, hairline rules, square corners, one signal red. Uppercase
micro-labels do the structure; prices are bold tabular numerals right-aligned.
Copy is short and factual, no exclamation marks ("Legg i kurv", "Bestill før
kl 12. Senere bestillinger telles fra neste dag.").

- **Storefront**: category count nav (KAKER 5 / BAKST 4 / BRØD 1), list-like
  cards with tiny thumbs, FRA + price right column.
- **Product**: engineered form feel; boxed cart badge in the header.
- **Cart/checkout**: table-like lines, joined hairline quantity stepper.
- **Admin**: the most spreadsheet-like of the five; dense rows, uppercase
  column labels.

## Variant C - Tidsskrift (editorial)

Paper-white, big serif headlines, bordeaux accent, thin rules, numbered
sections (NR. 01 Kaker) and dotted leader lines between name and price, like
a magazine menu. Calm literate voice ("Fra ovnen").

- **Storefront**: centered serif masthead, key facts as a leader-dot list,
  menu-style product list rather than a card grid.
- **Product**: reads like a feature spread; options as typographic lists.
- **Cart/checkout**: receipt-like typography, bordeaux primary button.
- **Admin**: editorial restraint kept but denser; kickers as section labels.

## Variant D - Lekent (playful)

Blush background, white cards with 20px corners, raspberry accent, mint
selected states, chunky pill buttons, gentle hover lifts. Friendly voice with
the occasional exclamation ("Mmm, godt valg!").

- **Storefront**: floating pill header with dot logo and solid raspberry cart
  button.
- **Product**: the most tactile configurator: rounded option cards with
  prices, mint highlight on selection, pink-bordered cake-text field.
- **Cart/checkout**: soft cards, big rounded inputs, colored shadows.
- **Admin**: playful tones toned down to stay a working tool; mint/raspberry
  status badges.

## Variant E - Nordisk (classic Nordic)

Cool gray background, crisp white cards, fjord-blue accent, 8px corners,
sober plain-spoken copy without exclamations ("Velg hentedag",
"Bestillingen er bekreftet"). Vipps-era public-service calm.

- **Storefront**: quiet card grid, blue links, semantic status pills.
- **Product**: clean form hierarchy, blue focus rings.
- **Cart/checkout**: numbered steps (1. Kontakt, 2. Henting, 3. Betaling
  (demo)) with helper text under the date field stating earliest pickup and
  the Sunday closure - the clearest checkout of the five.
- **Admin**: the most "backoffice" of the five: neutral, functional,
  badge-driven.

---

## Outcome

Instead of per-page winners, the assembly was redirected: the canonical
`app/` adapts daymaker.com's design language (white/ink/pink, Inter,
Bricolage Grotesque, Fraunces) rendered systematic and flat, without
Daymaker's playful layer. Bases: variant E for storefront/product/cart/
checkout, variant B for admin. See docs/decisions.md D9. The `app/` surface
passed the same browser e2e as the variants (screenshots in
`docs/shots/app/`); variants A-E stay in the repo for reference.
