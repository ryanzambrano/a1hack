# Build contract — shared rules for every variant page

Every page in every variant builds against THIS document. It defines the API,
the cart format, page URLs and shared conventions. Pages that follow it are
interchangeable across variants, which is the point of the exercise.

## Pages and files (per variant, in `bakery-platform/variant-<x>/`)

| Page | File | Job |
|------|------|-----|
| Storefront | `index.html` | Browse products by category, link to product pages |
| Product | `product.html?id=<id>` | Configure options + cake text, add to cart |
| Cart + checkout | `cart.html` and `checkout.html` | Adjust quantities; customer info, pickup date/slot, mock payment |
| Confirmation | `checkout.html?order=<id>` | Fetch the order and show the receipt |
| Admin | `admin.html` | Order board (status stepping) + product create/edit/deactivate |

Each page loads `./styles/theme.css` FIRST (already written, do not edit),
then its own stylesheet from `./styles/`, and its script from `./scripts/`
(plain ES modules, `<script type="module">`). No frameworks, no CDN imports,
no build step. Relative links between pages (`./product.html?id=3`). Product
images come from the API as absolute paths (`/img/blotkake.svg`).

The server runs at `http://localhost:4600`; pages are served from
`/variant-<x>/...` so `fetch("/api/...")` works as-is.

## Money and language

- All prices are integer øre. Display as whole kroner: `kr 490` (Norwegian
  style, no decimals; if øre ever non-zero show `kr 490,50`). Helper:

```js
export function formatKr(cents) {
  const kr = cents / 100;
  return "kr " + (Number.isInteger(kr) ? kr : kr.toFixed(2).replace(".", ","));
}
```

- ALL user-facing copy is Norwegian bokmål. Code and comments in English.
- Never use em-dashes in copy. Prices include VAT; where a total is shown add
  the quiet note "inkl. mva".

## API reference

### GET /api/shop
```json
{ "bakery": { "id": 1, "slug": "bakeriet-pa-hjornet", "name": "Bakeriet på Hjørnet",
    "description": "...", "address": "Storgata 14, 2000 Lillestrøm",
    "phone": "+47 63 80 12 34", "email": "post@bakeriethjornet.no",
    "currency": "NOK", "orderCutoffHour": 12, "openHour": 8, "closeHour": 16,
    "closedWeekdays": [0] },
  "pickupSlots": ["08:00-09:00", "...", "15:00-16:00"] }
```

### GET /api/products
`{ "products": [Product, ...] }` - active products, sorted. Product:
```json
{ "id": 2, "bakeryId": 1, "name": "Sjokoladekake", "description": "...", "category": "Kaker",
  "imageUrl": "/img/sjokoladekake.svg", "basePriceCents": 49000,
  "leadTimeDays": 2, "canHaveCakeText": true, "cakeTextPriceCents": 8000,
  "active": true, "sortOrder": 2,
  "optionGroups": [
    { "name": "Størrelse", "options": [
        { "id": 7, "value": "8 biter", "priceDeltaCents": 0, "isDefault": true },
        { "id": 8, "value": "12 biter", "priceDeltaCents": 20000, "isDefault": false } ] },
    { "name": "Fyll", "options": [ ... ] } ] }
```
Display price for an option = `basePriceCents + priceDeltaCents` shown as an
absolute (e.g. "12 biter - kr 690"), the Norwegian shop convention. Product
cards show "fra kr 490" (base price). Unit price = base + sum of selected
deltas + `cakeTextPriceCents` if cake text is filled in.

Categories in the seed: `Kaker`, `Bakst`, `Brød` (render tabs/sections from
the data, do not hardcode the list).

### GET /api/products/:id
`{ "product": Product }` - 404 `{ "error": "Produktet finnes ikke" }`.

### GET /api/pickup-options?products=2,9
Comma-separated product ids of the cart. Returns the pickup constraints under
the strictest lead time in the cart:
```json
{ "earliestDate": "2026-07-24", "maxLeadTimeDays": 2,
  "closedWeekdays": [0], "slots": ["08:00-09:00", "..."] }
```
Use it to constrain the date input (`min` attribute + reject closed weekdays,
0 = Sunday) and to render the slot select. Re-fetch when the cart changes.
Returns 400 `{ "error": "Ukjent produkt i kurven" }` if any id is unknown or
deactivated - drop stale cart lines (products missing from `/api/products`)
BEFORE calling it.

### POST /api/orders
```json
{ "customer": { "name": "Kari Nordmann", "phone": "41234567", "email": "kari@example.com" },
  "pickupDate": "2026-07-24", "pickupSlot": "10:00-11:00",
  "note": "optional free text",
  "lines": [ { "productId": 2, "qty": 1, "optionIds": [8, 12], "cakeText": "Grattis Ola" },
             { "productId": 9, "qty": 3 } ] }
```
- 201 → `{ "order": Order }`. 400/402 → `{ "error": "norsk feilmelding" }` -
  show that message to the user.
- The server recomputes all prices; never send price fields.
- Payment is mocked server-side and always succeeds: the order returns
  `paymentStatus: "demo_paid"`. The checkout page must still present a clear
  payment step (a "Betal med Vipps / kort (demo)" button) and mark the result
  as demo: show "Demobetaling gjennomført" on the confirmation.

