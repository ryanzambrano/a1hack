// Checkout + confirmation page script for the app (Daymaker System).
// Without ?order= : checkout mode. With ?order=<id> : confirmation mode.

const CART_KEY = "bakeri_cart_v1";

export function formatKr(cents) {
  const kr = cents / 100;
  return "kr " + (Number.isInteger(kr) ? kr : kr.toFixed(2).replace(".", ","));
}

export function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || { lines: [] }; }
  catch { return { lines: [] }; }
}

export function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

export function cartCount(cart) { return cart.lines.reduce((n, l) => n + l.qty, 0); }

const QTY_MIN = 1;
const QTY_MAX = 50;

const WEEKDAY_NAMES = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MONTH_NAMES = ["januar", "februar", "mars", "april", "mai", "juni", "juli",
  "august", "september", "oktober", "november", "desember"];

const badge = document.getElementById("cart-badge");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function updateBadge(cart) {
  const n = cartCount(cart);
  badge.textContent = String(n);
  badge.hidden = n === 0;
  const link = document.getElementById("cart-link");
  if (link) {
    if (n === 0) link.setAttribute("aria-label", "Kurv, tom");
    else if (n === 1) link.setAttribute("aria-label", "Kurv, 1 vare");
    else link.setAttribute("aria-label", "Kurv, " + n + " varer");
  }
}

// Shared /api/shop fetch, memoized: feeds the footer and the receipt.
let shopBakeryPromise = null;
function fetchShopBakery() {
  if (!shopBakeryPromise) {
    shopBakeryPromise = fetch("/api/shop")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data && data.bakery ? data.bakery : null))
      .catch(() => null);
  }
  return shopBakeryPromise;
}

function fillFooter(bakery) {
  const target = document.getElementById("footer-contact");
  if (!target || !bakery) return;
  target.textContent = bakery.address + " · " + bakery.phone + " · " + bakery.email;
}

fetchShopBakery().then(fillFooter);

function parseISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function formatDateLong(iso) {
  const d = parseISODate(iso);
  return WEEKDAY_NAMES[d.getDay()] + " " + d.getDate() + ". " +
    MONTH_NAMES[d.getMonth()] + " " + d.getFullYear();
}

function sanitizeCart(cart) {
  const lines = Array.isArray(cart.lines) ? cart.lines : [];
  cart.lines = lines
    .filter((l) => l && typeof l.productId === "number")
    .map((l) => ({
      productId: l.productId,
      qty: Math.min(QTY_MAX, Math.max(QTY_MIN, Math.round(Number(l.qty)) || QTY_MIN)),
      optionIds: Array.isArray(l.optionIds) ? l.optionIds : [],
      cakeText: typeof l.cakeText === "string" ? l.cakeText : ""
    }));
  return cart;
}

// Resolve the picked (or default) option per group, mirroring the server.
function lineOptionDetails(product, line) {
  const chosen = new Set(line.optionIds || []);
  const details = [];
  let deltaSum = 0;
  for (const group of product.optionGroups || []) {
    let picked = group.options.find((o) => chosen.has(o.id));
    if (!picked) picked = group.options.find((o) => o.isDefault) || group.options[0];
    if (picked) {
      details.push({ group: group.name, value: picked.value });
      deltaSum += picked.priceDeltaCents;
    }
  }
  return { details, deltaSum };
}

function unitPriceCents(product, line) {
  const { deltaSum } = lineOptionDetails(product, line);
  let price = product.basePriceCents + deltaSum;
  if (line.cakeText && product.canHaveCakeText) price += product.cakeTextPriceCents;
  return price;
}

/* ---------------- Checkout mode ---------------- */

const checkoutView = document.getElementById("checkout-view");
const confirmationView = document.getElementById("confirmation-view");

let productsById = new Map();
let cartState = { lines: [] };
let pickupInfo = null;
let totalCents = 0;
let payLabel = "Betal med Vipps / kort (demo)";

function initCheckout() {
  checkoutView.hidden = false;

  const form = document.getElementById("checkout-form");
  const dateInput = document.getElementById("pickup-date");

  dateInput.addEventListener("change", () => {
    if (pickupInfo) showDateError(dateProblem(dateInput.value));
  });
  document.getElementById("pickup-slot").addEventListener("change", () => {
    showFieldError("pickup-slot", "slot-error", "");
  });
  form.addEventListener("submit", onSubmit);

  loadCheckout();
}

