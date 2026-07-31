// Checkout and confirmation page for variant D "Lekent".
// Without ?order= it renders the checkout flow: compact summary, customer
// form, pickup options and a clearly marked demo payment step. With
// ?order=<id> it fetches the order and renders the receipt.
// Built against docs/contract.md.

const CART_KEY = "bakeri_cart_v1";

// Shared helpers copied from docs/contract.md
function formatKr(cents) {
  const kr = cents / 100;
  return "kr " + (Number.isInteger(kr) ? kr : kr.toFixed(2).replace(".", ","));
}
function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || { lines: [] }; }
  catch { return { lines: [] }; }
}
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
function cartCount(cart) { return cart.lines.reduce((n, l) => n + l.qty, 0); }

const MAX_QTY = 50;
const MAX_NOTE = 500;
const MAX_AHEAD_DAYS = 60;
const WEEKDAYS_PLURAL = [
  "søndager", "mandager", "tirsdager", "onsdager", "torsdager", "fredager", "lørdager"
];

const statusEl = document.getElementById("status");
const checkoutView = document.getElementById("checkout-view");
const confirmView = document.getElementById("confirmation-view");
const brandEl = document.getElementById("brand-name");
const cartLinkEl = document.getElementById("cart-link");
const badgeEl = document.getElementById("cart-badge");

const orderParam = (new URLSearchParams(location.search).get("order") || "").trim();

let bakery = null;
let productsById = new Map();
let cart = { lines: [] };
let pickup = null;
let maxDateIso = "";
let totalCents = 0;
let submitting = false;
let shopReady = Promise.resolve();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clampQty(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_QTY);
}

function normalizeCart(raw) {
  const lines = (raw && Array.isArray(raw.lines)) ? raw.lines : [];
  return {
    lines: lines
      .filter((l) => l && Number.isInteger(Number(l.productId)))
      .map((l) => ({
        productId: Number(l.productId),
        qty: clampQty(l.qty),
        optionIds: Array.isArray(l.optionIds)
          ? l.optionIds.map(Number).filter(Number.isInteger)
          : [],
        cakeText: typeof l.cakeText === "string" ? l.cakeText : ""
      }))
  };
}

function persistCart() {
  saveCart({
    lines: cart.lines.map((l) => {
      const out = { productId: l.productId, qty: l.qty };
      if (l.optionIds.length) out.optionIds = l.optionIds;
      if (l.cakeText) out.cakeText = l.cakeText;
      return out;
    })
  });
}

function updateBadge() {
  const n = cartCount(cart);
  badgeEl.hidden = n === 0;
  badgeEl.textContent = String(n);
  cartLinkEl.setAttribute("aria-label", "Handlekurv, " + n + (n === 1 ? " vare" : " varer"));
}

function applyTitle() {
  const name = bakery ? bakery.name : "Bakeriet";
  document.title = (orderParam ? "Kvittering | " : "Kasse | ") + name;
}

function renderFooter(b) {
  const card = document.getElementById("footer-card");
  if (!card || !b) return;
  card.textContent = "";
  card.appendChild(el("h2", "footer-title", "Kom innom oss!"));
  const contact = el("ul", "contact-list");
  if (b.address) {
    const li = el("li");
    li.appendChild(el("span", "contact-label", "Adresse"));
    li.appendChild(el("span", "", b.address));
    contact.appendChild(li);
  }
  if (b.phone) {
    const li = el("li");
    li.appendChild(el("span", "contact-label", "Telefon"));
    const a = el("a", "", b.phone);
    a.href = "tel:" + String(b.phone).replace(/\s+/g, "");
    li.appendChild(a);
    contact.appendChild(li);
  }
  if (b.email) {
    const li = el("li");
    li.appendChild(el("span", "contact-label", "E-post"));
    const a = el("a", "", b.email);
    a.href = "mailto:" + b.email;
    li.appendChild(a);
    contact.appendChild(li);
  }
  card.appendChild(contact);
  card.appendChild(el("p", "muted footer-note", "Alle priser er inkl. mva."));
  card.hidden = false;
}

