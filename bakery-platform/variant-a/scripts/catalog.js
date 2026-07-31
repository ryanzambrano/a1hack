// Variant A "Håndverk" storefront catalog.
// Fetches shop info and products, renders category sections and product cards.
// All user-facing copy is Norwegian bokmål; code and comments are English.

const CART_KEY = "bakeri_cart_v1";

// --- Shared helpers from docs/contract.md ---

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

// --- Page elements ---

const els = {
  brand: document.getElementById("brand-link"),
  cartLink: document.getElementById("cart-link"),
  cartCount: document.getElementById("cart-count"),
  hero: document.getElementById("hero"),
  heroDesc: document.getElementById("hero-desc"),
  pickupInfo: document.getElementById("pickup-info"),
  status: document.getElementById("status"),
  nav: document.getElementById("category-nav"),
  catalog: document.getElementById("catalog"),
  footer: document.getElementById("site-footer"),
  footerName: document.getElementById("footer-name"),
  footerAddress: document.getElementById("footer-address"),
  footerPhone: document.getElementById("footer-phone"),
  footerEmail: document.getElementById("footer-email"),
};

// Weekday names indexed 0-6, 0 = Sunday (matches the API contract).
const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

// --- Small utilities ---

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function pad2(n) { return String(n).padStart(2, "0"); }

function joinNo(items) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " og " + items[items.length - 1];
}

function leadTimeText(days) {
  const d = Number(days) || 0;
  if (d <= 0) return "Kan hentes i dag";
  return "Bestilles " + d + (d === 1 ? " dag" : " dager") + " i forveien";
}

function openingHoursText(bakery) {
  let text = "kl. " + pad2(bakery.openHour) + "-" + pad2(bakery.closeHour);
  const closed = (bakery.closedWeekdays || [])
    .map((day) => WEEKDAYS[day])
    .filter(Boolean);
  if (closed.length > 0) text += ", stengt " + joinNo(closed);
  return text;
}

// --- Cart badge ---

function updateCartBadge() {
  const cart = loadCart();
  const count = Array.isArray(cart.lines) ? cartCount(cart) : 0;
  els.cartCount.textContent = String(count);
  els.cartCount.hidden = count === 0;
  const label = count === 1 ? "Handlekurv, 1 vare" : "Handlekurv, " + count + " varer";
  els.cartLink.setAttribute("aria-label", count === 0 ? "Handlekurv" : label);
}

// --- Loading / error / empty states ---

function setStatus(node) {
  els.status.replaceChildren();
  if (node) els.status.appendChild(node);
  els.status.hidden = !node;
}

function hideAllSections() {
  els.hero.hidden = true;
  els.nav.hidden = true;
  els.catalog.hidden = true;
  els.footer.hidden = true;
}

function stateCard(title, message, buttonLabel) {
  const box = el("div", "state-card card");
  if (title) box.appendChild(el("h2", null, title));
  box.appendChild(el("p", "state-text", message));
  if (buttonLabel) {
    const btn = el("button", "btn btn-primary", buttonLabel);
    btn.type = "button";
    btn.addEventListener("click", init);
    box.appendChild(btn);
  }
  return box;
}

function showLoading() {
  hideAllSections();
  const box = el("div", "state-card card");
  const spinner = el("div", "state-spinner");
  spinner.setAttribute("aria-hidden", "true");
  box.appendChild(spinner);
  box.appendChild(el("p", "state-text", "Laster inn ferske bakevarer..."));
  setStatus(box);
}

function showError() {
  hideAllSections();
  setStatus(stateCard(
    "Å nei, her gikk noe galt",
    "Vi fikk ikke lastet inn bakeriet akkurat nå. Sjekk tilkoblingen din og prøv igjen.",
    "Prøv igjen"
  ));
}

function showEmpty() {
  els.nav.hidden = true;
  els.catalog.hidden = true;
  setStatus(stateCard(
    "Hyllene er tomme akkurat nå",
    "Vi baker for fullt. Kom gjerne tilbake litt senere!",
    "Last inn på nytt"
  ));
}

// --- Rendering ---

