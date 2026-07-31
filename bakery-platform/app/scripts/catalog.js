// App "Daymaker System" storefront catalog.
// Fetches shop info and products, renders category sections with underline tabs.

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

const WEEKDAY_NAMES = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

const brandEl = document.getElementById("brand-link");
const cartLinkEl = document.getElementById("cart-link");
const cartBadgeEl = document.getElementById("cart-badge");
const introTitleEl = document.getElementById("intro-title");
const introDescEl = document.getElementById("intro-desc");
const introFactsEl = document.getElementById("intro-facts");
const navEl = document.getElementById("cat-nav");
const navListEl = document.getElementById("cat-nav-list");
const stateEl = document.getElementById("state");
const catalogEl = document.getElementById("catalog");

let sections = [];
let tabs = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function hh(hour) {
  return String(hour).padStart(2, "0") + ":00";
}

function slugify(name, used) {
  let base = "kat-" + String(name).toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let id = base;
  let i = 2;
  while (used.has(id)) { id = base + "-" + i; i += 1; }
  used.add(id);
  return id;
}

function leadHint(days) {
  if (!days) return "Kan hentes samme dag";
  if (days === 1) return "Bestilles minst 1 dag før henting";
  return "Bestilles minst " + days + " dager før henting";
}

function refreshCartBadge() {
  let count = 0;
  try { count = cartCount(loadCart()); } catch { count = 0; }
  cartBadgeEl.textContent = String(count);
  cartBadgeEl.hidden = count === 0;
  if (count === 0) {
    cartLinkEl.setAttribute("aria-label", "Kurv, tom");
  } else if (count === 1) {
    cartLinkEl.setAttribute("aria-label", "Kurv, 1 vare");
  } else {
    cartLinkEl.setAttribute("aria-label", "Kurv, " + count + " varer");
  }
}

function factItem(label, value, sub) {
  const item = el("div", "fact");
  item.appendChild(el("div", "label", label));
  item.appendChild(el("div", "fact-value", value));
  if (sub) item.appendChild(el("div", "fact-sub", sub));
  return item;
}

function closedDaysText(closedWeekdays) {
  const days = (closedWeekdays || []).map((d) => WEEKDAY_NAMES[d]).filter(Boolean);
  if (!days.length) return "Åpent alle dager";
  return "Stengt " + days.join(" og ");
}

function renderShop(shop) {
  const bakery = shop.bakery;
  document.title = bakery.name;
  brandEl.textContent = bakery.name;
  introTitleEl.textContent = bakery.name;
  introDescEl.textContent = bakery.description || "";

  introFactsEl.replaceChildren(
    factItem("Hentested", bakery.address),
    factItem("Åpningstider", hh(bakery.openHour) + "-" + hh(bakery.closeHour),
      closedDaysText(bakery.closedWeekdays)),
    factItem("Bestillingsfrist", "Kl. " + hh(bakery.orderCutoffHour),
      "Bestillinger etter fristen regnes som neste dag")
  );
  introFactsEl.hidden = false;

  fillFooter(bakery);
}

// Footer contact line from /api/shop (shared pattern; the mva line is static).
function fillFooter(bakery) {
  const target = document.getElementById("footer-contact");
  if (!target || !bakery) return;
  target.textContent = bakery.address + " · " + bakery.phone + " · " + bakery.email;
}

function productCard(product) {
  const card = el("a", "product-card card");
  card.href = "./product.html?id=" + encodeURIComponent(product.id);

  const media = el("div", "product-media");
  const img = document.createElement("img");
  img.src = product.imageUrl;
  img.alt = product.name;
  img.loading = "lazy";
  media.appendChild(img);

  const body = el("div", "product-body");
  body.appendChild(el("h3", "product-name", product.name));
  body.appendChild(el("p", "product-desc", product.description || ""));

  const meta = el("div", "product-meta");
  meta.appendChild(el("span", "price product-price", "fra " + formatKr(product.basePriceCents)));
  meta.appendChild(el("span",
    product.leadTimeDays ? "badge badge-muted product-lead" : "badge badge-ok product-lead",
    leadHint(product.leadTimeDays)));
  body.appendChild(meta);

  card.appendChild(media);
  card.appendChild(body);
  return card;
}

function setActiveTab(id) {
  for (const tab of tabs) {
    const active = tab.getAttribute("href") === "#" + id;
    tab.classList.toggle("is-active", active);
    if (active) tab.setAttribute("aria-current", "true");
    else tab.removeAttribute("aria-current");
  }
}

function updateActiveFromScroll() {
  if (!sections.length || navEl.hidden) return;
  const offset = navEl.getBoundingClientRect().bottom + 24;
  let currentId = sections[0].id;
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= offset) currentId = section.id;
  }
  setActiveTab(currentId);
}

function renderCatalog(products) {
  catalogEl.replaceChildren();
  navListEl.replaceChildren();
  sections = [];
  tabs = [];

  if (!products.length) {
    navEl.hidden = true;
    const card = el("div", "state-card card");
    card.appendChild(el("h2", null, "Ingen produkter akkurat nå"));
    card.appendChild(el("p", "muted", "Vi fyller på med nybakst. Kom gjerne tilbake litt senere."));
    stateEl.replaceChildren(card);
    return;
  }

  // Group by category in first-seen order.
  const groups = new Map();
  for (const product of products) {
    const category = product.category || "Annet";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(product);
  }

  const usedIds = new Set();
  for (const [category, items] of groups) {
    const id = slugify(category, usedIds);

    const section = el("section", "cat-section");
    section.id = id;
    section.appendChild(el("h2", "cat-title", category));
    const grid = el("div", "product-grid");
    for (const product of items) grid.appendChild(productCard(product));
    section.appendChild(grid);
    catalogEl.appendChild(section);
    sections.push(section);

    const tab = el("a", "cat-tab", category);
    tab.href = "#" + id;
    tab.addEventListener("click", () => setActiveTab(id));
    navListEl.appendChild(tab);
    tabs.push(tab);
  }

  navEl.hidden = groups.size < 2;
  if (sections.length) setActiveTab(sections[0].id);
}

function showLoading() {
  navEl.hidden = true;
  catalogEl.replaceChildren();
  stateEl.replaceChildren(el("p", "state-loading muted", "Laster inn..."));
}

function showError() {
  navEl.hidden = true;
  catalogEl.replaceChildren();
  const card = el("div", "state-card card");
  card.appendChild(el("h2", null, "Noe gikk galt"));
  card.appendChild(el("p", "muted",
    "Vi fikk ikke kontakt med bakeriet. Sjekk nettilkoblingen og prøv igjen."));
  const retry = el("button", "btn btn-primary", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", init);
  card.appendChild(retry);
  stateEl.replaceChildren(card);
}

async function init() {
  showLoading();
  try {
    const [shopRes, productsRes] = await Promise.all([
      fetch("/api/shop"),
      fetch("/api/products"),
    ]);
    if (!shopRes.ok || !productsRes.ok) throw new Error("http error");
    const shop = await shopRes.json();
    const data = await productsRes.json();
    stateEl.replaceChildren();
    renderShop(shop);
    renderCatalog(data.products || []);
    updateActiveFromScroll();
  } catch {
    showError();
  }
}

let scrollTick = false;
window.addEventListener("scroll", () => {
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => {
    scrollTick = false;
    updateActiveFromScroll();
  });
}, { passive: true });

window.addEventListener("storage", (event) => {
  if (event.key === CART_KEY || event.key === null) refreshCartBadge();
});
window.addEventListener("pageshow", refreshCartBadge);

refreshCartBadge();
init();
