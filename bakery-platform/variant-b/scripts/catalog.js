// Variant B storefront catalog. Fetches /api/shop and /api/products,
// renders the hero, category nav, grouped product list and footer.

// --- Shared helpers (copied from docs/contract.md) ---

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

// --- DOM helpers ---

const WEEKDAYS_NB = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child != null) node.append(child); // strings become text nodes (escaped)
  }
  return node;
}

function pad2(hour) {
  return String(hour).padStart(2, "0");
}

function leadHint(days) {
  if (days === 0) return "Kan hentes i dag";
  if (days === 1) return "Bestilles 1 dag i forveien";
  return "Bestilles " + days + " dager i forveien";
}

function joinNaturally(items) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " og " + items[items.length - 1];
}

function openingText(bakery) {
  let text = "Kl " + pad2(bakery.openHour) + "-" + pad2(bakery.closeHour);
  const closed = (bakery.closedWeekdays || [])
    .map((d) => WEEKDAYS_NB[d])
    .filter(Boolean);
  if (closed.length > 0) text += ". Stengt " + joinNaturally(closed);
  else text += ". Åpent alle dager";
  return text;
}

// --- Cart badge ---

function renderCartBadge() {
  const badge = document.getElementById("cart-badge");
  const count = cartCount(loadCart());
  badge.textContent = String(count);
  badge.classList.toggle("has-items", count > 0);
}

// --- States ---

const main = document.getElementById("main");

function showLoading() {
  main.replaceChildren(
    el("div", { class: "state" },
      el("span", { class: "label", text: "Vent litt" }),
      el("p", { class: "muted", text: "Laster butikken ..." })));
}

function showError() {
  const retry = el("button", { class: "btn", type: "button", text: "Prøv igjen" });
  retry.addEventListener("click", init);
  main.replaceChildren(
    el("div", { class: "state" },
      el("span", { class: "label", text: "Feil" }),
      el("p", { text: "Kunne ikke laste inn butikken. Sjekk nettforbindelsen og prøv igjen." }),
      retry));
}

// --- Rendering ---

function renderHero(bakery) {
  const facts = el("div", { class: "hero-facts" },
    el("div", {},
      el("span", { class: "label", text: "Henting" }),
      el("p", { class: "fact", text: bakery.address })),
    el("div", {},
      el("span", { class: "label", text: "Åpningstider" }),
      el("p", { class: "fact", text: openingText(bakery) })),
    el("div", {},
      el("span", { class: "label", text: "Bestillingsfrist" }),
      el("p", { class: "fact", text: "Bestill før kl " + bakery.orderCutoffHour + ". Senere bestillinger telles fra neste dag." })));

  return el("section", { class: "hero", "aria-label": "Om bakeriet" },
    el("h1", { text: bakery.name }),
    bakery.description ? el("p", { class: "hero-desc", text: bakery.description }) : null,
    facts);
}

function groupByCategory(products) {
  const groups = [];
  const byName = new Map();
  for (const product of products) {
    const name = product.category || "Annet";
    if (!byName.has(name)) {
      const group = { name, items: [] };
      byName.set(name, group);
      groups.push(group); // first-seen order
    }
    byName.get(name).items.push(product);
  }
  return groups;
}

function renderProductRow(product) {
  const lead = leadHint(product.leadTimeDays);
  return el("li", {},
    el("a", { class: "prod-row", href: "./product.html?id=" + product.id },
      el("img", {
        class: "prod-img", src: product.imageUrl, alt: product.name,
        width: "88", height: "88", loading: "lazy",
      }),
      el("div", { class: "prod-main" },
        el("h3", { class: "prod-name", text: product.name }),
        el("p", { class: "prod-desc", text: product.description || "" }),
        el("p", {
          class: "prod-lead" + (product.leadTimeDays === 0 ? " prod-lead-today" : ""),
          text: lead,
        })),
      el("div", { class: "prod-price" },
        el("span", { class: "label", text: "Fra" }),
        el("span", { class: "price", text: formatKr(product.basePriceCents) }))));
}

function renderCatalog(groups) {
  const navList = document.getElementById("cat-nav-list");
  navList.replaceChildren();
  const sections = [];
  const links = [];

  groups.forEach((group, index) => {
    const sectionId = "kat-" + index;
    const countText = group.items.length === 1 ? "1 produkt" : group.items.length + " produkter";

    const link = el("a", { class: "cat-link", href: "#" + sectionId },
      group.name, " ",
      el("span", { class: "cat-link-count", text: String(group.items.length) }));
    navList.append(link);
    links.push(link);

    const section = el("section", { class: "cat", id: sectionId, "aria-label": group.name },
      el("div", { class: "cat-head" },
        el("h2", { text: group.name }),
        el("span", { class: "cat-count muted", text: countText })),
      el("ul", { class: "prod-list" }, ...group.items.map(renderProductRow)));
    sections.push(section);
  });

  document.getElementById("cat-nav").hidden = false;
  main.append(...sections);
  setupSectionSpy(links, sections);
}

function setupSectionSpy(links, sections) {
  if (!("IntersectionObserver" in window)) return;
  const linkById = new Map(links.map((l) => [l.getAttribute("href").slice(1), l]));
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const link = linkById.get(entry.target.id);
      if (!link) continue;
      for (const other of links) other.removeAttribute("aria-current");
      link.setAttribute("aria-current", "true");
    }
  }, { rootMargin: "-30% 0px -60% 0px" });
  for (const section of sections) observer.observe(section);
}

function renderFooter(bakery) {
  document.getElementById("footer-address").textContent = bakery.address;
  const phone = document.getElementById("footer-phone");
  phone.textContent = bakery.phone;
  phone.href = "tel:" + String(bakery.phone).replace(/\s+/g, "");
  const email = document.getElementById("footer-email");
  email.textContent = bakery.email;
  email.href = "mailto:" + bakery.email;
  document.getElementById("footer").hidden = false;
}

function render(bakery, products) {
  // Brand and title are the same static text on every page; the hero and
  // footer still show live shop data from /api/shop.
  main.replaceChildren(renderHero(bakery));

  if (products.length === 0) {
    main.append(
      el("div", { class: "state state-bordered" },
        el("span", { class: "label", text: "Tomt" }),
        el("p", { text: "Ingen produkter tilgjengelig akkurat nå. Kom gjerne tilbake senere." })));
  } else {
    renderCatalog(groupByCategory(products));
  }

  renderFooter(bakery);
}

// --- Init ---

async function init() {
  renderCartBadge();
  document.getElementById("cat-nav").hidden = true;
  showLoading();
  try {
    const [shopRes, prodRes] = await Promise.all([
      fetch("/api/shop"),
      fetch("/api/products"),
    ]);
    if (!shopRes.ok || !prodRes.ok) {
      throw new Error("HTTP " + shopRes.status + "/" + prodRes.status);
    }
    const shopData = await shopRes.json();
    const prodData = await prodRes.json();
    render(shopData.bakery, prodData.products || []);
  } catch {
    showError();
  }
}

window.addEventListener("storage", (event) => {
  if (event.key === CART_KEY) renderCartBadge();
});
window.addEventListener("pageshow", renderCartBadge);

init();