function statusMessage(node) {
  const statusEl = document.getElementById("checkout-status");
  statusEl.textContent = "";
  statusEl.hidden = false;
  statusEl.appendChild(node);
  document.getElementById("checkout-content").hidden = true;
}

function showCheckoutEmpty() {
  const card = el("section", "card state-card");
  card.appendChild(el("h2", null, "Kurven er tom"));
  card.appendChild(el("p", "muted", "Legg til varer i butikken før du går til kassen."));
  const link = el("a", "btn btn-primary", "Gå til butikken");
  link.href = "./index.html";
  card.appendChild(link);
  statusMessage(card);
}

function showCheckoutError() {
  const card = el("section", "card state-card");
  card.appendChild(el("p", null, "Vi fikk ikke lastet kassen. Sjekk nettverket og prøv igjen."));
  const btn = el("button", "btn", "Prøv igjen");
  btn.type = "button";
  btn.addEventListener("click", loadCheckout);
  card.appendChild(btn);
  statusMessage(card);
}

async function loadCheckout() {
  statusMessage(el("p", "muted", "Laster..."));
  cartState = sanitizeCart(loadCart());
  updateBadge(cartState);
  if (!cartState.lines.length) {
    showCheckoutEmpty();
    return;
  }
  let products;
  try {
    const res = await fetch("/api/products");
    if (!res.ok) throw new Error("HTTP " + res.status);
    products = (await res.json()).products || [];
  } catch {
    showCheckoutError();
    return;
  }
  productsById = new Map(products.map((p) => [p.id, p]));
  // Drop stale lines BEFORE asking for pickup options.
  const kept = cartState.lines.filter((l) => productsById.has(l.productId));
  if (kept.length !== cartState.lines.length) {
    cartState.lines = kept;
    saveCart(cartState);
    updateBadge(cartState);
  }
  if (!cartState.lines.length) {
    showCheckoutEmpty();
    return;
  }
  renderSummary();
  document.getElementById("checkout-status").hidden = true;
  document.getElementById("checkout-content").hidden = false;
  await loadPickupOptions();
}

function renderSummary() {
  const listEl = document.getElementById("summary-lines");
  listEl.textContent = "";
  totalCents = 0;
  for (const line of cartState.lines) {
    const product = productsById.get(line.productId);
    const unit = unitPriceCents(product, line);
    const lineTotal = unit * line.qty;
    totalCents += lineTotal;

    const li = el("li", "summary-line");
    const info = el("div", "summary-line-info");
    info.appendChild(el("span", "summary-line-name", line.qty + " × " + product.name));
    const { details } = lineOptionDetails(product, line);
    if (details.length) {
      info.appendChild(el("span", "summary-line-meta", details.map((d) => d.value).join(" · ")));
    }
    if (line.cakeText && product.canHaveCakeText) {
      info.appendChild(el("span", "summary-line-meta", "Tekst: «" + line.cakeText + "»"));
    }
    li.appendChild(info);
    li.appendChild(el("span", "price summary-line-price", formatKr(lineTotal)));
    listEl.appendChild(li);
  }
  document.getElementById("summary-total").textContent = formatKr(totalCents);
  payLabel = "Betal " + formatKr(totalCents) + " med Vipps / kort (demo)";
  document.getElementById("pay-btn").textContent = payLabel;
}

function showPickupError(message) {
  const statusEl = document.getElementById("pickup-status");
  statusEl.textContent = "";
  statusEl.hidden = false;
  statusEl.appendChild(el("p", "field-error-block", message || "Vi fikk ikke hentet hentetidene. Prøv igjen."));
  const btn = el("button", "btn", "Prøv igjen");
  btn.type = "button";
  btn.addEventListener("click", loadCheckout);
  statusEl.appendChild(btn);
  document.getElementById("pickup-fields").hidden = true;
}

