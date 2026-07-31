// Variant C "Tidsskrift" cart page. All user-facing copy is Norwegian bokmål.

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

let cart = { lines: [] };
let productsById = new Map();
let lastTotalCents = 0;

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

/* Announce cart changes through a small live region instead of re-reading
   the whole re-rendered cart to screen readers. */
function announceUpdate() {
  const node = document.getElementById("cartLive");
  if (!node) return;
  node.textContent = cart.lines.length
    ? "Handlekurven er oppdatert. Totalt " + formatKr(lastTotalCents) + "."
    : "Handlekurven er tom.";
}

function applyShop(bakery) {
  if (!bakery) return;
  const brand = document.getElementById("brandName");
  if (brand && bakery.name) brand.textContent = bakery.name;
  const foot = document.getElementById("shopFooter");
  if (foot) foot.textContent = bakery.name + " · " + bakery.address + " · " + bakery.phone;
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

function setQty(idx, n) {
  cart.lines[idx].qty = clampQty(n);
  saveCart(cart);
  render();
  renderHeaderCount();
  announceUpdate();
}

function removeLine(idx) {
  cart.lines.splice(idx, 1);
  saveCart(cart);
  render();
  renderHeaderCount();
  announceUpdate();
}

function renderLine(line, idx) {
  const product = productsById.get(line.productId);
  const unit = unitPriceCents(product, line);
  const row = el("article", "cart-line");

  const img = el("img");
  img.src = product.imageUrl;
  img.alt = product.name;
  img.width = 76;
  img.height = 76;
  row.appendChild(img);

  const info = el("div", "line-info");
  info.appendChild(el("h3", "line-name", product.name));
  const opts = optionSummary(product, line);
  if (opts) info.appendChild(el("p", "line-meta muted", opts));
  if (line.cakeText && product.canHaveCakeText) {
    info.appendChild(el("p", "line-caketext", "Kaketekst: «" + line.cakeText + "»"));
  }
  info.appendChild(el("p", "line-unit muted", formatKr(unit) + " per stk"));
  row.appendChild(info);

  const right = el("div", "line-right");
  right.appendChild(el("p", "price line-total", formatKr(unit * line.qty)));

  const qty = el("div", "qty");
  const minus = el("button", "qty-btn", "-");
  minus.type = "button";
  minus.setAttribute("aria-label", "Reduser antall");
  minus.addEventListener("click", () => setQty(idx, cart.lines[idx].qty - 1));
  const input = el("input", "qty-input");
  input.type = "number";
  input.min = String(QTY_MIN);
  input.max = String(QTY_MAX);
  input.value = String(line.qty);
  input.setAttribute("aria-label", "Antall");
  input.addEventListener("change", () => setQty(idx, input.value));
  const plus = el("button", "qty-btn", "+");
  plus.type = "button";
  plus.setAttribute("aria-label", "Øk antall");
  plus.addEventListener("click", () => setQty(idx, cart.lines[idx].qty + 1));
  qty.appendChild(minus);
  qty.appendChild(input);
  qty.appendChild(plus);
  right.appendChild(qty);

  const remove = el("button", "remove-btn", "Fjern");
  remove.type = "button";
  remove.addEventListener("click", () => removeLine(idx));
  right.appendChild(remove);

  row.appendChild(right);
  return row;
}

function render() {
  const main = document.getElementById("cartMain");
  main.textContent = "";

  if (!cart.lines.length) {
    lastTotalCents = 0;
    const empty = el("div", "empty");
    empty.appendChild(el("h2", null, "Handlekurven er tom."));
    empty.appendChild(el("p", "muted", "Dagens utvalg venter i butikken."));
    const link = el("a", "btn btn-primary", "Til butikken");
    link.href = "./index.html";
    empty.appendChild(link);
    main.appendChild(empty);
    return;
  }

  const list = el("div", "cart-lines");
  cart.lines.forEach((line, idx) => list.appendChild(renderLine(line, idx)));
  main.appendChild(list);

  const totalCents = cart.lines.reduce(
    (sum, l) => sum + unitPriceCents(productsById.get(l.productId), l) * l.qty,
    0
  );
  lastTotalCents = totalCents;
  const totals = el("div", "totals");
  const row = el("div", "leader total-row");
  row.appendChild(el("span", "total-label", "Totalt"));
  row.appendChild(el("span", "dots"));
  row.appendChild(el("span", "price total-price", formatKr(totalCents)));
  totals.appendChild(row);
  totals.appendChild(el("p", "muted vat-note", "inkl. mva"));
  main.appendChild(totals);

  const cta = el("div", "cta-row");
  const back = el("a", "keep-shopping", "Fortsett å handle");
  back.href = "./index.html";
  cta.appendChild(back);
  const go = el("a", "btn btn-primary", "Til kassen");
  go.href = "./checkout.html";
  cta.appendChild(go);
  main.appendChild(cta);
}

function renderLoadError() {
  const main = document.getElementById("cartMain");
  main.textContent = "";
  const box = el("div", "notice card");
  box.appendChild(el("p", null, "Vi fikk ikke lastet handlekurven. Sjekk tilkoblingen og prøv igjen."));
  const retry = el("button", "btn", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", init);
  box.appendChild(retry);
  main.appendChild(box);
}

async function init() {
  renderHeaderCount();
  const main = document.getElementById("cartMain");
  main.textContent = "";
  main.appendChild(el("p", "muted", "Laster handlekurven…"));
  try {
    const [prodRes, shopRes] = await Promise.all([fetch("/api/products"), fetch("/api/shop")]);
    if (!prodRes.ok) throw new Error("products " + prodRes.status);
    const data = await prodRes.json();
    productsById = new Map(data.products.map((p) => [p.id, p]));
    if (shopRes.ok) {
      const shopData = await shopRes.json();
      applyShop(shopData.bakery);
    }

    cart = loadCart();
    if (!Array.isArray(cart.lines)) cart.lines = [];
    // Silently drop lines whose product no longer exists, and clamp quantities.
    const before = JSON.stringify(cart.lines);
    cart.lines = cart.lines
      .filter((l) => productsById.has(l.productId))
      .map((l) => ({ ...l, qty: clampQty(l.qty) }));
    if (JSON.stringify(cart.lines) !== before) saveCart(cart);

    render();
    renderHeaderCount();
  } catch {
    renderLoadError();
  }
}

init();
