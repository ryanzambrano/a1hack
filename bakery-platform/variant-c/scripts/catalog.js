// Variant C "Tidsskrift" storefront: editorial catalog grouped by category.
// Fetches /api/shop and /api/products, renders a menu-style product list.

const CART_KEY = "bakeri_cart_v1";

export function formatKr(cents) {
  const kr = cents / 100;
  return "kr " + (Number.isInteger(kr) ? kr : kr.toFixed(2).replace(".", ","));
}

export function loadCart() {
  try {
    const c = JSON.parse(localStorage.getItem(CART_KEY));
    return c && Array.isArray(c.lines) ? c : { lines: [] };
  } catch { return { lines: [] }; }
}

export function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

export function cartCount(cart) { return cart.lines.reduce((n, l) => n + l.qty, 0); }

const WEEKDAY_NAMES = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

const statusEl = document.getElementById("status");
const heroEl = document.getElementById("hero");
const navEl = document.getElementById("cat-nav");
const catalogEl = document.getElementById("catalog");
const footerEl = document.getElementById("footer");
const badgeEl = document.getElementById("cart-badge");
const shopNameEl = document.getElementById("shop-name");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pad2(n) { return String(n).padStart(2, "0"); }

// "a", "a og b", "a, b og c"
function joinNo(items) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " og " + items[items.length - 1];
}

function leadTimeLabel(days) {
  if (!days) return "Kan hentes i dag";
  if (days === 1) return "Bestilles 1 dag i forveien";
  return "Bestilles " + days + " dager i forveien";
}

function updateCartBadge() {
  const count = cartCount(loadCart());
  badgeEl.textContent = String(count);
  badgeEl.hidden = count === 0;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  return res.json();
}

function infoRow(term, value) {
  const row = el("div", "info-row");
  row.append(el("span", "info-term", term), el("span", "leader"), el("span", "info-value", value));
  return row;
}

function renderHero(shop) {
  heroEl.textContent = "";

  const lede = el("div", "hero-lede");
  lede.append(
    el("span", "kicker", "Fra ovnen"),
    el("p", "hero-text", shop.description || "Alt bakes fra bunnen av, hver morgen.")
  );

  const info = el("div", "hero-info");
  info.append(el("h2", "hero-info-title", "Henting og åpningstider"));
  if (shop.address) info.append(infoRow("Adresse", shop.address));
  if (typeof shop.openHour === "number" && typeof shop.closeHour === "number") {
    info.append(infoRow("Åpent", pad2(shop.openHour) + "-" + pad2(shop.closeHour)));
  }
  const closed = (shop.closedWeekdays || []).map((d) => WEEKDAY_NAMES[d]).filter(Boolean);
  if (closed.length) info.append(infoRow("Stengt", joinNo(closed)));
  if (typeof shop.orderCutoffHour === "number") {
    info.append(infoRow("Bestillingsfrist", "kl. " + pad2(shop.orderCutoffHour)));
  }

  heroEl.append(lede, info);
  heroEl.hidden = false;
}

function footerCol(kickerText, valueNode) {
  const col = el("div", "footer-col");
  col.append(el("span", "kicker", kickerText), valueNode);
  return col;
}

function renderFooter(shop) {
  const grid = footerEl.querySelector(".footer-grid");
  grid.textContent = "";

  grid.append(footerCol("Besøk oss", el("p", "footer-value", shop.address || "")));

  const phoneP = el("p", "footer-value");
  const phoneA = el("a", null, shop.phone || "");
  phoneA.href = "tel:" + String(shop.phone || "").replace(/\s+/g, "");
  phoneP.append(phoneA);
  grid.append(footerCol("Ring oss", phoneP));

  const mailP = el("p", "footer-value");
  const mailA = el("a", null, shop.email || "");
  mailA.href = "mailto:" + (shop.email || "");
  mailP.append(mailA);
  grid.append(footerCol("Skriv til oss", mailP));

  footerEl.querySelector(".footer-name").textContent = shop.name || "";
  footerEl.hidden = false;
}

// Group products by category in first-seen order.
function groupByCategory(products) {
  const order = [];
  const map = new Map();
  for (const p of products) {
    const cat = p.category || "Annet";
    if (!map.has(cat)) { map.set(cat, []); order.push(cat); }
    map.get(cat).push(p);
  }
  return order.map((cat) => ({ category: cat, products: map.get(cat) }));
}

function productRow(product) {
  const link = el("a", "menu-row");
  link.href = "./product.html?id=" + encodeURIComponent(product.id);

  const img = el("img", "menu-img");
  img.src = product.imageUrl;
  img.alt = product.name;
  img.loading = "lazy";
  img.width = 84;
  img.height = 84;

  const body = el("div", "menu-body");
  const line = el("div", "menu-line");
  line.append(
    el("h3", "menu-name", product.name),
    el("span", "leader"),
    el("span", "price menu-price", "fra " + formatKr(product.basePriceCents))
  );
  const desc = el("p", "menu-desc", product.description || "");
  const lead = el(
    "span",
    product.leadTimeDays ? "menu-lead" : "menu-lead menu-lead-today",
    leadTimeLabel(product.leadTimeDays)
  );
  body.append(line, desc, lead);

  link.append(img, body);
  return link;
}

function renderCatalog(groups) {
  navEl.textContent = "";
  catalogEl.textContent = "";

  const list = el("ol", "cat-nav-list");
  groups.forEach((group, i) => {
    const num = pad2(i + 1);
    const anchorId = "kategori-" + (i + 1);

    const li = el("li");
    const a = el("a", "cat-nav-link");
    a.href = "#" + anchorId;
    a.append(el("span", "cat-num", num), document.createTextNode(" " + group.category));
    li.append(a);
    list.append(li);

    const section = el("section", "menu-section");
    section.id = anchorId;
    const head = el("header", "menu-head");
    head.append(el("span", "kicker", "Nr. " + num), el("h2", null, group.category), el("hr", "rule"));
    const rows = el("div", "menu-list");
    for (const p of group.products) rows.append(productRow(p));
    section.append(head, rows);
    catalogEl.append(section);
  });

  navEl.append(list);
  navEl.hidden = false;
}

function showError() {
  statusEl.textContent = "";
  statusEl.hidden = false;
  statusEl.append(el("p", "status-msg", "Kunne ikke laste siden. Sjekk tilkoblingen og prøv igjen."));
  const btn = el("button", "btn", "Prøv igjen");
  btn.type = "button";
  btn.addEventListener("click", init);
  statusEl.append(btn);
}

async function init() {
  statusEl.hidden = false;
  statusEl.textContent = "Laster dagens utvalg…";
  heroEl.hidden = true;
  navEl.hidden = true;
  footerEl.hidden = true;
  catalogEl.textContent = "";

  try {
    const [shopData, productsData] = await Promise.all([
      fetchJson("/api/shop"),
      fetchJson("/api/products"),
    ]);

    const shop = shopData.bakery || {};
    if (shop.name) {
      document.title = shop.name;
      shopNameEl.textContent = shop.name;
    }
    renderHero(shop);
    renderFooter(shop);

    const products = productsData.products || [];
    if (products.length === 0) {
      statusEl.textContent = "Utvalget er tomt akkurat nå. Kom gjerne tilbake litt senere.";
      return;
    }

    statusEl.hidden = true;
    renderCatalog(groupByCategory(products));
  } catch (err) {
    console.error(err);
    showError();
  }
}

updateCartBadge();
window.addEventListener("storage", (e) => { if (e.key === CART_KEY) updateCartBadge(); });
window.addEventListener("pageshow", updateCartBadge);
init();
