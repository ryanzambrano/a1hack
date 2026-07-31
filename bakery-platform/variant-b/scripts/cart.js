// Variant B "Stram" - cart page.
// Resolves cart lines against /api/products, drops stale lines, and lets
// the customer adjust quantities (1-50) before going to checkout.

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

const root = document.getElementById("cart-root");
const subEl = document.getElementById("cart-sub");

let productsById = new Map();
let cart = { lines: [] };
let totalPriceEl = null;

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

// For each option group: the selected option if the line names one, otherwise
// the group default. Mirrors how the server resolves options at order time.
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

function updateSub() {
  const count = cartCount(cart);
  subEl.textContent = count === 0 ? "" : count === 1 ? "1 vare" : count + " varer";
}

function updateTotals() {
  if (totalPriceEl) totalPriceEl.textContent = formatKr(orderTotalCents());
  updateSub();
  updateBadge();
}

function setQty(idx, qty, update) {
  cart.lines[idx].qty = Math.max(1, Math.min(50, qty));
  saveCart(cart);
  update();
  updateTotals();
}

function removeLine(idx) {
  cart.lines.splice(idx, 1);
  saveCart(cart);
  render();
}

function renderLine(line, idx) {
  const product = productsById.get(line.productId);
  const options = effectiveOptions(product, line.optionIds);
  const unit = unitPriceCents(product, line);

  const info = el("div", { class: "line-info" }, [
    el("a", { class: "line-name", href: "./product.html?id=" + product.id, text: product.name }),
    options.length
      ? el("p", { class: "line-meta muted", text: options.map((o) => o.value).join(", ") })
      : null,
    line.cakeText
      ? el("p", { class: "line-meta muted", text: "Kaketekst: «" + line.cakeText + "»" })
      : null,
    el("p", { class: "line-meta muted", text: formatKr(unit) + " per stk" }),
  ]);

  const qtyValue = el("span", { class: "qty-value", "aria-live": "polite", text: String(line.qty) });
  const minusBtn = el("button", { type: "button", class: "qty-btn", "aria-label": "Reduser antall", text: "−" });
  const plusBtn = el("button", { type: "button", class: "qty-btn", "aria-label": "Øk antall", text: "+" });
  const lineTotal = el("span", { class: "price line-total", text: formatKr(unit * line.qty) });

  function update() {
    qtyValue.textContent = String(line.qty);
    minusBtn.disabled = line.qty <= 1;
    plusBtn.disabled = line.qty >= 50;
    lineTotal.textContent = formatKr(unit * line.qty);
  }
  minusBtn.addEventListener("click", () => setQty(idx, line.qty - 1, update));
  plusBtn.addEventListener("click", () => setQty(idx, line.qty + 1, update));
  update();

  const controls = el("div", { class: "line-controls" }, [
    el("div", { class: "qty" }, [minusBtn, qtyValue, plusBtn]),
    el("button", {
      type: "button",
      class: "remove-btn",
      text: "Fjern",
      "aria-label": "Fjern " + product.name + " fra kurven",
      onclick: () => removeLine(idx),
    }),
  ]);

  return el("li", { class: "cart-line" }, [
    el("img", { class: "line-img", src: product.imageUrl, alt: product.name, width: "64", height: "64" }),
    info,
    controls,
    el("div", { class: "line-total-wrap" }, [lineTotal]),
  ]);
}

function renderEmpty() {
  root.append(
    el("div", { class: "empty-state" }, [
      el("p", { text: "Kurven er tom." }),
      el("a", { class: "btn", href: "./index.html", text: "Gå til butikken" }),
    ])
  );
}

function render() {
  root.textContent = "";
  totalPriceEl = null;
  updateBadge();
  updateSub();

  if (!cart.lines.length) {
    renderEmpty();
    return;
  }

  const list = el("ul", { class: "cart-lines" });
  cart.lines.forEach((line, idx) => list.append(renderLine(line, idx)));

  totalPriceEl = el("span", { class: "price total-price", text: formatKr(orderTotalCents()) });
  const totals = el("div", { class: "totals" }, [
    el("span", { class: "label totals-label", text: "Totalt" }),
    totalPriceEl,
    el("p", { class: "muted vat-note", text: "inkl. mva" }),
  ]);

  const actions = el("div", { class: "cart-actions" }, [
    el("a", { class: "continue-link", href: "./index.html", text: "Fortsett å handle" }),
    el("a", { class: "btn btn-primary checkout-cta", href: "./checkout.html", text: "Til kassen" }),
  ]);

  root.append(list, totals, actions);
}

function showError() {
  root.textContent = "";
  root.append(
    el("p", { text: "Kunne ikke laste kurven. Sjekk nettverket og prøv igjen." }),
    el("button", { class: "btn", type: "button", text: "Prøv igjen", onclick: init })
  );
}

async function init() {
  root.textContent = "";
  root.append(el("p", { class: "muted", text: "Laster kurven ..." }));
  updateBadge();

  let data;
  try {
    const res = await fetch("/api/products");
    if (!res.ok) throw new Error("http " + res.status);
    data = await res.json();
  } catch {
    showError();
    return;
  }

  productsById = new Map(data.products.map((p) => [p.id, p]));
  cart = loadCart();

  // Drop lines whose product no longer exists; sanitize quantities to 1-50.
  const kept = cart.lines
    .filter((l) => l && productsById.has(l.productId))
    .map((l) => ({ ...l, qty: Math.max(1, Math.min(50, parseInt(l.qty, 10) || 1)) }));
  const changed = kept.length !== cart.lines.length ||
    kept.some((l, i) => l.qty !== cart.lines[i].qty);
  cart = { lines: kept };
  if (changed) saveCart(cart);

  render();
}

init();
