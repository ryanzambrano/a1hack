// Variant C "Tidsskrift" checkout + confirmation page.
// All user-facing copy is Norwegian bokmål.

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
const WEEKDAYS_PLURAL = ["søndager", "mandager", "tirsdager", "onsdager", "torsdager", "fredager", "lørdager"];

let cart = { lines: [] };
let productsById = new Map();
let pickup = null;
let bakery = null;
let maxDateIso = "";
let totalCents = 0;
let payLabel = "Betal med Vipps eller kort (demo)";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clampQty(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n)) return QTY_MIN;
  return Math.min(QTY_MAX, Math.max(QTY_MIN, n));
}

function renderHeaderCount() {
  const node = document.getElementById("cartCount");
  if (!node) return;
  const c = loadCart();
  const n = Array.isArray(c.lines) ? cartCount(c) : 0;
  node.textContent = String(n);
  node.hidden = n === 0;
}

function applyShop(b) {
  if (!b) return;
  bakery = b;
  const brand = document.getElementById("brandName");
  if (brand && b.name) brand.textContent = b.name;
  const foot = document.getElementById("shopFooter");
  if (foot) foot.textContent = b.name + " · " + b.address + " · " + b.phone;
}

function hideBoot() {
  const boot = document.getElementById("bootMsg");
  if (boot) boot.hidden = true;
}

function unitPriceCents(product, line) {
  let cents = product.basePriceCents;
  const ids = Array.isArray(line.optionIds) ? line.optionIds : [];
  for (const group of product.optionGroups || []) {
    for (const opt of group.options || []) {
      if (ids.includes(opt.id)) cents += opt.priceDeltaCents;
    }
  }
  if (line.cakeText && product.canHaveCakeText) cents += product.cakeTextPriceCents;
  return cents;
}

