// Variant B "Stram" - checkout + confirmation page.
// Without ?order= : summary, customer form, pickup constraints, demo payment.
// With ?order=<id> : fetches the order and renders the receipt.

const CART_KEY = "bakeri_cart_v1";

export function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || { lines: [] }; }
  catch { return { lines: [] }; }
}
export function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
export function cartCount(cart) { return cart.lines.reduce((n, l) => n + l.qty, 0); }
export function formatKr(cents) {
  const kr = cents / 100;
  return "kr " + (Number.isInteger(kr) ? kr : kr.toFixed(2).replace(".", ","));
}

const root = document.getElementById("checkout-root");

const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

let productsById = new Map();
let cart = { lines: [] };
let pickup = null;

// Small DOM builder so all user text goes through textContent (no HTML injection).
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child != null) node.append(child);
  }
  return node;
}

function updateBadge() {
  const badge = document.getElementById("cart-badge");
  if (!badge) return;
  const count = cartCount(loadCart());
  badge.textContent = String(count);
  badge.classList.toggle("has-items", count > 0);
}

function weekdayOfISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function formatDateNo(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("nb-NO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(y, m - 1, d));
}

function plusDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function effectiveOptions(product, optionIds) {
  const ids = Array.isArray(optionIds) ? optionIds : [];
  const chosen = [];
  for (const group of product.optionGroups || []) {
    let sel = group.options.find((o) => ids.includes(o.id));
    if (!sel) sel = group.options.find((o) => o.isDefault) || group.options[0];
    if (sel) chosen.push({ group: group.name, value: sel.value, priceDeltaCents: sel.priceDeltaCents });
  }
  return chosen;
}

function unitPriceCents(product, line) {
  let cents = product.basePriceCents;
  for (const opt of effectiveOptions(product, line.optionIds)) cents += opt.priceDeltaCents;
  if (product.canHaveCakeText && line.cakeText) cents += product.cakeTextPriceCents;
  return cents;
}

function orderTotalCents() {
  return cart.lines.reduce((sum, line) => {
    const product = productsById.get(line.productId);
    return product ? sum + unitPriceCents(product, line) * line.qty : sum;
  }, 0);
}

function showFatal(message, retry) {
  root.textContent = "";
  root.append(el("p", { text: message }));
  if (retry) root.append(el("button", { class: "btn", type: "button", text: "Prøv igjen", onclick: retry }));
}

/* ---------------- checkout mode ---------------- */

function fieldRow(id, labelText, input) {
  input.id = id;
  return el("div", { class: "field" }, [
    el("label", { for: id, text: labelText }),
    input,
    el("p", { class: "field-error", id: id + "-error", hidden: "" }),
  ]);
}

function setFieldError(id, message) {
  const err = document.getElementById(id + "-error");
  const input = document.getElementById(id);
  if (!err) return;
  if (message) {
    err.textContent = message;
    err.hidden = false;
    if (input) input.setAttribute("aria-invalid", "true");
  } else {
    err.textContent = "";
    err.hidden = true;
    if (input) input.removeAttribute("aria-invalid");
  }
}

function renderSummary() {
  const list = el("ul", { class: "sum-lines" });
  for (const line of cart.lines) {
    const product = productsById.get(line.productId);
    const options = effectiveOptions(product, line.optionIds);
    list.append(
      el("li", { class: "sum-line" }, [
        el("div", { class: "sum-line-head" }, [
          el("span", { text: line.qty + " × " + product.name }),
          el("span", { class: "price", text: formatKr(unitPriceCents(product, line) * line.qty) }),
        ]),
        options.length
          ? el("p", { class: "sum-meta muted", text: options.map((o) => o.value).join(", ") })
          : null,
        line.cakeText
          ? el("p", { class: "sum-meta muted", text: "Kaketekst: «" + line.cakeText + "»" })
          : null,
      ])
    );
  }

  return el("aside", { class: "checkout-summary card", "aria-label": "Bestillingssammendrag" }, [
    el("span", { class: "label", text: "01 Bestilling" }),
    list,
    el("div", { class: "sum-total" }, [
      el("span", { class: "label totals-label", text: "Totalt" }),
      el("span", { class: "price total-price", text: formatKr(orderTotalCents()) }),
      el("p", { class: "muted vat-note", text: "inkl. mva" }),
    ]),
    el("a", { class: "edit-link", href: "./cart.html", text: "Endre kurv" }),
  ]);
}

function validateForm(values) {
  let firstBad = null;
  const fail = (id, message) => {
    setFieldError(id, message);
    if (!firstBad) firstBad = id;
  };

  ["c-name", "c-phone", "c-email", "c-date", "c-slot"].forEach((id) => setFieldError(id, null));

  if (!values.name) fail("c-name", "Skriv inn navn.");

  const phoneDigits = values.phone.replace(/[^\d]/g, "");
  if (!values.phone) fail("c-phone", "Skriv inn telefonnummer.");
  else if (phoneDigits.length < 8) fail("c-phone", "Skriv inn et gyldig telefonnummer.");

  if (!values.email) fail("c-email", "Skriv inn e-postadresse.");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) fail("c-email", "Skriv inn en gyldig e-postadresse.");

  if (!values.pickupDate) {
    fail("c-date", "Velg hentedato.");
  } else if (pickup.closedWeekdays.includes(weekdayOfISO(values.pickupDate))) {
    fail("c-date", "Bakeriet er stengt på " + WEEKDAYS[weekdayOfISO(values.pickupDate)] + "er. Velg en annen dato.");
  } else if (values.pickupDate < pickup.earliestDate) {
    fail("c-date", "Tidligste hentedato er " + formatDateNo(pickup.earliestDate) + ".");
  } else if (values.pickupDate > plusDaysISO(60)) {
    fail("c-date", "Hentedato kan være maks 60 dager frem i tid.");
  }

  if (!values.pickupSlot) fail("c-slot", "Velg hentetidspunkt.");

  if (firstBad) {
    const input = document.getElementById(firstBad);
    if (input) input.focus();
    return false;
  }
  return true;
}

