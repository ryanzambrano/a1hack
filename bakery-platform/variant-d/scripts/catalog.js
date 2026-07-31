// Variant D "Lekent" storefront catalog page.
// Fetches /api/shop and /api/products, groups products by category and
// renders playful cards. All user-facing copy is Norwegian bokmål.

// --- Shared helpers (copied from docs/contract.md) ---

export function formatKr(cents) {
  const kr = cents / 100;
  return "kr " + (Number.isInteger(kr) ? kr : kr.toFixed(2).replace(".", ","));
}

const CART_KEY = "bakeri_cart_v1";

export function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || { lines: [] }; }
  catch { return { lines: [] }; }
}

export function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

export function cartCount(cart) { return cart.lines.reduce((n, l) => n + l.qty, 0); }

// --- Page code ---

const WEEKDAY_NAMES = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

const els = {
  brand: document.getElementById("brand-name"),
  cartLink: document.getElementById("cart-link"),
  cartBadge: document.getElementById("cart-badge"),
  hero: document.getElementById("hero"),
  status: document.getElementById("status"),
  nav: document.getElementById("category-nav"),
  catalog: document.getElementById("catalog"),
  footerCard: document.getElementById("footer-card"),
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pad2(n) { return String(n).padStart(2, "0"); }

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  return res.json();
}

function updateCartBadge() {
  const cart = loadCart();
  const count = Array.isArray(cart.lines) ? cartCount(cart) : 0;
  els.cartBadge.textContent = String(count);
  els.cartBadge.hidden = count === 0;
  const suffix = count === 0 ? "tom" : count + (count === 1 ? " vare" : " varer");
  els.cartLink.setAttribute("aria-label", "Handlekurv, " + suffix);
}

function leadTimeLabel(days) {
  if (!days) return "Kan hentes i dag";
  return "Bestilles " + days + " " + (days === 1 ? "dag" : "dager") + " i forveien";
}

function slugify(name, used) {
  const base = "kat-" + String(name).toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let id = base;
  let i = 2;
  while (used.has(id) || document.getElementById(id)) { id = base + "-" + i; i += 1; }
  used.add(id);
  return id;
}

function showStatus(message, withRetry) {
  els.status.textContent = "";
  const card = el("div", "status-card card");
  card.appendChild(el("p", "status-text", message));
  if (withRetry) {
    const btn = el("button", "btn btn-primary", "Prøv igjen");
    btn.type = "button";
    btn.addEventListener("click", init);
    card.appendChild(btn);
  }
  els.status.appendChild(card);
}

function pickupChip(text) {
  return el("li", "pickup-chip", text);
}

function closedDaysLabel(closedWeekdays) {
  const names = (closedWeekdays || [])
    .filter((d) => d >= 0 && d <= 6)
    .map((d) => WEEKDAY_NAMES[d]);
  if (!names.length) return "Åpent alle dager";
  if (names.length === 1) return "Stengt " + names[0];
  return "Stengt " + names.slice(0, -1).join(", ") + " og " + names[names.length - 1];
}

function renderShop(shopData) {
  const b = (shopData && shopData.bakery) || {};
  if (b.name) {
    document.title = b.name + " - bestill på nett";
    els.brand.textContent = b.name;
  }

  // Hero
  els.hero.textContent = "";
  els.hero.appendChild(el("span", "badge badge-mint hero-kicker", "Ferskt fra ovnen hver dag!"));
  els.hero.appendChild(el("h1", "hero-title", b.name || "Bakeriet"));
  if (b.description) els.hero.appendChild(el("p", "hero-desc", b.description));

  const list = el("ul", "pickup-list");
  if (b.address) list.appendChild(pickupChip("Henting: " + b.address));
  if (typeof b.openHour === "number" && typeof b.closeHour === "number") {
    list.appendChild(pickupChip("Åpent " + pad2(b.openHour) + ":00 til " + pad2(b.closeHour) + ":00"));
  }
  list.appendChild(pickupChip(closedDaysLabel(b.closedWeekdays)));
  if (typeof b.orderCutoffHour === "number") {
    list.appendChild(pickupChip("Bestill før kl. " + pad2(b.orderCutoffHour) + ":00 for henting samme dag"));
  }
  els.hero.appendChild(list);
  els.hero.hidden = false;

  // Footer
  els.footerCard.textContent = "";
  els.footerCard.appendChild(el("h2", "footer-title", "Kom innom oss!"));
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
  els.footerCard.appendChild(contact);
  els.footerCard.appendChild(el("p", "muted footer-note", "Alle priser er inkl. mva."));
  els.footerCard.hidden = false;
}

