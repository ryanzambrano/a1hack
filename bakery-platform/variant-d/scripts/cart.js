// Cart page for variant D "Lekent".
// Resolves cart lines against /api/products, silently drops lines whose
// product no longer exists, and lets the customer adjust quantities and
// remove lines before checkout. Built against docs/contract.md.

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

const statusEl = document.getElementById("status");
const layoutEl = document.getElementById("cart-layout");
const linesEl = document.getElementById("cart-lines");
const summaryCountEl = document.getElementById("summary-count");
const totalEl = document.getElementById("cart-total");
const brandEl = document.getElementById("brand-name");
const cartLinkEl = document.getElementById("cart-link");
const badgeEl = document.getElementById("cart-badge");

let bakeryName = "Bakeriet";
let productsById = new Map();
let cart = { lines: [] };

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

// Save back in the shared contract shape (omit empty optional fields).
function persist() {
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
      bakeryName = data.bakery.name;
      brandEl.textContent = bakeryName;
      document.title = "Handlekurv | " + bakeryName;
      renderFooter(data.bakery);
    }
  } catch {
    // Keep the static fallback name.
  }
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

function showLoading() {
  layoutEl.hidden = true;
  statusEl.hidden = false;
  statusEl.textContent = "Henter handlekurven...";
}

function showError() {
  layoutEl.hidden = true;
  statusEl.hidden = false;
  statusEl.textContent = "";
  statusEl.appendChild(el("h2", "", "Oi, noe gikk galt"));
  statusEl.appendChild(el("p", "muted",
    "Vi klarte ikke å hente handlekurven akkurat nå. Sjekk nettet og prøv igjen!"));
  const retry = el("button", "btn btn-primary", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", loadPage);
  statusEl.appendChild(retry);
}

function showEmpty() {
  layoutEl.hidden = true;
  statusEl.hidden = false;
  statusEl.textContent = "";
  statusEl.appendChild(el("h2", "", "Handlekurven er tom"));
  statusEl.appendChild(el("p", "muted",
    "Ingenting her ennå. Kakene står klare og venter i butikken!"));
  const back = el("a", "btn btn-primary", "Til butikken");
  back.href = "./index.html";
  statusEl.appendChild(back);
}

function updateSummary() {
  let total = 0;
  cart.lines.forEach((l) => {
    const p = productsById.get(l.productId);
    if (p) total += unitPriceCents(l, p) * l.qty;
  });
  totalEl.textContent = formatKr(total);
  const n = cartCount(cart);
  summaryCountEl.textContent =
    n + (n === 1 ? " vare i handlekurven" : " varer i handlekurven");
}

function renderLine(line, index) {
  const product = productsById.get(line.productId);
  const item = el("article", "card cart-line");

  const fig = el("div", "line-figure");
  const img = document.createElement("img");
  img.src = product.imageUrl;
  img.alt = product.name;
  fig.appendChild(img);
  item.appendChild(fig);

  const body = el("div", "line-body");
  item.appendChild(body);

  const top = el("div", "line-top");
  const name = el("h3", "line-name");
  const link = el("a", "", product.name);
  link.href = "./product.html?id=" + product.id;
  name.appendChild(link);
  top.appendChild(name);
  const removeBtn = el("button", "remove-btn", "Fjern");
  removeBtn.type = "button";
  removeBtn.setAttribute("aria-label", "Fjern " + product.name + " fra handlekurven");
  removeBtn.addEventListener("click", () => {
    cart.lines.splice(index, 1);
    persist();
    updateBadge();
    renderAll();
  });
  top.appendChild(removeBtn);
  body.appendChild(top);

  const opts = optionSummary(line, product);
  if (opts) body.appendChild(el("p", "line-opts muted", opts));
  if (line.cakeText) {
    body.appendChild(el("p", "line-cake", "Tekst på kaken: \"" + line.cakeText + "\""));
  }

  const foot = el("div", "line-foot");
  const unit = unitPriceCents(line, product);
  foot.appendChild(el("span", "line-unit muted", formatKr(unit) + " per stk"));

  const qtyRow = el("div", "qty-row");
  const minus = el("button", "qty-btn", "-");
  minus.type = "button";
  minus.setAttribute("aria-label", "Færre " + product.name);
  const input = document.createElement("input");
  input.type = "number";
  input.className = "qty-input";
  input.min = "1";
  input.max = String(MAX_QTY);
  input.step = "1";
  input.inputMode = "numeric";
  input.value = String(line.qty);
  input.setAttribute("aria-label", "Antall " + product.name);
  const plus = el("button", "qty-btn", "+");
  plus.type = "button";
  plus.setAttribute("aria-label", "Flere " + product.name);
  const lineTotal = el("span", "line-total price", formatKr(unit * line.qty));

  const apply = (q) => {
    line.qty = clampQty(q);
    input.value = String(line.qty);
    minus.disabled = line.qty <= 1;
    plus.disabled = line.qty >= MAX_QTY;
    lineTotal.textContent = formatKr(unit * line.qty);
    persist();
    updateBadge();
    updateSummary();
  };
  minus.addEventListener("click", () => apply(line.qty - 1));
  plus.addEventListener("click", () => apply(line.qty + 1));
  input.addEventListener("change", () => apply(input.value));
  minus.disabled = line.qty <= 1;
  plus.disabled = line.qty >= MAX_QTY;

  qtyRow.appendChild(minus);
  qtyRow.appendChild(input);
  qtyRow.appendChild(plus);
  foot.appendChild(qtyRow);
  foot.appendChild(lineTotal);
  body.appendChild(foot);

  return item;
}

function renderAll() {
  if (!cart.lines.length) {
    showEmpty();
    return;
  }
  statusEl.hidden = true;
  layoutEl.hidden = false;
  linesEl.textContent = "";
  cart.lines.forEach((line, i) => linesEl.appendChild(renderLine(line, i)));
  updateSummary();
}

async function loadPage() {
  showLoading();
  let res;
  try { res = await fetch("/api/products"); }
  catch { showError(); return; }
  if (!res.ok) { showError(); return; }
  let data;
  try { data = await res.json(); }
  catch { showError(); return; }
  const products = (data && Array.isArray(data.products)) ? data.products : [];
  productsById = new Map(products.map((p) => [p.id, p]));

  cart = normalizeCart(loadCart());
  // Silently drop lines whose product no longer exists (per contract).
  cart.lines = cart.lines.filter((l) => productsById.has(l.productId));
  sanitizeLineOptions();
  persist();
  updateBadge();
  renderAll();
}

function init() {
  cart = normalizeCart(loadCart());
  updateBadge();
  window.addEventListener("storage", (e) => {
    if (e.key !== CART_KEY) return;
    cart = normalizeCart(loadCart());
    if (productsById.size) {
      cart.lines = cart.lines.filter((l) => productsById.has(l.productId));
      sanitizeLineOptions();
      renderAll();
    }
    updateBadge();
  });
  fetchShop();
  loadPage();
}

init();