async function loadPickupOptions() {
  const statusEl = document.getElementById("pickup-status");
  statusEl.textContent = "";
  statusEl.hidden = false;
  statusEl.appendChild(el("p", "muted", "Henter hentetider..."));
  document.getElementById("pickup-fields").hidden = true;
  pickupInfo = null;

  const ids = [...new Set(cartState.lines.map((l) => l.productId))].join(",");
  let data = null;
  try {
    const res = await fetch("/api/pickup-options?products=" + encodeURIComponent(ids));
    data = await res.json().catch(() => null);
    if (!res.ok) {
      showPickupError(data && data.error ? data.error : null);
      return;
    }
  } catch {
    showPickupError(null);
    return;
  }
  pickupInfo = data;

  const dateInput = document.getElementById("pickup-date");
  dateInput.min = pickupInfo.earliestDate;
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 60);
  dateInput.max = toISODate(maxDate);

  const slotSelect = document.getElementById("pickup-slot");
  slotSelect.textContent = "";
  const placeholder = el("option", null, "Velg tidspunkt");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = true;
  slotSelect.appendChild(placeholder);
  for (const slot of pickupInfo.slots || []) {
    const opt = el("option", null, slot);
    opt.value = slot;
    slotSelect.appendChild(opt);
  }

  let hint = "Tidligste henting er " + formatDateLong(pickupInfo.earliestDate) + ".";
  const closed = pickupInfo.closedWeekdays || [];
  if (closed.length) {
    hint += " Bakeriet holder stengt på " + closed.map((d) => WEEKDAY_NAMES[d] + "er").join(" og ") + ".";
  }
  document.getElementById("pickup-hint").textContent = hint;

  statusEl.hidden = true;
  document.getElementById("pickup-fields").hidden = false;
}

/* Validation */

function showFieldError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(errorId);
  if (message) {
    errEl.textContent = message;
    errEl.hidden = false;
    input.setAttribute("aria-invalid", "true");
  } else {
    errEl.textContent = "";
    errEl.hidden = true;
    input.removeAttribute("aria-invalid");
  }
}

function showDateError(message) {
  showFieldError("pickup-date", "date-error", message);
}

function dateProblem(value) {
  if (!value) return "Velg hentedag";
  const d = parseISODate(value);
  const closed = (pickupInfo && pickupInfo.closedWeekdays) || [];
  if (closed.includes(d.getDay())) {
    return "Bakeriet holder stengt denne dagen. Velg en annen dag.";
  }
  if (pickupInfo && value < pickupInfo.earliestDate) {
    return "Tidligste hentedag er " + formatDateLong(pickupInfo.earliestDate) + ".";
  }
  const max = document.getElementById("pickup-date").max;
  if (max && value > max) {
    return "Hentedagen kan ikke være mer enn 60 dager frem i tid.";
  }
  return "";
}

function validateForm() {
  let firstInvalid = null;

  const nameInput = document.getElementById("cust-name");
  const nameMsg = nameInput.value.trim() ? "" : "Skriv inn navnet ditt";
  showFieldError("cust-name", "name-error", nameMsg);
  if (nameMsg && !firstInvalid) firstInvalid = nameInput;

  const phoneInput = document.getElementById("cust-phone");
  const phoneValue = phoneInput.value.trim();
  let phoneMsg = "";
  if (!phoneValue) phoneMsg = "Skriv inn telefonnummeret ditt";
  else if (phoneValue.replace(/[^0-9]/g, "").length < 8) phoneMsg = "Skriv inn et gyldig telefonnummer";
  showFieldError("cust-phone", "phone-error", phoneMsg);
  if (phoneMsg && !firstInvalid) firstInvalid = phoneInput;

  const emailInput = document.getElementById("cust-email");
  const emailValue = emailInput.value.trim();
  let emailMsg = "";
  if (!emailValue) emailMsg = "Skriv inn e-postadressen din";
  else if (!/^\S+@\S+\.\S+$/.test(emailValue)) emailMsg = "Skriv inn en gyldig e-postadresse";
  showFieldError("cust-email", "email-error", emailMsg);
  if (emailMsg && !firstInvalid) firstInvalid = emailInput;

  const dateInput = document.getElementById("pickup-date");
  const dateMsg = dateProblem(dateInput.value);
  showDateError(dateMsg);
  if (dateMsg && !firstInvalid) firstInvalid = dateInput;

  const slotSelect = document.getElementById("pickup-slot");
  const slotMsg = slotSelect.value ? "" : "Velg hentetidspunkt";
  showFieldError("pickup-slot", "slot-error", slotMsg);
  if (slotMsg && !firstInvalid) firstInvalid = slotSelect;

  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}