function setActivePill(pill) {
  for (const sibling of els.nav.children) sibling.removeAttribute("aria-current");
  pill.setAttribute("aria-current", "true");
}

function productCard(product) {
  const card = el("a", "product-card card card-hover");
  card.href = "./product.html?id=" + encodeURIComponent(product.id);

  const figure = el("figure", "product-figure");
  if (product.imageUrl) {
    const img = document.createElement("img");
    img.src = product.imageUrl;
    img.alt = product.name || "";
    img.loading = "lazy";
    figure.appendChild(img);
  }
  card.appendChild(figure);

  const body = el("div", "product-body");
  body.appendChild(el("h3", "product-name", product.name || ""));
  if (product.description) body.appendChild(el("p", "product-desc", product.description));

  const meta = el("div", "product-meta");
  meta.appendChild(el("span", "price product-price", "fra " + formatKr(product.basePriceCents)));
  const leadClass = product.leadTimeDays ? "badge lead-badge" : "badge badge-mint lead-badge";
  meta.appendChild(el("span", leadClass, leadTimeLabel(product.leadTimeDays)));
  body.appendChild(meta);
  card.appendChild(body);
  return card;
}

function renderCatalog(products) {
  els.nav.textContent = "";
  els.catalog.textContent = "";
  if (!products.length) {
    els.nav.hidden = true;
    showStatus("Hyllene er tomme akkurat nå. Kom tilbake litt senere, vi baker så fort vi kan!", true);
    return;
  }

  // Group by category in first-seen order.
  const groups = new Map();
  for (const product of products) {
    const category = product.category || "Annet godt";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(product);
  }

  const usedIds = new Set();
  let first = true;
  for (const [category, items] of groups) {
    const sectionId = slugify(category, usedIds);

    const pill = el("a", "cat-pill", category);
    pill.href = "#" + sectionId;
    if (first) pill.setAttribute("aria-current", "true");
    pill.addEventListener("click", () => setActivePill(pill));
    els.nav.appendChild(pill);

    const section = el("section", "category-section");
    section.id = sectionId;
    const heading = el("h2", "category-title");
    heading.appendChild(el("span", "", category));
    heading.appendChild(el("span", "badge badge-mint category-count", String(items.length)));
    section.appendChild(heading);

    const grid = el("div", "product-grid");
    for (const item of items) grid.appendChild(productCard(item));
    section.appendChild(grid);
    els.catalog.appendChild(section);
    first = false;
  }
  els.nav.hidden = false;
}

async function init() {
  els.nav.hidden = true;
  els.catalog.textContent = "";
  showStatus("Henter dagens bakevarer...");
  try {
    const [shopData, productsData] = await Promise.all([
      fetchJson("/api/shop"),
      fetchJson("/api/products"),
    ]);
    els.status.textContent = "";
    renderShop(shopData);
    renderCatalog((productsData && productsData.products) || []);
  } catch {
    showStatus("Oi, her gikk noe galt! Vi fikk ikke hentet bakevarene.", true);
  }
}

updateCartBadge();
window.addEventListener("storage", (event) => {
  if (event.key === CART_KEY) updateCartBadge();
});
window.addEventListener("pageshow", updateCartBadge);
init();