function optionSummary(product, line) {
  const ids = Array.isArray(line.optionIds) ? line.optionIds : [];
  const parts = [];
  for (const group of product.optionGroups || []) {
    for (const opt of group.options || []) {
      if (ids.includes(opt.id)) parts.push(group.name + ": " + opt.value);
    }
  }
  return parts.join(" · ");
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function formatDateLong(iso, capitalize) {
  const d = new Date(iso + "T12:00:00");
  const s = new Intl.DateTimeFormat("nb-NO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(d);
  return capitalize ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* Field error helpers */

function setFieldError(fieldId, msg) {
  const input = document.getElementById(fieldId);
  const err = document.getElementById("err-" + fieldId);
  if (input) {
    input.classList.add("invalid");
    input.setAttribute("aria-invalid", "true");
  }
  if (err) {
    err.textContent = msg;
    err.hidden = false;
  }
}

function clearFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  const err = document.getElementById("err-" + fieldId);
  if (input) {
    input.classList.remove("invalid");
    input.removeAttribute("aria-invalid");
  }
  if (err) {
    err.textContent = "";
    err.hidden = true;
  }
}

function showPayError(msg) {
  const box = document.getElementById("payError");
  box.textContent = msg;
  box.hidden = false;
}

function hidePayError() {
  const box = document.getElementById("payError");
  box.textContent = "";
  box.hidden = true;
}

/* Checkout mode */

function renderEmptyCheckout() {
  const status = document.getElementById("checkoutStatus");
  status.textContent = "";
  const empty = el("div", "empty");
  empty.appendChild(el("h2", null, "Handlekurven er tom."));
  empty.appendChild(el("p", "muted", "Legg noe godt i kurven før du kommer til kassen."));
  const link = el("a", "btn btn-primary", "Til butikken");
  link.href = "./index.html";
  empty.appendChild(link);
  status.appendChild(empty);
}

function renderCheckoutError() {
  const status = document.getElementById("checkoutStatus");
  status.textContent = "";
  const box = el("div", "notice card");
  box.appendChild(el("p", null, "Vi fikk ikke lastet kassen. Sjekk tilkoblingen og prøv igjen."));
  const retry = el("button", "btn", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", initCheckout);
  box.appendChild(retry);
  status.appendChild(box);
}

function renderSummary() {
  const wrap = document.getElementById("summaryLines");
  wrap.textContent = "";
  totalCents = 0;

  for (const line of cart.lines) {
    const product = productsById.get(line.productId);
    const unit = unitPriceCents(product, line);
    totalCents += unit * line.qty;

    const row = el("div", "sum-line");
    const top = el("div", "leader");
    top.appendChild(el("span", "sum-name", line.qty + " × " + product.name));
    top.appendChild(el("span", "dots"));
    top.appendChild(el("span", "price sum-price", formatKr(unit * line.qty)));
    row.appendChild(top);

    const meta = optionSummary(product, line);
    if (meta) row.appendChild(el("p", "sum-meta muted", meta));
    if (line.cakeText && product.canHaveCakeText) {
      row.appendChild(el("p", "sum-meta muted", "Kaketekst: «" + line.cakeText + "»"));
    }
    if (line.qty > 1) {
      row.appendChild(el("p", "sum-meta muted", formatKr(unit) + " per stk"));
    }
    wrap.appendChild(row);
  }

  const totalRow = el("div", "leader sum-total");
  totalRow.appendChild(el("span", "total-label", "Totalt"));
  totalRow.appendChild(el("span", "dots"));
  totalRow.appendChild(el("span", "price total-price", formatKr(totalCents)));
  wrap.appendChild(totalRow);
  wrap.appendChild(el("p", "muted vat-note", "inkl. mva"));
}

function validateDateField() {
  const input = document.getElementById("pickupDate");
  clearFieldError("pickupDate");
  const v = input.value;
  if (!v) {
    setFieldError("pickupDate", "Velg en hentedag.");
    return false;
  }
  const d = new Date(v + "T12:00:00");
  if (pickup.closedWeekdays.includes(d.getDay())) {
    setFieldError(
      "pickupDate",
      "Bakeriet holder stengt på " + WEEKDAYS_PLURAL[d.getDay()] + ". Velg en annen dag."
    );
    input.value = "";
    return false;
  }
  if (v < pickup.earliestDate) {
    setFieldError("pickupDate", "Tidligste hentedag er " + formatDateLong(pickup.earliestDate, false) + ".");
    return false;
  }
  if (v > maxDateIso) {
    setFieldError("pickupDate", "Hentedagen kan være høyst 60 dager frem i tid.");
    return false;
  }
  return true;
}

function setupPickupFields() {
  const dateInput = document.getElementById("pickupDate");
  dateInput.min = pickup.earliestDate;
  const max = new Date();
  max.setDate(max.getDate() + 60);
  maxDateIso = toIsoDate(max);
  dateInput.max = maxDateIso;

  const hint = document.getElementById("dateHint");
  hint.textContent = "Tidligste henting er " + formatDateLong(pickup.earliestDate, false) + ".";

  dateInput.addEventListener("change", () => {
    if (dateInput.value) validateDateField();
    else clearFieldError("pickupDate");
  });

  const slotSel = document.getElementById("pickupSlot");
  slotSel.textContent = "";
  const placeholder = el("option", null, "Velg tidspunkt");
  placeholder.value = "";
  slotSel.appendChild(placeholder);
  for (const slot of pickup.slots) {
    const opt = el("option", null, slot);
    opt.value = slot;
    slotSel.appendChild(opt);
  }
  slotSel.addEventListener("change", () => clearFieldError("pickupSlot"));

  for (const id of ["custName", "custPhone", "custEmail"]) {
    document.getElementById(id).addEventListener("input", () => clearFieldError(id));
  }
}

function validateAll() {
  let firstBad = null;
  const mark = (node) => { if (!firstBad) firstBad = node; };

  const name = document.getElementById("custName");
  clearFieldError("custName");
  if (!name.value.trim()) {
    setFieldError("custName", "Skriv inn navnet ditt.");
    mark(name);
  }

  const phone = document.getElementById("custPhone");
  clearFieldError("custPhone");
  const digits = phone.value.replace(/\D/g, "");
  if (!phone.value.trim()) {
    setFieldError("custPhone", "Skriv inn telefonnummeret ditt.");
    mark(phone);
  } else if (digits.length < 8) {
    setFieldError("custPhone", "Skriv inn et gyldig telefonnummer.");
    mark(phone);
  }

  const email = document.getElementById("custEmail");
  clearFieldError("custEmail");
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) {
    setFieldError("custEmail", "Skriv inn en gyldig e-postadresse.");
    mark(email);
  }

  if (!validateDateField()) mark(document.getElementById("pickupDate"));

  const slot = document.getElementById("pickupSlot");
  clearFieldError("pickupSlot");
  if (!slot.value) {
    setFieldError("pickupSlot", "Velg et hentetidspunkt.");
    mark(slot);
  }

  if (firstBad) {
    firstBad.focus();
    return false;
  }
  return true;
}

function setupPayment() {
  payLabel = "Betal " + formatKr(totalCents) + " med Vipps eller kort (demo)";
  const payBtn = document.getElementById("payBtn");
  payBtn.textContent = payLabel;

  const form = document.getElementById("checkoutForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hidePayError();
    if (!validateAll()) return;

    const payload = {
      customer: {
        name: document.getElementById("custName").value.trim(),
        phone: document.getElementById("custPhone").value.trim(),
        email: document.getElementById("custEmail").value.trim(),
      },
      pickupDate: document.getElementById("pickupDate").value,
      pickupSlot: document.getElementById("pickupSlot").value,
      lines: cart.lines.map((l) => {
        const out = { productId: l.productId, qty: clampQty(l.qty) };
        if (Array.isArray(l.optionIds) && l.optionIds.length) out.optionIds = l.optionIds;
        /* Only send cakeText when the product still allows it; a stale text
           would make the server reject the whole order. */
        const product = productsById.get(l.productId);
        if (l.cakeText && product && product.canHaveCakeText) out.cakeText = l.cakeText;
        return out;
      }),
    };
    const note = document.getElementById("orderNote").value.trim();
    if (note) payload.note = note;

    payBtn.disabled = true;
    payBtn.textContent = "Behandler betaling…";
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 201 && data.order) {
        saveCart({ lines: [] });
        window.location.href = "./checkout.html?order=" + data.order.id;
        return;
      }
      showPayError(data.error || "Noe gikk galt med bestillingen. Prøv igjen.");
    } catch {
      showPayError("Vi fikk ikke kontakt med bakeriet. Sjekk tilkoblingen og prøv igjen.");
    }
    payBtn.disabled = false;
    payBtn.textContent = payLabel;
  });
}

