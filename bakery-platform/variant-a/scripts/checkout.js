// Variant A "Håndverk" checkout + confirmation page.
// Without ?order= : order summary, customer form, pickup options and a demo
// payment step that POSTs to /api/orders.
// With ?order=<id> : fetches the order and renders the receipt.

const CART_KEY = "bakeri_cart_v1";

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || { lines: [] }; }
  catch { return { lines: [] }; }
}
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
function cartCount(cart) { return cart.lines.reduce((n, l) => n + l.qty, 0); }
function formatKr(cents) {
  const kr = cents / 100;
  return "kr " + (Number.isInteger(kr) ? kr : kr.toFixed(2).replace(".", ","));
}

const MAX_QTY = 50;
const MAX_ORDER_LINES = 30;
const WEEKDAY_NAMES = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const STATUS_LABELS = {
  new: "Ny",
  confirmed: "Bekreftet",
  ready: "Klar til henting",
  picked_up: "Hentet",
  cancelled: "Kansellert",
};
const STATUS_BADGE_CLASS = {
  new: "badge",
  confirmed: "badge",
  ready: "badge badge-ok",
  picked_up: "badge badge-muted",
  cancelled: "badge badge-warn",
};

const stateBox = document.getElementById("stateBox");
const checkoutView = document.getElementById("checkoutView");
const confirmView = document.getElementById("confirmView");
const badge = document.getElementById("cartBadge");