function showSubmitError(message) {
  const errEl = document.getElementById("submit-error");
  if (message) {
    errEl.textContent = message;
    errEl.hidden = false;
  } else {
    errEl.textContent = "";
    errEl.hidden = true;
  }
}

async function onSubmit(event) {
  event.preventDefault();
  showSubmitError("");
  if (!cartState.lines.length) return;
  if (!pickupInfo) {
    showSubmitError("Hentetidene kunne ikke lastes. Prøv igjen før du betaler.");
    return;
  }
  if (!validateForm()) return;

  const payload = {
    customer: {
      name: document.getElementById("cust-name").value.trim(),
      phone: document.getElementById("cust-phone").value.trim(),
      email: document.getElementById("cust-email").value.trim()
    },
    pickupDate: document.getElementById("pickup-date").value,
    pickupSlot: document.getElementById("pickup-slot").value,
    lines: cartState.lines.map((l) => {
      const product = productsById.get(l.productId);
      const line = { productId: l.productId, qty: l.qty };
      if (l.optionIds && l.optionIds.length) line.optionIds = l.optionIds;
      if (l.cakeText && product && product.canHaveCakeText) line.cakeText = l.cakeText;
      return line;
    })
  };
  const note = document.getElementById("order-note").value.trim();
  if (note) payload.note = note;

  const payBtn = document.getElementById("pay-btn");
  payBtn.disabled = true;
  payBtn.textContent = "Behandler betaling...";
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.status === 201) {
      const data = await res.json();
      saveCart({ lines: [] });
      window.location.href = "./checkout.html?order=" + data.order.id;
      return;
    }
    const data = await res.json().catch(() => null);
    showSubmitError(data && data.error ? data.error : "Noe gikk galt med bestillingen. Prøv igjen.");
  } catch {
    showSubmitError("Vi fikk ikke kontakt med serveren. Sjekk nettverket og prøv igjen.");
  }
  payBtn.disabled = false;
  payBtn.textContent = payLabel;
}

/* ---------------- Confirmation mode ---------------- */

function showConfirmationError(message, orderId) {
  const root = document.getElementById("confirmation-root");
  root.textContent = "";
  const card = el("section", "card state-card");
  card.appendChild(el("p", null, message));
  const btn = el("button", "btn", "Prøv igjen");
  btn.type = "button";
  btn.addEventListener("click", () => initConfirmation(orderId));
  card.appendChild(btn);
  const back = el("p", "state-back");
  const link = el("a", null, "Tilbake til butikken");
  link.href = "./index.html";
  back.appendChild(link);
  card.appendChild(back);
  root.appendChild(card);
}

function receiptRow(label, value) {
  const row = el("div", "receipt-row");
  row.appendChild(el("span", "receipt-row-label", label));
  row.appendChild(el("span", "receipt-row-value", value));
  return row;
}