async function fetchShop() {
  try {
    const res = await fetch("/api/shop");
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.bakery && data.bakery.name) {
      bakery = data.bakery;
      brandEl.textContent = bakery.name;
      applyTitle();
      renderFooter(bakery);
    }
  } catch {
    // Keep the static fallback name.
  }
}

function fmtDateLong(iso) {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  const s = new Intl.DateTimeFormat("nb-NO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDateShort(iso) {
  const parts = String(iso).split("-");
  return parts.length === 3 ? parts[2] + "." + parts[1] + "." + parts[0] : String(iso);
}

function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function slotText(slot) {
  const parts = String(slot).split("-");
  return parts.length === 2
    ? "Mellom kl. " + parts[0] + " og " + parts[1]
    : String(slot);
}

// Drop option ids that no longer exist on the product, and cake text the
// product no longer allows, so the shown total matches what the server
// would charge and the order payload never carries dead ids.
function sanitizeLineOptions() {
  cart.lines.forEach((l) => {
    const p = productsById.get(l.productId);
    if (!p) return;
    const valid = new Set();
    (p.optionGroups || []).forEach((g) =>
      (g.options || []).forEach((o) => valid.add(o.id))
    );
    l.optionIds = l.optionIds.filter((id) => valid.has(id));
    if (l.cakeText && !p.canHaveCakeText) l.cakeText = "";
  });
}

function unitPriceCents(line, product) {
  let cents = product.basePriceCents;
  const byId = new Map();
  (product.optionGroups || []).forEach((g) =>
    (g.options || []).forEach((o) => byId.set(o.id, o))
  );
  line.optionIds.forEach((id) => {
    const opt = byId.get(id);
    if (opt) cents += opt.priceDeltaCents;
  });
  if (line.cakeText && product.canHaveCakeText) cents += product.cakeTextPriceCents;
  return cents;
}

function optionSummary(line, product) {
  const parts = [];
  (product.optionGroups || []).forEach((g) => {
    const hit = (g.options || []).find((o) => line.optionIds.includes(o.id));
    if (hit) parts.push(g.name + ": " + hit.value);
  });
  return parts.join(" · ");
}

function showStatusText(text) {
  checkoutView.hidden = true;
  confirmView.hidden = true;
  statusEl.hidden = false;
  statusEl.textContent = text;
}

/* ------------------------- Checkout mode ------------------------- */

function showLoadError() {
  showStatusText("");
  statusEl.appendChild(el("h2", "", "Oi, noe gikk galt"));
  statusEl.appendChild(el("p", "muted",
    "Vi klarte ikke å laste kassen akkurat nå. Sjekk nettet og prøv igjen!"));
  const retry = el("button", "btn btn-primary", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", initCheckout);
  statusEl.appendChild(retry);
}

function showEmptyCart() {
  showStatusText("");
  statusEl.appendChild(el("h2", "", "Handlekurven er tom"));
  statusEl.appendChild(el("p", "muted",
    "Du må legge noe godt i kurven før du kan gå til kassen."));
  const back = el("a", "btn btn-primary", "Til butikken");
  back.href = "./index.html";
  statusEl.appendChild(back);
}

function renderSummary() {
  const wrap = document.getElementById("summary-lines");
  wrap.textContent = "";
  totalCents = 0;
  cart.lines.forEach((line) => {
    const product = productsById.get(line.productId);
    const unit = unitPriceCents(line, product);
    const lineTotal = unit * line.qty;
    totalCents += lineTotal;

    const row = el("div", "sum-line");
    const main = el("div", "sum-main");
    main.appendChild(el("p", "sum-name", line.qty + " × " + product.name));
    const opts = optionSummary(line, product);
    if (opts) main.appendChild(el("p", "sum-opts muted", opts));
    if (line.cakeText) {
      main.appendChild(el("p", "sum-cake muted", "Tekst på kaken: \"" + line.cakeText + "\""));
    }
    row.appendChild(main);
    row.appendChild(el("span", "sum-total price", formatKr(lineTotal)));
    wrap.appendChild(row);
  });
  document.getElementById("summary-total").textContent = formatKr(totalCents);
  document.getElementById("pay-btn").textContent =
    "Betal " + formatKr(totalCents) + " med Vipps eller kort (demo)";
}

function showPickupError() {
  const ps = document.getElementById("pickup-status");
  ps.hidden = false;
  ps.className = "pickup-status";
  ps.textContent = "";
  ps.appendChild(el("p", "field-error", "Vi klarte ikke å hente ledige hentetider."));
  const retry = el("button", "btn retry-small", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", loadPickup);
  ps.appendChild(retry);
}

async function loadPickup() {
  const dateInput = document.getElementById("pickup-date");
  const slotSelect = document.getElementById("pickup-slot");
  const payBtn = document.getElementById("pay-btn");
  const ps = document.getElementById("pickup-status");

  dateInput.disabled = true;
  slotSelect.disabled = true;
  payBtn.disabled = true;
  ps.hidden = false;
  ps.className = "pickup-status muted";
  ps.textContent = "Henter ledige hentetider...";

  const ids = [...new Set(cart.lines.map((l) => l.productId))].join(",");
  let res;
  try {
    res = await fetch("/api/pickup-options?products=" + encodeURIComponent(ids));
  } catch { showPickupError(); return; }
  if (!res.ok) { showPickupError(); return; }
  let data;
  try { data = await res.json(); }
  catch { showPickupError(); return; }
  if (!data || !data.earliestDate || !Array.isArray(data.slots)) {
    showPickupError();
    return;
  }

  pickup = data;
  maxDateIso = isoDaysFromNow(MAX_AHEAD_DAYS);
  dateInput.min = pickup.earliestDate;
  dateInput.max = maxDateIso;
  document.getElementById("date-hint").textContent =
    "Tidligste henting er " + fmtDateLong(pickup.earliestDate).toLowerCase() + ".";

  const prevSlot = slotSelect.value;
  slotSelect.textContent = "";
  const placeholder = el("option", "", "Velg tidspunkt");
  placeholder.value = "";
  slotSelect.appendChild(placeholder);
  pickup.slots.forEach((s) => {
    const opt = el("option", "", s);
    opt.value = s;
    slotSelect.appendChild(opt);
  });
  if (prevSlot && pickup.slots.includes(prevSlot)) slotSelect.value = prevSlot;

  ps.hidden = true;
  dateInput.disabled = false;
  slotSelect.disabled = false;
  payBtn.disabled = false;
}

function setFieldError(id, message) {
  const input = document.getElementById(id);
  const errEl = document.getElementById(id + "-error");
  if (message) {
    errEl.textContent = message;
    errEl.hidden = false;
    input.classList.add("invalid");
    input.setAttribute("aria-invalid", "true");
  } else {
    errEl.textContent = "";
    errEl.hidden = true;
    input.classList.remove("invalid");
    input.removeAttribute("aria-invalid");
  }
}

function validateName(v) {
  return v.trim().length >= 2 ? "" : "Skriv inn navnet ditt";
}
function validatePhone(v) {
  const digits = v.replace(/[\s.-]/g, "");
  return /^\+?\d{8,15}$/.test(digits)
    ? "" : "Skriv inn et gyldig telefonnummer (minst 8 siffer)";
}
function validateEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
    ? "" : "Skriv inn en gyldig e-postadresse";
}
function closedDaysText() {
  const names = (pickup && Array.isArray(pickup.closedWeekdays) ? pickup.closedWeekdays : [])
    .map((d) => WEEKDAYS_PLURAL[d])
    .filter(Boolean);
  return names.join(" og ");
}
function validateDate(v) {
  if (!v) return "Velg en hentedag";
  if (!pickup) return "";
  const day = new Date(v + "T12:00:00").getDay();
  if ((pickup.closedWeekdays || []).includes(day)) {
    return "Bakeriet holder stengt på " + closedDaysText() + ". Velg en annen dag!";
  }
  if (v < pickup.earliestDate) {
    return "Tidligste mulige hentedag er " + fmtDateShort(pickup.earliestDate);
  }
  if (maxDateIso && v > maxDateIso) {
    return "Hentedagen kan være maks " + MAX_AHEAD_DAYS + " dager frem i tid";
  }
  return "";
}
function validateSlot(v) {
  return v ? "" : "Velg et hentetidspunkt";
}

function showOrderError(message) {
  const box = document.getElementById("order-error");
  if (message) {
    box.textContent = message;
    box.hidden = false;
    box.scrollIntoView({ block: "nearest" });
  } else {
    box.textContent = "";
    box.hidden = true;
  }
}

async function submitOrder() {
  if (submitting) return;
  const nameIn = document.getElementById("name");
  const phoneIn = document.getElementById("phone");
  const emailIn = document.getElementById("email");
  const dateIn = document.getElementById("pickup-date");
  const slotIn = document.getElementById("pickup-slot");

  const checks = [
    ["name", validateName(nameIn.value)],
    ["phone", validatePhone(phoneIn.value)],
    ["email", validateEmail(emailIn.value)],
    ["pickup-date", validateDate(dateIn.value)],
    ["pickup-slot", validateSlot(slotIn.value)]
  ];
  let firstBad = null;
  checks.forEach(([id, msg]) => {
    setFieldError(id, msg);
    if (msg && !firstBad) firstBad = document.getElementById(id);
  });
  showOrderError("");
  if (firstBad) { firstBad.focus(); return; }
  if (!pickup) {
    showOrderError("Hentetidene er ikke lastet ennå. Prøv igjen om et øyeblikk.");
    return;
  }

  const payload = {
    customer: {
      name: nameIn.value.trim(),
      phone: phoneIn.value.trim(),
      email: emailIn.value.trim()
    },
    pickupDate: dateIn.value,
    pickupSlot: slotIn.value,
    lines: cart.lines.map((l) => {
      const out = { productId: l.productId, qty: l.qty };
      if (l.optionIds.length) out.optionIds = l.optionIds;
      if (l.cakeText) out.cakeText = l.cakeText;
      return out;
    })
  };
  const note = document.getElementById("note").value.trim().slice(0, MAX_NOTE);
  if (note) payload.note = note;

  const payBtn = document.getElementById("pay-btn");
  const originalLabel = payBtn.textContent;
  submitting = true;
  payBtn.disabled = true;
  payBtn.textContent = "Sender bestillingen...";
  const restore = () => {
    submitting = false;
    payBtn.disabled = false;
    payBtn.textContent = originalLabel;
  };

  let res;
  try {
    res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    restore();
    showOrderError("Vi fikk ikke sendt bestillingen. Sjekk nettet og prøv igjen!");
    return;
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (res.status === 201 && data && data.order) {
    saveCart({ lines: [] });
    location.href = "./checkout.html?order=" + encodeURIComponent(data.order.id);
    return;
  }
  restore();
  showOrderError((data && data.error)
    ? data.error
    : "Noe gikk galt med bestillingen. Prøv igjen!");
}

function wireForm() {
  const form = document.getElementById("checkout-form");
  const dateIn = document.getElementById("pickup-date");
  ["name", "phone", "email"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => setFieldError(id, ""));
  });
  dateIn.addEventListener("change", () =>
    setFieldError("pickup-date", validateDate(dateIn.value)));
  document.getElementById("pickup-slot").addEventListener("change", () =>
    setFieldError("pickup-slot", ""));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitOrder();
  });
}