Order shape (for the request above; note BOTH lines come back, and every
option group appears in a line's `options` because the server fills in the
default option for any group not covered by `optionIds`):
```json
{ "id": 1, "orderNumber": "B-1001", "status": "new",
  "customer": { "name": "...", "phone": "...", "email": "..." },
  "pickupDate": "2026-07-24", "pickupSlot": "10:00-11:00", "note": "",
  "totalCents": 89600, "paymentProvider": "mock",
  "paymentStatus": "demo_paid", "paymentReference": "DEMO-100001-89600",
  "createdAt": "2026-07-21 14:02:11",
  "lines": [ { "id": 1, "productId": 2, "productName": "Sjokoladekake", "qty": 1,
      "unitPriceCents": 77000, "lineTotalCents": 77000,
      "options": [ { "id": 8, "group": "Størrelse", "value": "12 biter", "priceDeltaCents": 20000 },
                   { "id": 12, "group": "Fyll", "value": "Oreokrem", "priceDeltaCents": 0 } ],
      "cakeText": "Grattis Ola" },
    { "id": 2, "productId": 9, "productName": "Croissant", "qty": 3,
      "unitPriceCents": 4200, "lineTotalCents": 12600,
      "options": [], "cakeText": "" } ] }
```

### Server-side limits (mirror them in the UI)

- `cakeText`: max 60 chars (`maxlength="60"`), only when the product allows it
- `qty`: integer 1-50 per line; max 30 lines per order
- `note`: truncated at 500 chars
- `pickupDate`: at most 60 days ahead (set the date input's `max` too)
- Admin `leadTimeDays`: 0-30

### GET /api/orders/:id
`{ "order": Order }` - used by the confirmation view.

### Admin endpoints (no auth in the MVP)

- `GET /api/admin/orders` → `{ "orders": [Order...], "statuses": [...] }`.
  Optional `?status=new`. Sorted by pickup date (the production-list order).
- `PATCH /api/admin/orders/:id` body `{ "status": "confirmed" }` → `{ "order": ... }`.
  Legal transitions: new→confirmed→ready→picked_up, and any non-terminal
  →cancelled. Illegal moves return 400 with a message; disable those buttons.
- `GET /api/admin/products` → `{ "products": [...] }` including inactive.
- `POST /api/admin/products` / `PATCH /api/admin/products/:id` body (all
  fields optional on PATCH):
```json
{ "name": "Eplekake", "description": "...", "category": "Kaker",
  "imageUrl": "/img/blotkake.svg", "basePriceCents": 39000, "leadTimeDays": 1,
  "canHaveCakeText": false, "cakeTextPriceCents": 0, "active": true,
  "sortOrder": 11,
  "options": [ { "groupName": "Størrelse", "valueName": "8 personer",
                 "priceDeltaCents": 0, "isDefault": true } ] }
```
  `options`, when present, REPLACES the product's whole option list.
  Deactivate = `PATCH { "active": false }`. There is no delete.
  Both return `{ "product": Product }` (201 on create, 200 on update).
  `name` and `basePriceCents` are required on POST; 400/404 errors use the
  standard `{ "error": "..." }` shape.

## Cart contract (localStorage, shared by all variants)

Key `bakeri_cart_v1`. Value:
```json
{ "lines": [ { "productId": 2, "qty": 1, "optionIds": [8, 12], "cakeText": "Grattis Ola" } ] }
```
- References only - NO prices, names or images in the cart. Every page
  resolves display data from `/api/products` on load; drop lines whose
  product no longer exists.
- Two lines with the same productId but different optionIds/cakeText are
  separate lines. Adding an identical configuration increments qty.
- `cakeText` only when the product allows it; omit or `""` otherwise.
- After a successful order, clear the cart, then navigate to
  `./checkout.html?order=<id>`.

Suggested helpers (copy into your script):
```js
const CART_KEY = "bakeri_cart_v1";
export function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || { lines: [] }; }
  catch { return { lines: [] }; }
}
export function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
export function cartCount(cart) { return cart.lines.reduce((n, l) => n + l.qty, 0); }
```
Show a cart badge (item count) in the page header; every page links to
`./cart.html`.

## Status labels (Norwegian, use everywhere)

| value | label | badge tone |
|-------|-------|-----------|
| new | Ny | accent |
| confirmed | Bekreftet | accent |
| ready | Klar til henting | ok/green |
| picked_up | Hentet | muted |
| cancelled | Kansellert | warn/red |

## Shared behaviors

- Mobile-first: usable at 360px wide; test your layout mentally at phone
  width first, then widen.
- Handle fetch failures with a friendly Norwegian message and a retry, never
  a blank page. Show an empty-cart / no-orders state with a link back.
- Escape user-entered text when injecting into HTML (use textContent or an
  escapeHtml helper); order data contains free text.
- Basic transitions only (hover, focus); no animation libraries.
- Accessibility basics: labels on inputs, buttons are `<button>`, alt text on
  product images (product name), focus styles visible.
