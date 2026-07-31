// Variant E "Nordisk" storefront catalog.
// Fetches shop info and products, renders category sections with a pill nav.

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

const brandEl = document.getElementById("brand-name");
const cartLinkEl = document.getElementById("cart-link");
const cartBadgeEl = document.getElementById("cart-badge");
const heroTitleEl = document.getElementById("hero-title");
const heroDescEl = document.getElementById("hero-desc");
const heroPickupEl = document.getElementById("hero-pickup");
const navEl = document.getElementById("cat-nav");
const navListEl = document.getElementById("cat-nav-list");
const stateEl = document.getElementById("state");
const catalogEl = document.getElementById("catalog");
const footerEl = document.getElementById("site-footer");
const footerContentEl = document.getElementById("footer-content");

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
    cartLinkEl.setAttribute("aria-label", "Handlekurv, tom");
  } else if (count === 1) {
    cartLinkEl.setAttribute("aria-label", "Handlekurv, 1 vare");
  } else {
    cartLinkEl.setAttribute("aria-label", "Handlekurv, " + count + " varer");
  }
}

function pickupItem(label, value, sub) {
  const item = el("div", "pickup-item");
  item.appendChild(el("div", "pickup-label", label));
  item.appendChild(el("div", "pickup-value", value));
  if (sub) item.appendChild(el("div", "pickup-sub", sub));
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
  heroTitleEl.textContent = bakery.name;
  heroDescEl.textContent = bakery.description || "";

  heroPickupEl.replaceChildren(
    pickupItem("Henting i butikk", bakery.address),
    pickupItem("Åpningstider", hh(bakery.openHour) + "-" + hh(bakery.closeHour),
      closedDaysText(bakery.closedWeekdays)),
    pickupItem("Bestillingsfrist", "Kl. " + hh(bakery.orderCutoffHour),
      "Bestillinger etter fristen regnes som neste dag")
  );
  heroPickupEl.hidden = false;

  const contact = el("div", "footer-contact");
  contact.appendChild(el("h2", "footer-title", "Kontakt oss"));

  const address = el("p", "footer-row", bakery.address);
  contact.appendChild(address);

  const phoneRow = el("p", "footer-row");
  const phoneLink = el("a", null, bakery.phone);
  phoneLink.href = "tel:" + String(bakery.phone).replace(/\s+/g, "");
  phoneRow.appendChild(phoneLink);
  contact.appendChild(phoneRow);

  const emailRow = el("p", "footer-row");
  const emailLink = el("a", null, bakery.email);
  emailLink.href = "mailto:" + bakery.email;
  emailRow.appendChild(emailLink);
  contact.appendChild(emailRow);

  const note = el("p", "footer-note muted", bakery.name + ". Alle priser er inkl. mva.");

  footerContentEl.replaceChildren(contact, note);
  footerEl.hidden = false;
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
  meta.appendChild(el("span", "price", "fra " + formatKr(product.basePriceCents)));
  meta.appendChild(el("span",
    "product-lead" + (product.leadTimeDays ? "" : " is-today"),
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
  const offset = navEl.offsetHeight + 40;
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
