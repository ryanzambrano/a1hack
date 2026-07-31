// Checkout + confirmation page script for variant E (Nordisk).
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
}

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
let payLabel = "Betal med Vipps eller kort (demo)";

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
  card.appendChild(el("h2", null, "Handlekurven er tom"));
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
      info.appendChild(el("span", "summary-line-meta", "Kaketekst: «" + line.cakeText + "»"));
    }
    li.appendChild(info);
    li.appendChild(el("span", "price summary-line-price", formatKr(lineTotal)));
    listEl.appendChild(li);
  }
  document.getElementById("summary-total").textContent = formatKr(totalCents);
  payLabel = "Betal " + formatKr(totalCents) + " med Vipps eller kort (demo)";
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

function receiptSection(heading) {
  const section = el("section", "card receipt-section");
  section.appendChild(el("h2", null, heading));
  return section;
}

function contactRow(label, value) {
  const row = el("div", "contact-row");
  row.appendChild(el("span", "muted contact-label", label));
  row.appendChild(el("span", "contact-value", value));
  return row;
}

function renderReceipt(order, bakery) {
  const root = document.getElementById("confirmation-root");
  root.textContent = "";
  const wrap = el("div", "receipt");

  // Hero
  const hero = el("section", "card receipt-hero");
  hero.appendChild(el("span", "badge badge-ok", "Demobetaling gjennomført"));
  hero.appendChild(el("h1", null, "Takk for bestillingen"));
  const heroText = el("p", "muted");
  heroText.append("Ordrenummer ");
  heroText.appendChild(el("strong", null, order.orderNumber));
  heroText.append(". Bestillingen er sendt til bakeriet.");
  hero.appendChild(heroText);
  wrap.appendChild(hero);

  // Pickup
  const pickup = receiptSection("Henting");
  pickup.appendChild(el("p", "pickup-when", formatDateLong(order.pickupDate) + ", kl. " + order.pickupSlot));
  if (bakery) {
    pickup.appendChild(el("p", "muted", bakery.name + ", " + bakery.address));
  }
  wrap.appendChild(pickup);

  // Lines
  const items = receiptSection("Varer");
  const ul = el("ul", "receipt-lines");
  for (const line of order.lines || []) {
    const li = el("li", "receipt-line");
    const head = el("div", "receipt-line-head");
    head.appendChild(el("span", "receipt-line-name", line.qty + " × " + line.productName));
    head.appendChild(el("span", "price", formatKr(line.lineTotalCents)));
    li.appendChild(head);
    if (line.options && line.options.length) {
      li.appendChild(el("p", "line-meta", line.options.map((o) => o.group + ": " + o.value).join(" · ")));
    }
    if (line.cakeText) {
      li.appendChild(el("p", "line-meta", "Kaketekst: «" + line.cakeText + "»"));
    }
    if (line.qty > 1) {
      li.appendChild(el("p", "line-meta", formatKr(line.unitPriceCents) + " per stk"));
    }
    ul.appendChild(li);
  }
  items.appendChild(ul);
  const totalRow = el("div", "summary-total");
  totalRow.appendChild(el("span", null, "Totalt"));
  totalRow.appendChild(el("span", "price", formatKr(order.totalCents)));
  items.appendChild(totalRow);
  items.appendChild(el("p", "muted vat-note", "inkl. mva"));
  wrap.appendChild(items);

  // Contact
  const contact = receiptSection("Kontaktinformasjon");
  contact.appendChild(contactRow("Navn", order.customer.name));
  contact.appendChild(contactRow("Telefon", order.customer.phone));
  contact.appendChild(contactRow("E-post", order.customer.email));
  if (order.note) contact.appendChild(contactRow("Kommentar", order.note));
  wrap.appendChild(contact);

  // Payment
  const payment = receiptSection("Betaling");
  const payStatus = el("p", "payment-status");
  payStatus.appendChild(el("span", "badge badge-ok", "Demobetaling gjennomført"));
  payment.appendChild(payStatus);
  payment.appendChild(el("p", "muted", "Referanse: " + order.paymentReference));
  wrap.appendChild(payment);

  const back = el("a", "btn btn-primary receipt-back", "Tilbake til butikken");
  back.href = "./index.html";
  wrap.appendChild(back);

  root.appendChild(wrap);
}

async function initConfirmation(orderId) {
  document.title = "Kvittering - Bakeriet på Hjørnet";
  confirmationView.hidden = false;
  const root = document.getElementById("confirmation-root");
  root.textContent = "";
  root.appendChild(el("p", "muted", "Henter bestillingen..."));
  updateBadge(sanitizeCart(loadCart()));

  let orderRes;
  let shopRes;
  try {
    [orderRes, shopRes] = await Promise.all([
      fetch("/api/orders/" + encodeURIComponent(orderId)),
      fetch("/api/shop")
    ]);
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
  let bakery = null;
  if (shopRes && shopRes.ok) {
    const shopData = await shopRes.json().catch(() => null);
    if (shopData) bakery = shopData.bakery;
  }
  renderReceipt(order, bakery);
}

/* ---------------- Entry point ---------------- */

const orderIdParam = new URLSearchParams(window.location.search).get("order");
if (orderIdParam) {
  initConfirmation(orderIdParam);
} else {
  initCheckout();
}