async function initCheckout() {
  showStatusText("Laster kassen...");
  let res;
  try { res = await fetch("/api/products"); }
  catch { showLoadError(); return; }
  if (!res.ok) { showLoadError(); return; }
  let data;
  try { data = await res.json(); }
  catch { showLoadError(); return; }
  const products = (data && Array.isArray(data.products)) ? data.products : [];
  productsById = new Map(products.map((p) => [p.id, p]));

  cart = normalizeCart(loadCart());
  // Drop stale lines BEFORE calling /api/pickup-options (per contract).
  cart.lines = cart.lines.filter((l) => productsById.has(l.productId));
  sanitizeLineOptions();
  persistCart();
  updateBadge();

  if (!cart.lines.length) {
    showEmptyCart();
    return;
  }

  renderSummary();
  statusEl.hidden = true;
  checkoutView.hidden = false;
  loadPickup();
}

/* ----------------------- Confirmation mode ----------------------- */

function showOrderNotFound() {
  showStatusText("");
  statusEl.appendChild(el("h2", "", "Vi fant ikke denne bestillingen"));
  statusEl.appendChild(el("p", "muted",
    "Sjekk at lenken stemmer, eller ta kontakt med bakeriet."));
  const back = el("a", "btn btn-primary", "Tilbake til butikken");
  back.href = "./index.html";
  statusEl.appendChild(back);
}

