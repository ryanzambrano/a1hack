// Cart page script for the app (Daymaker System).
// Resolves cart lines against /api/products; stale lines are dropped silently.

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

const root = document.getElementById("cart-root");
const badge = document.getElementById("cart-badge");

let orderTotalEl = null;

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

// Footer contact line from /api/shop (non-blocking, non-fatal).
function fillFooter(bakery) {
  const target = document.getElementById("footer-contact");
  if (!target || !bakery) return;
  target.textContent = bakery.address + " · " + bakery.phone + " · " + bakery.email;
}

fetch("/api/shop")
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => { if (data && data.bakery) fillFooter(data.bakery); })
  .catch(() => {});

// Normalize whatever is in localStorage into safe line objects.
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

function cartTotalCents(cart, productsById) {
  return cart.lines.reduce((sum, line) => {
    const product = productsById.get(line.productId);
    return product ? sum + unitPriceCents(product, line) * line.qty : sum;
  }, 0);
}

function updateOrderTotal(cart, productsById) {
  if (orderTotalEl) orderTotalEl.textContent = formatKr(cartTotalCents(cart, productsById));
}

function renderEmpty() {
  root.textContent = "";
  const card = el("section", "card empty-card");
  card.appendChild(el("h2", null, "Kurven er tom"));
  card.appendChild(el("p", "muted", "Du har ikke lagt til noen varer ennå."));
  const link = el("a", "btn btn-primary", "Gå til butikken");
  link.href = "./index.html";
  card.appendChild(link);
  root.appendChild(card);
}

function renderError() {
  root.textContent = "";
  const card = el("section", "card error-card");
  card.appendChild(el("p", null, "Vi fikk ikke lastet kurven. Sjekk nettverket og prøv igjen."));
  const btn = el("button", "btn", "Prøv igjen");
  btn.type = "button";
  btn.addEventListener("click", init);
  card.appendChild(btn);
  root.appendChild(card);
}

function renderLine(cart, productsById, line) {
  const product = productsById.get(line.productId);
  const li = el("li", "cart-line");

  const img = document.createElement("img");
  img.className = "line-img";
  img.src = product.imageUrl;
  img.alt = product.name;
  li.appendChild(img);

  const info = el("div", "line-info");
  const nameLink = el("a", "line-name", product.name);
  nameLink.href = "./product.html?id=" + product.id;
  info.appendChild(nameLink);
  const { details } = lineOptionDetails(product, line);
  if (details.length) {
    info.appendChild(el("p", "line-meta", details.map((d) => d.value).join(" · ")));
  }
  if (line.cakeText && product.canHaveCakeText) {
    info.appendChild(el("p", "line-meta", "Tekst: «" + line.cakeText + "»"));
  }
  const unit = unitPriceCents(product, line);
  info.appendChild(el("p", "line-meta line-unit", formatKr(unit) + " per stk"));
  li.appendChild(info);

  const controls = el("div", "line-controls");

  const stepper = el("div", "qty-stepper");
  stepper.setAttribute("role", "group");
  stepper.setAttribute("aria-label", "Antall");
  const minus = el("button", "qty-btn", "−");
  minus.type = "button";
  minus.setAttribute("aria-label", "Reduser antall");
  const input = document.createElement("input");
  input.className = "qty-input";
  input.type = "number";
  input.min = String(QTY_MIN);
  input.max = String(QTY_MAX);
  input.inputMode = "numeric";
  input.value = String(line.qty);
  input.setAttribute("aria-label", "Antall");
  const plus = el("button", "qty-btn", "+");
  plus.type = "button";
  plus.setAttribute("aria-label", "Øk antall");
  stepper.append(minus, input, plus);
  controls.appendChild(stepper);

  const right = el("div", "line-right");
  const totalEl = el("span", "price line-total", formatKr(unit * line.qty));
  right.appendChild(totalEl);
  const removeBtn = el("button", "remove-btn", "Fjern");
  removeBtn.type = "button";
  removeBtn.setAttribute("aria-label", "Fjern " + product.name + " fra kurven");
  right.appendChild(removeBtn);
  controls.appendChild(right);
  li.appendChild(controls);

  function syncButtons() {
    minus.disabled = line.qty <= QTY_MIN;
    plus.disabled = line.qty >= QTY_MAX;
  }

  function setQty(q) {
    line.qty = Math.min(QTY_MAX, Math.max(QTY_MIN, q));
    input.value = String(line.qty);
    totalEl.textContent = formatKr(unit * line.qty);
    saveCart(cart);
    updateBadge(cart);
    updateOrderTotal(cart, productsById);
    syncButtons();
  }

  minus.addEventListener("click", () => setQty(line.qty - 1));
  plus.addEventListener("click", () => setQty(line.qty + 1));
  input.addEventListener("change", () => {
    const q = Math.round(Number(input.value));
    setQty(Number.isFinite(q) && q >= QTY_MIN ? q : line.qty);
  });
  removeBtn.addEventListener("click", () => {
    const idx = cart.lines.indexOf(line);
    if (idx >= 0) cart.lines.splice(idx, 1);
    saveCart(cart);
    render(cart, productsById);
  });
  syncButtons();
  return li;
}

function render(cart, productsById) {
  root.textContent = "";
  updateBadge(cart);
  if (!cart.lines.length) {
    renderEmpty();
    return;
  }

  const layout = el("div", "cart-layout");

  const listSection = el("section", "cart-list");
  listSection.setAttribute("aria-label", "Varer i kurven");
  const ul = el("ul", "cart-lines");
  for (const line of cart.lines) ul.appendChild(renderLine(cart, productsById, line));
  listSection.appendChild(ul);
  layout.appendChild(listSection);

  const summary = el("section", "card summary-card");
  summary.setAttribute("aria-label", "Oppsummering");
  summary.appendChild(el("span", "label", "Sum"));
  const row = el("div", "summary-row");
  row.appendChild(el("span", null, "Totalt"));
  orderTotalEl = el("span", "price", formatKr(cartTotalCents(cart, productsById)));
  row.appendChild(orderTotalEl);
  summary.appendChild(row);
  summary.appendChild(el("p", "muted vat-note", "inkl. mva"));
  const cta = el("a", "btn btn-primary summary-cta", "Til kassen");
  cta.href = "./checkout.html";
  summary.appendChild(cta);
  layout.appendChild(summary);

  root.appendChild(layout);
}

async function init() {
  root.textContent = "";
  root.appendChild(el("p", "muted", "Laster kurven..."));
  const cart = sanitizeCart(loadCart());
  updateBadge(cart);
  let products;
  try {
    const res = await fetch("/api/products");
    if (!res.ok) throw new Error("HTTP " + res.status);
    products = (await res.json()).products || [];
  } catch {
    renderError();
    return;
  }
  const productsById = new Map(products.map((p) => [p.id, p]));
  const kept = cart.lines.filter((l) => productsById.has(l.productId));
  if (kept.length !== cart.lines.length) {
    cart.lines = kept;
    saveCart(cart);
  }
  render(cart, productsById);
}

init();