function renderShop(data) {
  const bakery = (data && data.bakery) || {};
  if (bakery.name) {
    document.title = bakery.name;
    els.brand.textContent = bakery.name;
  }
  els.heroDesc.textContent = bakery.description || "";

  els.pickupInfo.replaceChildren();
  const items = [];
  if (bakery.address) items.push(["Hentested", bakery.address]);
  if (bakery.openHour != null && bakery.closeHour != null) {
    items.push(["Åpningstider", openingHoursText(bakery)]);
  }
  if (bakery.orderCutoffHour != null) {
    items.push(["Bestillingsfrist", "kl. " + pad2(bakery.orderCutoffHour) + ":00"]);
  }
  for (const [term, def] of items) {
    const wrap = el("div", "pickup-item");
    wrap.appendChild(el("dt", null, term));
    wrap.appendChild(el("dd", null, def));
    els.pickupInfo.appendChild(wrap);
  }

  els.footerName.textContent = bakery.name || "";
  els.footerAddress.textContent = bakery.address || "";
  if (bakery.phone) {
    els.footerPhone.textContent = bakery.phone;
    els.footerPhone.href = "tel:" + bakery.phone.replace(/\s+/g, "");
  }
  if (bakery.email) {
    els.footerEmail.textContent = bakery.email;
    els.footerEmail.href = "mailto:" + bakery.email;
  }
}

function productCard(product) {
  const cardLink = el("a", "product-card card");
  cardLink.href = "./product.html?id=" + encodeURIComponent(product.id);

  const media = el("div", "product-media");
  const img = document.createElement("img");
  img.src = product.imageUrl || "";
  img.alt = product.name || "";
  img.loading = "lazy";
  media.appendChild(img);
  cardLink.appendChild(media);

  const body = el("div", "product-body");
  body.appendChild(el("h3", "product-name", product.name || ""));
  if (product.description) {
    body.appendChild(el("p", "product-desc", product.description));
  }

  const meta = el("div", "product-meta");
  const priceLine = el("span", "price-line");
  priceLine.appendChild(el("span", "price-from", "fra "));
  priceLine.appendChild(el("span", "price", formatKr(product.basePriceCents || 0)));
  meta.appendChild(priceLine);

  const days = Number(product.leadTimeDays) || 0;
  if (days <= 0) {
    meta.appendChild(el("span", "badge badge-ok lead-hint", "Kan hentes i dag"));
  } else {
    meta.appendChild(el("span", "lead-hint muted", leadTimeText(days)));
  }
  body.appendChild(meta);
  cardLink.appendChild(body);
  return cardLink;
}

function renderCatalog(products) {
  // Group by category in first-seen order.
  const groups = new Map();
  for (const product of products) {
    const category = product.category || "Annet";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(product);
  }

  els.nav.replaceChildren();
  els.catalog.replaceChildren();
  const navList = el("ul", "cat-list");
  let index = 0;
  for (const [category, items] of groups) {
    const sectionId = "kategori-" + index;

    const li = el("li");
    const link = el("a", "cat-link", category);
    link.href = "#" + sectionId;
    li.appendChild(link);
    navList.appendChild(li);

    const section = el("section", "category-section");
    section.id = sectionId;
    section.appendChild(el("h2", "category-title", category));
    const grid = el("div", "product-grid");
    for (const item of items) grid.appendChild(productCard(item));
    section.appendChild(grid);
    els.catalog.appendChild(section);
    index += 1;
  }
  els.nav.appendChild(navList);
}

// --- Init ---

async function init() {
  showLoading();
  try {
    const [shopRes, productsRes] = await Promise.all([
      fetch("/api/shop"),
      fetch("/api/products"),
    ]);
    if (!shopRes.ok || !productsRes.ok) throw new Error("Request failed");
    const shopData = await shopRes.json();
    const productsData = await productsRes.json();
    const products = Array.isArray(productsData.products) ? productsData.products : [];

    renderShop(shopData);
    els.hero.hidden = false;
    els.footer.hidden = false;

    if (products.length === 0) {
      showEmpty();
      return;
    }
    renderCatalog(products);
    setStatus(null);
    els.nav.hidden = false;
    els.catalog.hidden = false;
  } catch {
    showError();
  }
}

updateCartBadge();
window.addEventListener("storage", updateCartBadge);
window.addEventListener("pageshow", updateCartBadge);
init();