function showConfirmError(id) {
  showStatusText("");
  statusEl.appendChild(el("h2", "", "Oi, noe gikk galt"));
  statusEl.appendChild(el("p", "muted",
    "Vi klarte ikke å hente kvitteringen akkurat nå. Sjekk nettet og prøv igjen!"));
  const retry = el("button", "btn btn-primary", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", () => initConfirmation(id));
  statusEl.appendChild(retry);
}

function infoLine(parent, label, value) {
  const p = el("p", "info-line");
  p.appendChild(el("span", "info-label", label + ": "));
  p.appendChild(document.createTextNode(value));
  parent.appendChild(p);
}

function renderReceipt(order) {
  statusEl.hidden = true;
  confirmView.hidden = false;
  confirmView.textContent = "";
  document.title = "Kvittering " + order.orderNumber + " | " + (bakery ? bakery.name : "Bakeriet");

  const wrap = el("div", "receipt");
  confirmView.appendChild(wrap);

  // Thank-you hero with confetti
  const hero = el("section", "card receipt-hero");
  hero.appendChild(el("h1", "", "Hurra, takk for bestillingen!"));
  hero.appendChild(el("p", "muted hero-sub",
    "Bestillingen er mottatt, og bakeriet gleder seg til å bake for deg."));
  const badges = el("div", "receipt-badges");
  badges.appendChild(el("span", "badge", "Ordrenummer " + order.orderNumber));
  badges.appendChild(el("span", "badge badge-ok", "Demobetaling gjennomført"));
  hero.appendChild(badges);
  wrap.appendChild(hero);

  // Pickup + contact side by side on wide screens
  const grid = el("div", "receipt-grid");
  wrap.appendChild(grid);

  const pickupSec = el("section", "card receipt-section");
  pickupSec.appendChild(el("h2", "", "Henting"));
  pickupSec.appendChild(el("p", "pickup-date-line", fmtDateLong(order.pickupDate)));
  pickupSec.appendChild(el("p", "info-line", slotText(order.pickupSlot)));
  if (bakery) {
    pickupSec.appendChild(el("p", "info-line bakery-name", bakery.name));
    if (bakery.address) pickupSec.appendChild(el("p", "info-line muted", bakery.address));
  }
  if (order.note) {
    pickupSec.appendChild(el("p", "info-line note-line muted", "Kommentar: \"" + order.note + "\""));
  }
  grid.appendChild(pickupSec);

  const contactSec = el("section", "card receipt-section");
  contactSec.appendChild(el("h2", "", "Kontaktinfo"));
  const c = order.customer || {};
  if (c.name) infoLine(contactSec, "Navn", c.name);
  if (c.phone) infoLine(contactSec, "Telefon", c.phone);
  if (c.email) infoLine(contactSec, "E-post", c.email);
  grid.appendChild(contactSec);

  // Order lines
  const linesSec = el("section", "card receipt-section receipt-lines");
  linesSec.appendChild(el("h2", "", "Dette har du bestilt"));
  (order.lines || []).forEach((line) => {
    const row = el("article", "receipt-line");
    const main = el("div", "rl-main");
    main.appendChild(el("p", "rl-name", line.qty + " × " + line.productName));
    const opts = (line.options || [])
      .map((o) => o.group + ": " + o.value)
      .join(" · ");
    if (opts) main.appendChild(el("p", "rl-opts muted", opts));
    if (line.cakeText) {
      main.appendChild(el("p", "rl-cake", "Tekst på kaken: \"" + line.cakeText + "\""));
    }
    if (line.qty > 1) {
      main.appendChild(el("p", "rl-unit muted", formatKr(line.unitPriceCents) + " per stk"));
    }
    row.appendChild(main);
    row.appendChild(el("span", "rl-total price", formatKr(line.lineTotalCents)));
    linesSec.appendChild(row);
  });
  const totalRow = el("div", "receipt-total");
  totalRow.appendChild(el("span", "", "Totalt"));
  totalRow.appendChild(el("span", "price", formatKr(order.totalCents)));
  linesSec.appendChild(totalRow);
  linesSec.appendChild(el("p", "receipt-vat muted", "inkl. mva"));
  wrap.appendChild(linesSec);

  // Payment
  const paySec = el("section", "card receipt-section");
  const payHead = el("div", "pay-head");
  payHead.appendChild(el("h2", "", "Betaling"));
  payHead.appendChild(el("span", "badge badge-ok", "Demobetaling gjennomført"));
  paySec.appendChild(payHead);
  if (order.paymentReference) {
    infoLine(paySec, "Betalingsreferanse", order.paymentReference);
  }
  paySec.appendChild(el("p", "info-line muted",
    "Dette er en demo. Ingen ekte betaling er gjennomført."));
  wrap.appendChild(paySec);

  // Back to the shop
  const actions = el("div", "receipt-actions");
  const back = el("a", "btn btn-primary", "Tilbake til butikken");
  back.href = "./index.html";
  actions.appendChild(back);
  wrap.appendChild(actions);
}

async function initConfirmation(id) {
  showStatusText("Henter kvitteringen...");
  let res;
  try { res = await fetch("/api/orders/" + encodeURIComponent(id)); }
  catch { showConfirmError(id); return; }
  if (res.status === 404) { showOrderNotFound(); return; }
  if (!res.ok) { showConfirmError(id); return; }
  let data;
  try { data = await res.json(); }
  catch { showConfirmError(id); return; }
  if (!data || !data.order) { showConfirmError(id); return; }
  // Wait for shop info so the receipt can show the bakery address.
  try { await shopReady; } catch { /* address is optional */ }
  renderReceipt(data.order);
}

/* ------------------------------ Init ----------------------------- */

function init() {
  cart = normalizeCart(loadCart());
  updateBadge();
  applyTitle();
  window.addEventListener("storage", (e) => {
    if (e.key !== CART_KEY) return;
    cart = normalizeCart(loadCart());
    updateBadge();
    // In checkout mode, keep the summary and pickup options in sync when
    // the cart changes in another tab (re-fetch per contract).
    if (!orderParam && !submitting && productsById.size) {
      cart.lines = cart.lines.filter((l) => productsById.has(l.productId));
      sanitizeLineOptions();
      updateBadge();
      if (!cart.lines.length) {
        showEmptyCart();
        return;
      }
      renderSummary();
      statusEl.hidden = true;
      checkoutView.hidden = false;
      loadPickup();
    }
  });
  shopReady = fetchShop();
  if (orderParam) {
    if (!/^\d+$/.test(orderParam)) { showOrderNotFound(); return; }
    initConfirmation(orderParam);
  } else {
    wireForm();
    initCheckout();
  }
}

init();