function renderReceipt(order, bakery) {
  const root = document.getElementById("confirmation-root");
  root.textContent = "";
  const wrap = el("div", "receipt");

  // Head: order number as stat, demo payment badge
  const head = el("section", "card receipt-head");
  const headTop = el("div", "receipt-head-top");
  const numWrap = el("div", "receipt-num");
  numWrap.appendChild(el("span", "label", "Ordrenummer"));
  numWrap.appendChild(el("span", "stat receipt-stat", order.orderNumber));
  headTop.appendChild(numWrap);
  headTop.appendChild(el("span", "badge badge-ok", "Demobetaling gjennomført"));
  head.appendChild(headTop);
  head.appendChild(el("h1", "receipt-title", "Takk for bestillingen"));
  head.appendChild(el("p", "muted receipt-sub", "Bestillingen er sendt til bakeriet."));
  wrap.appendChild(head);

  // Pickup, prominent
  const pickup = el("section", "card receipt-pickup");
  pickup.appendChild(el("span", "label", "Henting"));
  pickup.appendChild(el("p", "pickup-when", formatDateLong(order.pickupDate) + ", kl. " + order.pickupSlot));
  if (bakery) {
    pickup.appendChild(el("p", "muted pickup-where", bakery.name + ", " + bakery.address));
  }
  wrap.appendChild(pickup);

  // Items as a systematic table with hairline rows
  const items = el("section", "card receipt-items");
  items.appendChild(el("span", "label", "Varer"));
  const table = el("table", "receipt-table");
  const tbody = el("tbody");
  for (const line of order.lines || []) {
    const tr = el("tr");
    const tdInfo = el("td", "item-info");
    tdInfo.appendChild(el("span", "item-name", line.qty + " × " + line.productName));
    if (line.options && line.options.length) {
      tdInfo.appendChild(el("span", "item-meta", line.options.map((o) => o.group + ": " + o.value).join(" · ")));
    }
    if (line.cakeText) {
      tdInfo.appendChild(el("span", "item-meta", "Tekst: «" + line.cakeText + "»"));
    }
    if (line.qty > 1) {
      tdInfo.appendChild(el("span", "item-meta", formatKr(line.unitPriceCents) + " per stk"));
    }
    tr.appendChild(tdInfo);
    const tdPrice = el("td", "item-price");
    tdPrice.appendChild(el("span", "price", formatKr(line.lineTotalCents)));
    tr.appendChild(tdPrice);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const tfoot = el("tfoot");
  const totalTr = el("tr", "receipt-total-row");
  totalTr.appendChild(el("td", null, "Totalt"));
  const totalTd = el("td", "item-price");
  totalTd.appendChild(el("span", "price", formatKr(order.totalCents)));
  totalTr.appendChild(totalTd);
  tfoot.appendChild(totalTr);
  table.appendChild(tfoot);
  items.appendChild(table);
  items.appendChild(el("p", "muted vat-note", "inkl. mva"));
  wrap.appendChild(items);

  // Contact and payment details as hairline rows
  const details = el("section", "card receipt-details");
  details.appendChild(el("span", "label", "Kontakt og betaling"));
  const rows = el("div", "receipt-rows");
  rows.appendChild(receiptRow("Navn", order.customer.name));
  rows.appendChild(receiptRow("Telefon", order.customer.phone));
  rows.appendChild(receiptRow("E-post", order.customer.email));
  if (order.note) rows.appendChild(receiptRow("Kommentar", order.note));
  rows.appendChild(receiptRow("Betaling", "Demo, ingen ekte betaling"));
  rows.appendChild(receiptRow("Referanse", order.paymentReference));
  details.appendChild(rows);
  wrap.appendChild(details);

  const back = el("a", "btn receipt-back", "Tilbake til butikken");
  back.href = "./index.html";
  wrap.appendChild(back);

  root.appendChild(wrap);
}

async function initConfirmation(orderId) {
  fetchShopBakery().then((bakery) => {
    document.title = "Kvittering - " + (bakery ? bakery.name : "Bakeriet på Hjørnet");
  });
  confirmationView.hidden = false;
  const root = document.getElementById("confirmation-root");
  root.textContent = "";
  root.appendChild(el("p", "muted", "Henter bestillingen..."));
  updateBadge(sanitizeCart(loadCart()));

  let orderRes;
  try {
    orderRes = await fetch("/api/orders/" + encodeURIComponent(orderId));
  } catch {
    showConfirmationError("Vi fikk ikke hentet bestillingen. Sjekk nettverket og prøv igjen.", orderId);
    return;
  }
  if (!orderRes.ok) {
    const data = await orderRes.json().catch(() => null);
    showConfirmationError(data && data.error ? data.error : "Vi fant ikke bestillingen.", orderId);
    return;
  }
  const order = (await orderRes.json()).order;
  const bakery = await fetchShopBakery();
  renderReceipt(order, bakery);
}

/* ---------------- Entry point ---------------- */

const orderIdParam = new URLSearchParams(window.location.search).get("order");
if (orderIdParam) {
  initConfirmation(orderIdParam);
} else {
  initCheckout();
}