async function initCheckout() {
  hideBoot();
  renderHeaderCount();
  document.getElementById("checkoutView").hidden = false;
  const status = document.getElementById("checkoutStatus");
  status.textContent = "";
  status.appendChild(el("p", "muted", "Laster kassen…"));

  try {
    const [prodRes, shopRes] = await Promise.all([fetch("/api/products"), fetch("/api/shop")]);
    if (!prodRes.ok) throw new Error("products " + prodRes.status);
    const data = await prodRes.json();
    productsById = new Map(data.products.map((p) => [p.id, p]));
    if (shopRes.ok) applyShop((await shopRes.json()).bakery);

    cart = loadCart();
    if (!Array.isArray(cart.lines)) cart.lines = [];
    // Drop stale lines BEFORE asking for pickup options.
    const kept = cart.lines.filter((l) => productsById.has(l.productId));
    if (kept.length !== cart.lines.length) {
      cart.lines = kept;
      saveCart(cart);
    }
    renderHeaderCount();

    if (!cart.lines.length) {
      renderEmptyCheckout();
      return;
    }

    const ids = [...new Set(cart.lines.map((l) => l.productId))].join(",");
    const pickRes = await fetch("/api/pickup-options?products=" + ids);
    if (!pickRes.ok) throw new Error("pickup " + pickRes.status);
    pickup = await pickRes.json();

    renderSummary();
    setupPickupFields();
    setupPayment();
    status.textContent = "";
    document.getElementById("checkoutForm").hidden = false;
  } catch {
    renderCheckoutError();
  }
}

/* Confirmation mode */

function rrow(key, value) {
  const row = el("div", "rrow");
  row.appendChild(el("span", "rkey", key));
  row.appendChild(el("span", "rval", value));
  return row;
}

function renderReceiptError(msg) {
  const box = document.getElementById("receipt");
  box.textContent = "";
  const wrap = el("div", "empty");
  wrap.appendChild(el("h2", null, msg));
  const link = el("a", "btn btn-primary", "Tilbake til butikken");
  link.href = "./index.html";
  wrap.appendChild(link);
  box.appendChild(wrap);
}

