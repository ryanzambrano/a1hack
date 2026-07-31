// Variant A "Håndverk" cart page.
// Resolves the shared localStorage cart against /api/products, silently drops
// lines whose product no longer exists, and lets the customer adjust
// quantities (1-50) before continuing to checkout.

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

const content = document.getElementById("cartContent");
const badge = document.getElementById("cartBadge");

let cart = loadCart();
let products = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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

function updateBadge() {
  const count = cartCount(cart);
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function dropStaleLines() {
  const kept = cart.lines.filter((l) => l && productById(l.productId));
  if (kept.length !== cart.lines.length) {
    cart = { lines: kept };
    saveCart(cart);
  }
}

function cartTotalCents() {
  let total = 0;
  for (const line of cart.lines) {
    const product = productById(line.productId);
    const options = optionsForLine(product, line);
    total += unitPriceCents(product, line, options) * lineQty(line);
  }
  return total;
}

function changeQty(index, delta) {
  const line = cart.lines[index];
  if (!line) return;
  line.qty = Math.max(1, Math.min(MAX_QTY, lineQty(line) + delta));
  saveCart(cart);
  render();
}

function removeLine(index) {
  cart.lines.splice(index, 1);
  saveCart(cart);
  render();
}

function renderLine(line, index) {
  const product = productById(line.productId);
  const options = optionsForLine(product, line);
  const unit = unitPriceCents(product, line, options);
  const qty = lineQty(line);

  const card = el("article", "cart-line card");

  const img = document.createElement("img");
  img.className = "line-img";
  if (product.imageUrl) img.src = product.imageUrl;
  img.alt = product.name;
  card.appendChild(img);

  const info = el("div", "line-info");
  info.appendChild(el("h3", "line-name", product.name));
  if (options.length) {
    info.appendChild(el("p", "line-opts", options.map((o) => o.value).join(" · ")));
  }
  if (line.cakeText && product.canHaveCakeText) {
    info.appendChild(el("p", "line-caketext", "Tekst på kaken: «" + line.cakeText + "»"));
  }
  info.appendChild(el("p", "line-unit", formatKr(unit) + " per stk"));
  card.appendChild(info);

  const controls = el("div", "line-controls");

  const stepper = el("div", "qty-stepper");
  const minus = el("button", "qty-btn", "-");
  minus.type = "button";
  minus.setAttribute("aria-label", "Reduser antall " + product.name);
  minus.disabled = qty <= 1;
  minus.addEventListener("click", () => changeQty(index, -1));
  const qtyValue = el("span", "qty-value", String(qty));
  const plus = el("button", "qty-btn", "+");
  plus.type = "button";
  plus.setAttribute("aria-label", "Øk antall " + product.name);
  plus.disabled = qty >= MAX_QTY;
  plus.addEventListener("click", () => changeQty(index, 1));
  stepper.append(minus, qtyValue, plus);
  controls.appendChild(stepper);

  const right = el("div", "line-right");
  right.appendChild(el("span", "price", formatKr(unit * qty)));
  const remove = el("button", "remove-btn", "Fjern");
  remove.type = "button";
  remove.setAttribute("aria-label", "Fjern " + product.name + " fra handlekurven");
  remove.addEventListener("click", () => removeLine(index));
  right.appendChild(remove);
  controls.appendChild(right);

  card.appendChild(controls);
  return card;
}

function renderSummary() {
  const box = el("section", "cart-summary card");
  box.setAttribute("aria-label", "Oppsummering");

  const row = el("div", "summary-row");
  row.appendChild(el("span", "summary-label", "Totalt"));
  row.appendChild(el("span", "price summary-total", formatKr(cartTotalCents())));
  box.appendChild(row);
  box.appendChild(el("p", "vat-note", "inkl. mva"));

  if (cart.lines.length > MAX_ORDER_LINES) {
    box.appendChild(el("p", "limit-note", "En bestilling kan ha maks 30 varelinjer. Fjern noen varer før du går til kassen."));
    const blocked = el("button", "btn btn-primary summary-cta", "Til kassen");
    blocked.type = "button";
    blocked.disabled = true;
    box.appendChild(blocked);
  } else {
    const cta = el("a", "btn btn-primary summary-cta", "Til kassen");
    cta.href = "./checkout.html";
    box.appendChild(cta);
  }

  const back = el("a", "summary-back", "Fortsett å handle");
  back.href = "./index.html";
  box.appendChild(back);
  return box;
}

function renderEmpty() {
  const box = el("section", "cart-empty card");
  box.appendChild(el("h2", null, "Handlekurven din er tom"));
  box.appendChild(el("p", "muted", "Kom innom og se hva vi har bakt i dag."));
  const link = el("a", "btn btn-primary", "Til butikken");
  link.href = "./index.html";
  box.appendChild(link);
  content.appendChild(box);
}

function renderError() {
  content.textContent = "";
  const box = el("section", "cart-state card");
  box.appendChild(el("p", null, "Vi fikk ikke lastet handlekurven akkurat nå. Sjekk tilkoblingen din."));
  const retry = el("button", "btn", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", init);
  box.appendChild(retry);
  content.appendChild(box);
}

function render() {
  content.textContent = "";
  updateBadge();
  if (cart.lines.length === 0) {
    renderEmpty();
    return;
  }
  const list = el("section", "cart-lines");
  list.setAttribute("aria-label", "Varer i handlekurven");
  cart.lines.forEach((line, index) => list.appendChild(renderLine(line, index)));
  content.appendChild(list);
  content.appendChild(renderSummary());
}

async function init() {
  content.textContent = "";
  content.appendChild(el("p", "muted", "Henter handlekurven..."));
  updateBadge();
  try {
    const res = await fetch("/api/products");
    if (!res.ok) throw new Error("http " + res.status);
    const data = await res.json();
    products = data.products || [];
  } catch {
    renderError();
    return;
  }
  dropStaleLines();
  render();
}

async function loadShopIntoChrome() {
  try {
    const res = await fetch("/api/shop");
    if (!res.ok) return;
    const data = await res.json();
    const bakery = data.bakery;
    if (!bakery) return;
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

loadShopIntoChrome();
init();