async function submitOrder(values, payBtn, payBtnText) {
  const payload = {
    customer: { name: values.name, phone: values.phone, email: values.email },
    pickupDate: values.pickupDate,
    pickupSlot: values.pickupSlot,
    lines: cart.lines.map((line) => {
      const out = { productId: line.productId, qty: line.qty };
      if (Array.isArray(line.optionIds) && line.optionIds.length) out.optionIds = line.optionIds;
      if (line.cakeText) out.cakeText = line.cakeText;
      return out;
    }),
  };
  if (values.note) payload.note = values.note;

  payBtn.disabled = true;
  payBtn.textContent = "Behandler betaling ...";
  setFieldError("c-pay", null);

  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 201 && data.order) {
      saveCart({ lines: [] });
      location.href = "./checkout.html?order=" + encodeURIComponent(data.order.id);
      return;
    }
    setFieldError("c-pay", data.error || "Noe gikk galt. Prøv igjen.");
  } catch {
    setFieldError("c-pay", "Fikk ikke kontakt med serveren. Prøv igjen.");
  }
  payBtn.disabled = false;
  payBtn.textContent = payBtnText;
}

function renderCheckout() {
  root.textContent = "";
  updateBadge();

  const heading = el("div", { class: "page-head" }, [
    el("p", { class: "label", text: "Kasse" }),
    el("h1", { text: "Kasse" }),
  ]);

  // Contact fields
  const nameInput = el("input", { type: "text", name: "name", autocomplete: "name" });
  const phoneInput = el("input", { type: "tel", name: "phone", autocomplete: "tel" });
  const emailInput = el("input", { type: "email", name: "email", autocomplete: "email" });

  // Pickup fields
  const dateInput = el("input", {
    type: "date", name: "pickupDate",
    min: pickup.earliestDate, max: plusDaysISO(60), value: pickup.earliestDate,
  });
  dateInput.addEventListener("change", () => {
    if (!dateInput.value) return;
    const day = weekdayOfISO(dateInput.value);
    if (pickup.closedWeekdays.includes(day)) {
      setFieldError("c-date", "Bakeriet er stengt på " + WEEKDAYS[day] + "er. Velg en annen dato.");
      dateInput.value = "";
    } else {
      setFieldError("c-date", null);
    }
  });

  const slotSelect = el("select", { name: "pickupSlot" }, [
    el("option", { value: "", text: "Velg tidspunkt" }),
    ...pickup.slots.map((slot) => el("option", { value: slot, text: slot })),
  ]);

  const noteInput = el("textarea", { name: "note", maxlength: "500", rows: "3" });

  const payBtnText = "Betal " + formatKr(orderTotalCents()) + " med Vipps eller kort (demo)";
  const payBtn = el("button", { type: "submit", class: "btn btn-primary pay-btn", text: payBtnText });

  const form = el("form", { class: "checkout-form", novalidate: "" }, [
    el("section", { class: "form-section" }, [
      el("span", { class: "label", text: "02 Kontakt" }),
      fieldRow("c-name", "Navn", nameInput),
      fieldRow("c-phone", "Telefon", phoneInput),
      fieldRow("c-email", "E-post", emailInput),
    ]),
    el("section", { class: "form-section" }, [
      el("span", { class: "label", text: "03 Henting" }),
      el("p", { class: "muted pickup-note", text: "Tidligste henting er " + formatDateNo(pickup.earliestDate) + "." }),
      fieldRow("c-date", "Hentedato", dateInput),
      fieldRow("c-slot", "Hentetidspunkt", slotSelect),
      fieldRow("c-note", "Kommentar til bakeriet (valgfritt)", noteInput),
    ]),
    el("section", { class: "form-section pay-panel" }, [
      el("span", { class: "label", text: "04 Betaling (demo)" }),
      el("p", { class: "muted pay-note", text: "Dette er en demo. Ingen ekte betaling blir gjennomført." }),
      el("p", { class: "field-error", id: "c-pay-error", hidden: "", role: "alert" }),
      payBtn,
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = {
      name: nameInput.value.trim(),
      phone: phoneInput.value.trim(),
      email: emailInput.value.trim(),
      pickupDate: dateInput.value,
      pickupSlot: slotSelect.value,
      note: noteInput.value.trim(),
    };
    setFieldError("c-pay", null);
    if (cart.lines.length > 30) {
      setFieldError("c-pay", "En bestilling kan ha maks 30 linjer. Fjern noen varer fra kurven.");
      return;
    }
    if (!validateForm(values)) return;
    submitOrder(values, payBtn, payBtnText);
  });

  const grid = el("div", { class: "checkout-grid" }, [renderSummary(), form]);
  root.append(heading, grid);
}

function renderEmptyCheckout() {
  root.textContent = "";
  updateBadge();
  root.append(
    el("p", { class: "label", text: "Kasse" }),
    el("h1", { text: "Kasse" }),
    el("div", { class: "empty-state" }, [
      el("p", { text: "Kurven er tom. Legg til varer før du går til kassen." }),
      el("a", { class: "btn", href: "./index.html", text: "Gå til butikken" }),
    ])
  );
}

async function checkoutMode() {
  document.title = "Kasse - Bakeriet på Hjørnet";
  root.textContent = "";
  root.append(el("p", { class: "muted", text: "Laster kassen ..." }));
  updateBadge();

  let data;
  try {
    const res = await fetch("/api/products");
    if (!res.ok) throw new Error("http " + res.status);
    data = await res.json();
  } catch {
    showFatal("Kunne ikke laste kassen. Sjekk nettverket og prøv igjen.", checkoutMode);
    return;
  }

  productsById = new Map(data.products.map((p) => [p.id, p]));
  cart = loadCart();

  // Drop stale lines BEFORE asking for pickup options; sanitize quantities.
  const kept = cart.lines
    .filter((l) => l && productsById.has(l.productId))
    .map((l) => ({ ...l, qty: Math.max(1, Math.min(50, parseInt(l.qty, 10) || 1)) }));
  const dropped = kept.length !== cart.lines.length;
  cart = { lines: kept };
  if (dropped) saveCart(cart);

  if (!cart.lines.length) {
    renderEmptyCheckout();
    return;
  }

  const ids = [...new Set(cart.lines.map((l) => l.productId))].join(",");
  try {
    const res = await fetch("/api/pickup-options?products=" + encodeURIComponent(ids));
    if (!res.ok) throw new Error("http " + res.status);
    pickup = await res.json();
  } catch {
    showFatal("Kunne ikke hente informasjon om henting. Prøv igjen.", checkoutMode);
    return;
  }

  renderCheckout();
}

/* ---------------- confirmation mode ---------------- */

function receiptLine(line) {
  return el("li", { class: "receipt-line" }, [
    el("div", { class: "receipt-line-head" }, [
      el("span", { text: line.qty + " × " + line.productName }),
      el("span", { class: "price", text: formatKr(line.lineTotalCents) }),
    ]),
    ...line.options.map((o) =>
      el("p", { class: "sum-meta muted", text: o.group + ": " + o.value })
    ),
    line.cakeText
      ? el("p", { class: "sum-meta muted", text: "Kaketekst: «" + line.cakeText + "»" })
      : null,
    line.qty > 1
      ? el("p", { class: "sum-meta muted", text: formatKr(line.unitPriceCents) + " per stk" })
      : null,
  ]);
}

function renderReceipt(order, shop) {
  root.textContent = "";
  updateBadge();

  const bakery = shop && shop.bakery ? shop.bakery : null;

  root.append(
    el("div", { class: "page-head" }, [
      el("p", { class: "label", text: "Bestilling " + order.orderNumber }),
      el("h1", { text: "Takk. Bestillingen er mottatt." }),
      el("p", { class: "muted", text: "Bakeriet har fått bestillingen og gjør den klar til avtalt tid." }),
      el("span", { class: "badge badge-ok", text: "Demobetaling gjennomført" }),
    ]),
    el("section", { class: "receipt-section" }, [
      el("span", { class: "label", text: "Henting" }),
      el("p", { class: "receipt-strong", text: formatDateNo(order.pickupDate) + ", kl " + order.pickupSlot }),
      bakery ? el("p", { text: bakery.name }) : null,
      bakery ? el("p", { class: "muted", text: bakery.address }) : null,
    ]),
    el("section", { class: "receipt-section" }, [
      el("span", { class: "label", text: "Innhold" }),
      el("ul", { class: "receipt-lines" }, order.lines.map(receiptLine)),
      el("div", { class: "sum-total" }, [
        el("span", { class: "label totals-label", text: "Totalt" }),
        el("span", { class: "price total-price", text: formatKr(order.totalCents) }),
        el("p", { class: "muted vat-note", text: "inkl. mva" }),
      ]),
    ]),
    order.note
      ? el("section", { class: "receipt-section" }, [
          el("span", { class: "label", text: "Kommentar" }),
          el("p", { text: order.note }),
        ])
      : null,
    el("section", { class: "receipt-section" }, [
      el("span", { class: "label", text: "Kontakt" }),
      el("p", { text: order.customer.name }),
      el("p", { class: "muted", text: order.customer.phone }),
      el("p", { class: "muted", text: order.customer.email }),
    ]),
    el("section", { class: "receipt-section" }, [
      el("span", { class: "label", text: "Betaling" }),
      el("p", { text: "Vipps eller kort (demo). Ingen ekte betaling er gjennomført." }),
      el("p", { class: "muted", text: "Referanse: " + order.paymentReference }),
    ]),
    el("div", { class: "receipt-actions" }, [
      el("a", { class: "btn", href: "./index.html", text: "Tilbake til butikken" }),
    ])
  );
}

async function confirmationMode(orderId) {
  document.title = "Kvittering - Bakeriet på Hjørnet";
  root.textContent = "";
  root.append(el("p", { class: "muted", text: "Laster kvitteringen ..." }));
  updateBadge();

  let order = null;
  let shop = null;
  try {
    const [orderRes, shopRes] = await Promise.all([
      fetch("/api/orders/" + encodeURIComponent(orderId)),
      fetch("/api/shop"),
    ]);
    if (orderRes.status === 404) {
      root.textContent = "";
      root.append(
        el("h1", { text: "Fant ikke bestillingen" }),
        el("p", { class: "muted", text: "Bestillingen finnes ikke eller lenken er feil." }),
        el("a", { class: "btn", href: "./index.html", text: "Tilbake til butikken" })
      );
      return;
    }
    if (!orderRes.ok) throw new Error("http " + orderRes.status);
    order = (await orderRes.json()).order;
    if (shopRes.ok) shop = await shopRes.json();
  } catch {
    showFatal("Kunne ikke laste kvitteringen. Prøv igjen.", () => confirmationMode(orderId));
    return;
  }

  renderReceipt(order, shop);
}

const orderParam = new URLSearchParams(location.search).get("order");
if (orderParam) confirmationMode(orderParam);
else checkoutMode();