function renderConfirmFetchError(id) {
  const box = document.getElementById("receipt");
  box.textContent = "";
  const notice = el("div", "notice card");
  notice.appendChild(el("p", null, "Vi fikk ikke hentet kvitteringen. Sjekk tilkoblingen og prøv igjen."));
  const retry = el("button", "btn", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", () => initConfirmation(id));
  notice.appendChild(retry);
  box.appendChild(notice);
}

function renderReceipt(order) {
  const box = document.getElementById("receipt");
  box.textContent = "";

  const head = el("div", "receipt-head");
  head.appendChild(el("span", "kicker", "Kvittering"));
  head.appendChild(el("h1", null, "Takk for bestillingen."));
  head.appendChild(el("p", "lede", "Bakeren har fått beskjed og setter i gang. Vis frem bestillingsnummeret når du kommer innom."));
  box.appendChild(head);

  const idRow = el("div", "order-id-row");
  idRow.appendChild(el("span", "order-no", "Bestilling " + order.orderNumber));
  idRow.appendChild(el("span", "badge badge-ok", "Demobetaling gjennomført"));
  box.appendChild(idRow);

  const pick = el("section", "receipt-sec");
  pick.appendChild(el("h2", "rlabel", "Henting"));
  pick.appendChild(rrow("Dag", formatDateLong(order.pickupDate, true)));
  pick.appendChild(rrow("Tidspunkt", "kl. " + order.pickupSlot));
  if (bakery) pick.appendChild(rrow("Sted", bakery.name + ", " + bakery.address));
  if (order.note) pick.appendChild(rrow("Kommentar", order.note));
  box.appendChild(pick);

  const linesSec = el("section", "receipt-sec");
  linesSec.appendChild(el("h2", "rlabel", "Bestillingen"));
  for (const ln of order.lines) {
    const item = el("div", "r-line");
    const top = el("div", "leader");
    top.appendChild(el("span", "r-line-name", ln.qty + " × " + ln.productName));
    top.appendChild(el("span", "dots"));
    top.appendChild(el("span", "price", formatKr(ln.lineTotalCents)));
    item.appendChild(top);

    const metaParts = (ln.options || []).map((o) => o.group + ": " + o.value);
    if (metaParts.length) item.appendChild(el("p", "r-line-meta muted", metaParts.join(" · ")));
    if (ln.cakeText) item.appendChild(el("p", "r-line-meta muted", "Kaketekst: «" + ln.cakeText + "»"));
    if (ln.qty > 1) item.appendChild(el("p", "r-line-meta muted", formatKr(ln.unitPriceCents) + " per stk"));
    linesSec.appendChild(item);
  }
  const totalRow = el("div", "leader r-total");
  totalRow.appendChild(el("span", "total-label", "Totalt"));
  totalRow.appendChild(el("span", "dots"));
  totalRow.appendChild(el("span", "price total-price", formatKr(order.totalCents)));
  linesSec.appendChild(totalRow);
  linesSec.appendChild(el("p", "muted vat-note", "inkl. mva"));
  box.appendChild(linesSec);

  const contact = el("section", "receipt-sec");
  contact.appendChild(el("h2", "rlabel", "Kontakt"));
  contact.appendChild(rrow("Navn", order.customer.name));
  contact.appendChild(rrow("Telefon", order.customer.phone));
  contact.appendChild(rrow("E-post", order.customer.email));
  box.appendChild(contact);

  const pay = el("section", "receipt-sec");
  pay.appendChild(el("h2", "rlabel", "Betaling"));
  pay.appendChild(rrow("Betalingsmåte", "Vipps eller kort (demo)"));
  pay.appendChild(rrow("Referanse", order.paymentReference));
  pay.appendChild(rrow("Bestilt", order.createdAt));
  box.appendChild(pay);

  const actions = el("div", "receipt-actions");
  const back = el("a", "btn btn-primary", "Tilbake til butikken");
  back.href = "./index.html";
  actions.appendChild(back);
  box.appendChild(actions);
}

async function initConfirmation(id) {
  hideBoot();
  renderHeaderCount();
  document.title = "Kvittering - Bakeriet på Hjørnet";
  document.getElementById("confirmView").hidden = false;
  const box = document.getElementById("receipt");
  box.textContent = "";
  box.appendChild(el("p", "muted", "Henter kvitteringen…"));

  try {
    const [orderRes, shopRes] = await Promise.all([
      fetch("/api/orders/" + encodeURIComponent(id)),
      fetch("/api/shop"),
    ]);
    if (shopRes.ok) applyShop((await shopRes.json()).bakery);
    const data = await orderRes.json().catch(() => ({}));
    if (!orderRes.ok || !data.order) {
      renderReceiptError(data.error || "Vi fant ikke denne bestillingen.");
      return;
    }
    renderReceipt(data.order);
  } catch {
    renderConfirmFetchError(id);
  }
}

const orderParam = new URLSearchParams(window.location.search).get("order");
if (orderParam) initConfirmation(orderParam);
else initCheckout();