let cart = loadCart();
let products = [];
let pickupInfo = null;
let totalCents = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function updateBadge() {
  const count = cartCount(cart);
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function productById(id) { return products.find((p) => p.id === id) || null; }

function optionsForLine(product, line) {
  const found = [];
  for (const id of line.optionIds || []) {
    for (const group of product.optionGroups || []) {
      const opt = (group.options || []).find((o) => o.id === id);
      if (opt) {
        found.push({ group: group.name, value: opt.value, priceDeltaCents: opt.priceDeltaCents });
        break;
      }
    }
  }
  return found;
}

function unitPriceCents(product, line, options) {
  let cents = product.basePriceCents;
  for (const o of options) cents += o.priceDeltaCents;
  if (line.cakeText && product.canHaveCakeText) cents += product.cakeTextPriceCents;
  return cents;
}

function lineQty(line) {
  return Math.max(1, Math.min(MAX_QTY, Math.round(Number(line.qty) || 1)));
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

function isoLocal(date) {
  return date.getFullYear() + "-"
    + String(date.getMonth() + 1).padStart(2, "0") + "-"
    + String(date.getDate()).padStart(2, "0");
}

function formatDateNo(iso) {
  const date = new Date(iso + "T12:00:00");
  return new Intl.DateTimeFormat("nb-NO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(date);
}

function isClosedDay(iso) {
  const day = new Date(iso + "T12:00:00").getDay();
  return (pickupInfo.closedWeekdays || []).includes(day);
}

/* State box helpers */

function showState(node) {
  stateBox.textContent = "";
  stateBox.appendChild(node);
  stateBox.hidden = false;
  checkoutView.hidden = true;
  confirmView.hidden = true;
}
function hideState() {
  stateBox.hidden = true;
  stateBox.textContent = "";
}

function stateMessage(text) {
  const box = el("div", "state-card card");
  box.appendChild(el("p", "state-text", text));
  return box;
}

function errorState(message, retry) {
  const box = stateMessage(message);
  const btn = el("button", "btn", "Prøv igjen");
  btn.type = "button";
  btn.addEventListener("click", retry);
  box.appendChild(btn);
  return box;
}

function emptyState() {
  const box = el("div", "state-card card");
  box.appendChild(el("h2", null, "Handlekurven din er tom"));
  box.appendChild(el("p", "muted", "Kom innom og se hva vi har bakt i dag."));
  const link = el("a", "btn btn-primary", "Til butikken");
  link.href = "./index.html";
  box.appendChild(link);
  return box;
}

/* Checkout mode */

function renderSummary() {
  const list = document.getElementById("summaryLines");
  list.textContent = "";
  totalCents = 0;
  for (const line of cart.lines) {
    const product = productById(line.productId);
    const options = optionsForLine(product, line);
    const unit = unitPriceCents(product, line, options);
    const qty = lineQty(line);
    const lineTotal = unit * qty;
    totalCents += lineTotal;

    const item = el("li", "summary-line");
    const info = el("div", "summary-line-info");
    info.appendChild(el("span", "summary-line-name", qty + " × " + product.name));
    const details = options.map((o) => o.value);
    if (line.cakeText && product.canHaveCakeText) details.push("«" + line.cakeText + "»");
    if (details.length) info.appendChild(el("span", "summary-line-opts muted", details.join(" · ")));
    item.appendChild(info);
    item.appendChild(el("span", "summary-line-price price", formatKr(lineTotal)));
    list.appendChild(item);
  }
  document.getElementById("summaryTotal").textContent = formatKr(totalCents);
  document.getElementById("payBtn").textContent =
    "Betal " + formatKr(totalCents) + " med Vipps eller kort (demo)";
}

function setFieldError(id, message) {
  const input = document.getElementById(id);
  const err = document.getElementById("err-" + id);
  if (message) {
    input.classList.add("invalid");
    input.setAttribute("aria-invalid", "true");
    err.textContent = message;
    err.hidden = false;
  } else {
    input.classList.remove("invalid");
    input.removeAttribute("aria-invalid");
    err.textContent = "";
    err.hidden = true;
  }
}

function validateDate() {
  const dateInput = document.getElementById("pickupDate");
  const value = dateInput.value;
  if (!value) {
    setFieldError("pickupDate", "Velg en hentedag");
    return false;
  }
  if (isClosedDay(value)) {
    setFieldError("pickupDate", "Bakeriet holder stengt denne dagen. Velg en annen dag.");
    return false;
  }
  if (dateInput.min && value < dateInput.min) {
    setFieldError("pickupDate", "Tidligste hentedag er " + formatDateNo(dateInput.min) + ".");
    return false;
  }
  if (dateInput.max && value > dateInput.max) {
    setFieldError("pickupDate", "Henting kan bestilles inntil 60 dager frem i tid.");
    return false;
  }
  setFieldError("pickupDate", "");
  return true;
}

function setupPickupFields() {
  const dateInput = document.getElementById("pickupDate");
  const slotSelect = document.getElementById("pickupSlot");

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 60);
  dateInput.min = pickupInfo.earliestDate;
  dateInput.max = isoLocal(maxDate);
  if (!isClosedDay(pickupInfo.earliestDate)) dateInput.value = pickupInfo.earliestDate;

  while (slotSelect.options.length > 1) slotSelect.remove(1);
  for (const slot of pickupInfo.slots || []) {
    const opt = document.createElement("option");
    opt.value = slot;
    opt.textContent = "kl. " + slot;
    slotSelect.appendChild(opt);
  }

  const closedNames = (pickupInfo.closedWeekdays || []).map((d) => WEEKDAY_NAMES[d] + "er");
  let hint = "Tidligste henting er " + formatDateNo(pickupInfo.earliestDate) + ".";
  if (closedNames.length) hint += " Vi holder stengt på " + closedNames.join(" og ") + ".";
  document.getElementById("pickupHint").textContent = hint;

  dateInput.addEventListener("change", validateDate);
}

function validateForm() {
  let firstInvalid = null;

  const name = document.getElementById("custName");
  if (!name.value.trim()) {
    setFieldError("custName", "Skriv inn navnet ditt");
    firstInvalid = firstInvalid || name;
  } else {
    setFieldError("custName", "");
  }

  const phone = document.getElementById("custPhone");
  if (!phone.value.trim()) {
    setFieldError("custPhone", "Skriv inn telefonnummeret ditt");
    firstInvalid = firstInvalid || phone;
  } else {
    setFieldError("custPhone", "");
  }

  const email = document.getElementById("custEmail");
  const emailVal = email.value.trim();
  if (!emailVal) {
    setFieldError("custEmail", "Skriv inn e-postadressen din");
    firstInvalid = firstInvalid || email;
  } else if (!/^\S+@\S+\.\S+$/.test(emailVal)) {
    setFieldError("custEmail", "Skriv inn en gyldig e-postadresse");
    firstInvalid = firstInvalid || email;
  } else {
    setFieldError("custEmail", "");
  }

  if (!validateDate()) {
    firstInvalid = firstInvalid || document.getElementById("pickupDate");
  }

  const slot = document.getElementById("pickupSlot");
  if (!slot.value) {
    setFieldError("pickupSlot", "Velg et hentetidspunkt");
    firstInvalid = firstInvalid || slot;
  } else {
    setFieldError("pickupSlot", "");
  }

  return firstInvalid;
}

async function onSubmit(event) {
  event.preventDefault();
  const submitError = document.getElementById("submitError");
  submitError.hidden = true;
  submitError.textContent = "";

  const firstInvalid = validateForm();
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  const payload = {
    customer: {
      name: document.getElementById("custName").value.trim(),
      phone: document.getElementById("custPhone").value.trim(),
      email: document.getElementById("custEmail").value.trim(),
    },
    pickupDate: document.getElementById("pickupDate").value,
    pickupSlot: document.getElementById("pickupSlot").value,
    lines: cart.lines.map((line) => {
      const out = { productId: line.productId, qty: lineQty(line) };
      if (Array.isArray(line.optionIds) && line.optionIds.length) out.optionIds = line.optionIds;
      if (line.cakeText) out.cakeText = line.cakeText;
      return out;
    }),
  };
  const note = document.getElementById("orderNote").value.trim();
  if (note) payload.note = note;

  const payBtn = document.getElementById("payBtn");
  const originalLabel = payBtn.textContent;
  payBtn.disabled = true;
  payBtn.textContent = "Behandler betalingen...";

  let result;
  try {
    result = await fetchJson("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    payBtn.disabled = false;
    payBtn.textContent = originalLabel;
    submitError.textContent = "Vi fikk ikke sendt bestillingen. Sjekk tilkoblingen og prøv igjen.";
    submitError.hidden = false;
    return;
  }

  if (result.status === 201 && result.data && result.data.order) {
    saveCart({ lines: [] });
    location.href = "./checkout.html?order=" + result.data.order.id;
    return;
  }

  payBtn.disabled = false;
  payBtn.textContent = originalLabel;
  submitError.textContent = (result.data && result.data.error)
    ? result.data.error
    : "Noe gikk galt med bestillingen. Prøv igjen.";
  submitError.hidden = false;
}

async function initCheckout() {
  document.title = "Kassen - Bakeriet på Hjørnet";
  updateBadge();
  showState(stateMessage("Gjør klar kassen..."));

  let productsRes;
  try {
    productsRes = await fetchJson("/api/products");
  } catch {
    showState(errorState("Vi fikk ikke kontakt med bakeriet akkurat nå. Sjekk tilkoblingen din.", initCheckout));
    return;
  }
  if (!productsRes.ok || !productsRes.data) {
    showState(errorState("Vi fikk ikke kontakt med bakeriet akkurat nå. Sjekk tilkoblingen din.", initCheckout));
    return;
  }
  products = productsRes.data.products || [];

  // Silently drop cart lines whose product no longer exists (contract),
  // BEFORE asking for pickup options.
  const kept = cart.lines.filter((l) => l && productById(l.productId));
  if (kept.length !== cart.lines.length) {
    cart = { lines: kept };
    saveCart(cart);
    updateBadge();
  }

  if (cart.lines.length === 0) {
    showState(emptyState());
    return;
  }

  if (cart.lines.length > MAX_ORDER_LINES) {
    const box = stateMessage("En bestilling kan ha maks 30 varelinjer. Gå til handlekurven og fjern noen varer.");
    const link = el("a", "btn btn-primary", "Til handlekurven");
    link.href = "./cart.html";
    box.appendChild(link);
    showState(box);
    return;
  }

  const ids = [...new Set(cart.lines.map((l) => l.productId))].join(",");
  let pickupRes;
  try {
    pickupRes = await fetchJson("/api/pickup-options?products=" + encodeURIComponent(ids));
  } catch {
    showState(errorState("Vi fikk ikke hentet hentetidene. Prøv igjen om litt.", initCheckout));
    return;
  }
  if (!pickupRes.ok || !pickupRes.data || !pickupRes.data.earliestDate) {
    const message = (pickupRes.data && pickupRes.data.error)
      ? pickupRes.data.error
      : "Vi fikk ikke hentet hentetidene. Prøv igjen om litt.";
    showState(errorState(message, initCheckout));
    return;
  }
  pickupInfo = pickupRes.data;

  renderSummary();
  setupPickupFields();
  hideState();
  confirmView.hidden = true;
  checkoutView.hidden = false;
}

/* Confirmation mode */

function receiptSection(title) {
  const section = el("section", "receipt-section");
  if (title) section.appendChild(el("h2", "receipt-heading", title));
  return section;
}

function renderConfirmation(order, bakery) {
  confirmView.textContent = "";

  const hero = el("div", "confirm-hero");
  const fullName = (order.customer && order.customer.name) ? order.customer.name.trim() : "";
  const firstName = fullName.split(/\s+/)[0] || "";
  hero.appendChild(el("h1", null, firstName ? "Tusen takk, " + firstName + "!" : "Tusen takk!"));
  hero.appendChild(el("p", "confirm-sub", "Bestillingen din er mottatt. Vi gleder oss til å bake for deg!"));

  const badges = el("div", "confirm-badges");
  badges.appendChild(el("span", "badge badge-ok", "Demobetaling gjennomført"));
  badges.appendChild(el("span", STATUS_BADGE_CLASS[order.status] || "badge", STATUS_LABELS[order.status] || order.status));
  hero.appendChild(badges);
  confirmView.appendChild(hero);

  const receipt = el("article", "receipt card");

  const head = el("header", "receipt-head");
  head.appendChild(el("p", "receipt-shop", bakery && bakery.name ? bakery.name : "Bakeriet på Hjørnet"));
  head.appendChild(el("h2", "receipt-number", "Ordre " + order.orderNumber));
  if (order.createdAt) head.appendChild(el("p", "receipt-created muted", "Bestilt " + order.createdAt));
  receipt.appendChild(head);

  const pickup = receiptSection("Henting");
  pickup.appendChild(el("p", "receipt-strong", formatDateNo(order.pickupDate) + ", kl. " + order.pickupSlot));
  if (bakery && (bakery.name || bakery.address)) {
    pickup.appendChild(el("p", "muted", [bakery.name, bakery.address].filter(Boolean).join(", ")));
  }
  receipt.appendChild(pickup);

  const linesSection = receiptSection("Varer");
  const list = el("ul", "receipt-lines");
  for (const line of order.lines || []) {
    const item = el("li", "receipt-line");
    const info = el("div", "receipt-line-info");
    info.appendChild(el("span", "receipt-line-name", line.qty + " × " + line.productName));
    for (const opt of line.options || []) {
      info.appendChild(el("span", "receipt-line-opt muted", opt.group + ": " + opt.value));
    }
    if (line.cakeText) {
      info.appendChild(el("span", "receipt-line-opt receipt-caketext", "Tekst på kaken: «" + line.cakeText + "»"));
    }
    if (line.qty > 1) {
      info.appendChild(el("span", "receipt-line-opt muted", formatKr(line.unitPriceCents) + " per stk"));
    }
    item.appendChild(info);
    item.appendChild(el("span", "receipt-line-price price", formatKr(line.lineTotalCents)));
    list.appendChild(item);
  }
  linesSection.appendChild(list);
  receipt.appendChild(linesSection);

  const totals = receiptSection(null);
  const totalRow = el("div", "receipt-total-row");
  totalRow.appendChild(el("span", "receipt-total-label", "Totalt"));
  totalRow.appendChild(el("span", "price", formatKr(order.totalCents)));
  totals.appendChild(totalRow);
  totals.appendChild(el("p", "vat-note muted", "inkl. mva"));
  receipt.appendChild(totals);

  if (order.note) {
    const noteSection = receiptSection("Kommentar til bakeriet");
    noteSection.appendChild(el("p", "muted", order.note));
    receipt.appendChild(noteSection);
  }

  const customer = receiptSection("Kontaktinformasjon");
  customer.appendChild(el("p", null, order.customer.name));
  customer.appendChild(el("p", "muted", [order.customer.phone, order.customer.email].filter(Boolean).join(" · ")));
  receipt.appendChild(customer);

  const payment = receiptSection("Betaling");
  payment.appendChild(el("p", null, "Demobetaling med Vipps eller kort. Ingen ekte betaling er gjennomført."));
  if (order.paymentReference) {
    payment.appendChild(el("p", "muted", "Referanse: " + order.paymentReference));
  }
  receipt.appendChild(payment);

  confirmView.appendChild(receipt);

  const backWrap = el("div", "confirm-back");
  const back = el("a", "btn btn-primary", "Tilbake til butikken");
  back.href = "./index.html";
  backWrap.appendChild(back);
  confirmView.appendChild(backWrap);

  hideState();
  checkoutView.hidden = true;
  confirmView.hidden = false;
}

async function initConfirmation(orderId) {
  document.title = "Kvittering - Bakeriet på Hjørnet";
  updateBadge();
  showState(stateMessage("Henter bestillingen din..."));

  let orderRes;
  try {
    orderRes = await fetchJson("/api/orders/" + encodeURIComponent(orderId));
  } catch {
    showState(errorState("Vi fikk ikke hentet bestillingen akkurat nå. Sjekk tilkoblingen din.", () => initConfirmation(orderId)));
    return;
  }

  if (orderRes.status === 404) {
    const box = stateMessage("Vi fant ikke denne bestillingen.");
    const link = el("a", "btn btn-primary", "Tilbake til butikken");
    link.href = "./index.html";
    box.appendChild(link);
    showState(box);
    return;
  }
  if (!orderRes.ok || !orderRes.data || !orderRes.data.order) {
    showState(errorState("Vi fikk ikke hentet bestillingen akkurat nå. Sjekk tilkoblingen din.", () => initConfirmation(orderId)));
    return;
  }

  let bakery = null;
  try {
    const shopRes = await fetchJson("/api/shop");
    if (shopRes.ok && shopRes.data) bakery = shopRes.data.bakery || null;
  } catch {
    // The receipt still renders without the bakery address.
  }

  renderConfirmation(orderRes.data.order, bakery);
}

/* Shared chrome */

async function loadShopIntoChrome() {
  try {
    const res = await fetchJson("/api/shop");
    if (!res.ok || !res.data || !res.data.bakery) return;
    const bakery = res.data.bakery;
    if (bakery.name) {
      document.getElementById("brandLink").textContent = bakery.name;
      document.getElementById("footer-name").textContent = bakery.name;
    }
    document.getElementById("footer-address").textContent = bakery.address || "";
    if (bakery.phone) {
      const phone = document.getElementById("footer-phone");
      phone.textContent = bakery.phone;
      phone.href = "tel:" + bakery.phone.replace(/\s+/g, "");
    }
    if (bakery.email) {
      const email = document.getElementById("footer-email");
      email.textContent = bakery.email;
      email.href = "mailto:" + bakery.email;
    }
  } catch {
    // The footer falls back to the static text; nothing to do.
  }
}

/* Entry */

document.getElementById("checkoutForm").addEventListener("submit", onSubmit);
loadShopIntoChrome();

const orderParam = new URLSearchParams(location.search).get("order");
if (orderParam) {
  initConfirmation(orderParam);
} else {
  initCheckout();
}
