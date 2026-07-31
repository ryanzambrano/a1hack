// Bakery admin for variant A "Handverk". Two views: order board and product management.
// All user-facing copy is Norwegian bokmaal; code and comments are English.

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

const STATUS_LABELS = {
  new: "Ny",
  confirmed: "Bekreftet",
  ready: "Klar til henting",
  picked_up: "Hentet",
  cancelled: "Kansellert",
};
const STATUS_TONE = { new: "accent", confirmed: "accent", ready: "ok", picked_up: "muted", cancelled: "warn" };
const NEXT_STATUS = { new: "confirmed", confirmed: "ready", ready: "picked_up" };
const ADVANCE_LABELS = { new: "Bekreft bestillingen", confirmed: "Marker som klar", ready: "Marker som hentet" };
const FILTERS = ["all", "new", "confirmed", "ready", "picked_up", "cancelled"];
const WEEKDAYS = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];

const state = {
  orders: [],
  ordersLoaded: false,
  filter: "all",
  expanded: new Set(),
  products: [],
  productsLoaded: false,
  editingId: null,
};

function $(id) { return document.getElementById(id); }

// Small DOM builder. Uses textContent / text nodes only, so user text is never
// injected as HTML.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child != null) node.append(child);
  }
  return node;
}

async function api(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error("Fikk ikke kontakt med serveren. Prøv igjen.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    throw new Error(data && data.error ? data.error : "Noe gikk galt. Prøv igjen.");
  }
  return data;
}

function badgeFor(status) {
  const tone = STATUS_TONE[status];
  let cls = "badge";
  if (tone === "ok") cls = "badge badge-ok";
  else if (tone === "muted") cls = "badge badge-muted";
  else if (tone === "warn") cls = "badge badge-warn";
  return el("span", { class: cls, text: STATUS_LABELS[status] || status });
}

function formatPickupDate(iso) {
  const parts = String(iso).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) return iso;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  return WEEKDAYS[date.getDay()] + " " + String(d).padStart(2, "0") + "." + String(m).padStart(2, "0") + "." + y;
}

function errorCard(message, retry) {
  return el("div", { class: "card empty-state" },
    el("p", { text: message }),
    el("button", { class: "btn btn-small", type: "button", text: "Prøv igjen", onclick: retry }));
}

/* ---------------- Orders view ---------------- */

async function loadOrders() {
  const list = $("orders-list");
  list.replaceChildren(el("p", { class: "muted loading", text: "Henter bestillinger..." }));
  try {
    const data = await api("/api/admin/orders");
    state.orders = data.orders;
    state.ordersLoaded = true;
    renderOrders();
  } catch {
    list.replaceChildren(errorCard("Kunne ikke hente bestillingene. Sjekk tilkoblingen og prøv igjen.", loadOrders));
  }
}

function renderOrders() {
  renderFilters();
  const list = $("orders-list");
  list.replaceChildren();
  const visible = state.filter === "all"
    ? state.orders
    : state.orders.filter((o) => o.status === state.filter);
  if (visible.length === 0) {
    const msg = state.filter === "all"
      ? "Ingen bestillinger ennå. Nye bestillinger dukker opp her."
      : "Ingen bestillinger med status \"" + STATUS_LABELS[state.filter] + "\" akkurat nå.";
    list.append(el("div", { class: "card empty-state" }, el("p", { class: "muted", text: msg })));
    return;
  }
  for (const order of visible) list.append(orderCard(order));
}

function renderFilters() {
  const holder = $("status-filters");
  holder.replaceChildren();
  const counts = {};
  for (const o of state.orders) counts[o.status] = (counts[o.status] || 0) + 1;
  for (const f of FILTERS) {
    const count = f === "all" ? state.orders.length : (counts[f] || 0);
    holder.append(el("button", {
      class: "filter-chip" + (state.filter === f ? " is-active" : ""),
      type: "button",
      "aria-pressed": String(state.filter === f),
      onclick: () => { state.filter = f; renderOrders(); },
    },
      el("span", { text: f === "all" ? "Alle" : STATUS_LABELS[f] }),
      el("span", { class: "chip-count", text: String(count) })));
  }
}

function orderCard(order) {
  const isOpen = state.expanded.has(order.id);
  const card = el("article", { class: "order-card card" + (isOpen ? " is-open" : "") });
  const head = el("button", {
    class: "order-head",
    type: "button",
    "aria-expanded": String(isOpen),
    onclick: () => {
      if (state.expanded.has(order.id)) state.expanded.delete(order.id);
      else state.expanded.add(order.id);
      renderOrders();
    },
  },
    el("span", { class: "order-num", text: order.orderNumber }),
    el("span", { class: "order-when", text: formatPickupDate(order.pickupDate) + " · " + order.pickupSlot }),
    el("span", { class: "order-cust", text: order.customer.name + " · " + order.customer.phone }),
    el("span", { class: "order-total price", text: formatKr(order.totalCents) }),
    badgeFor(order.status));
  card.append(head);
  if (isOpen) card.append(orderBody(order, card));
  return card;
}

function orderBody(order, card) {
  const body = el("div", { class: "order-body" });

  for (const line of order.lines) {
    const lineBox = el("div", { class: "order-line" });
    lineBox.append(el("div", { class: "line-top" },
      el("span", { class: "line-name", text: line.qty + " × " + line.productName }),
      el("span", { class: "price line-price", text: formatKr(line.lineTotalCents) })));
    if (line.options.length > 0) {
      lineBox.append(el("p", {
        class: "line-opts muted",
        text: line.options.map((o) => o.group + ": " + o.value).join(" · "),
      }));
    }
    if (line.qty > 1) {
      lineBox.append(el("p", { class: "line-opts muted", text: formatKr(line.unitPriceCents) + " per stk" }));
    }
    if (line.cakeText) {
      lineBox.append(el("div", { class: "cake-text" },
        el("span", { class: "cake-text-label", text: "Tekst på kaken" }),
        el("span", { class: "cake-text-value", text: "«" + line.cakeText + "»" })));
    }
    body.append(lineBox);
  }

  const meta = el("div", { class: "order-meta" });
  if (order.note) {
    meta.append(el("p", { class: "order-note" }, el("strong", { text: "Merknad: " }), order.note));
  }
  meta.append(el("p", { class: "muted", text: "E-post: " + order.customer.email }));
  meta.append(el("p", { class: "muted", text: "Betalingsreferanse: " + order.paymentReference + " (demobetaling)" }));
  body.append(meta);

  const actions = el("div", { class: "order-actions" });
  const next = NEXT_STATUS[order.status];
  if (next) {
    actions.append(el("button", {
      class: "btn btn-small btn-advance",
      type: "button",
      text: ADVANCE_LABELS[order.status],
      onclick: () => setStatus(order, next, card),
    }));
  }
  if (order.status !== "picked_up" && order.status !== "cancelled") {
    actions.append(el("button", {
      class: "btn btn-small btn-cancel",
      type: "button",
      text: "Kanseller",
      onclick: () => setStatus(order, "cancelled", card),
    }));
  } else {
    actions.append(el("span", {
      class: "muted done-note",
      text: order.status === "picked_up" ? "Bestillingen er hentet og fullført." : "Bestillingen er kansellert.",
    }));
  }
  body.append(actions);
  body.append(el("p", { class: "order-error", role: "alert", hidden: true }));
  return body;
}

async function setStatus(order, status, card) {
  if (status === "cancelled") {
    const ok = window.confirm("Vil du kansellere bestilling " + order.orderNumber + "? Dette kan ikke angres.");
    if (!ok) return;
  }
  const buttons = card.querySelectorAll("button");
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const data = await api("/api/admin/orders/" + order.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const idx = state.orders.findIndex((o) => o.id === order.id);
    if (idx !== -1) state.orders[idx] = data.order;
    renderOrders();
  } catch (err) {
    buttons.forEach((b) => { b.disabled = false; });
    const box = card.querySelector(".order-error");
    if (box) {
      box.textContent = err.message;
      box.hidden = false;
    }
  }
}

/* ---------------- Products view ---------------- */

async function loadProducts() {
  const list = $("products-list");
  list.replaceChildren(el("p", { class: "muted loading", text: "Henter produkter..." }));
  try {
    const data = await api("/api/admin/products");
    state.products = data.products;
    state.productsLoaded = true;
    renderProducts();
  } catch {
    list.replaceChildren(errorCard("Kunne ikke hente produktene. Sjekk tilkoblingen og prøv igjen.", loadProducts));
  }
}

function renderProducts() {
  fillCategoryDatalist();
  const list = $("products-list");
  list.replaceChildren();
  if (state.products.length === 0) {
    list.append(el("div", { class: "card empty-state" },
      el("p", { class: "muted", text: "Ingen produkter ennå. Trykk på Nytt produkt for å legge til det første." })));
    return;
  }
  for (const p of state.products) list.append(productRow(p));
}

function fillCategoryDatalist() {
  const datalist = $("category-list");
  datalist.replaceChildren();
  const seen = new Set();
  for (const p of state.products) {
    const c = (p.category || "").trim();
    if (c && !seen.has(c)) {
      seen.add(c);
      datalist.append(el("option", { value: c }));
    }
  }
}

function leadTimeText(days) {
  if (!days) return "samme dag";
  if (days === 1) return "1 dag ledetid";
  return days + " dager ledetid";
}

function productRow(p) {
  const row = el("div", { class: "product-row card" + (p.active ? "" : " is-inactive") });

  const thumb = el("div", { class: "product-thumb" });
  if (p.imageUrl) {
    const img = el("img", { src: p.imageUrl, alt: p.name });
    img.addEventListener("error", () => img.remove());
    thumb.append(img);
  }

  const main = el("div", { class: "product-main" });
  const nameLine = el("p", { class: "product-name" }, el("strong", { text: p.name }));
  if (!p.active) {
    nameLine.append(" ", el("span", { class: "badge badge-muted", text: "Inaktiv" }));
  }
  main.append(nameLine);
  const metaTail = " · " + leadTimeText(p.leadTimeDays)
    + " · sortering " + p.sortOrder
    + (p.canHaveCakeText ? " · kaketekst " + formatKr(p.cakeTextPriceCents || 0) : "");
  main.append(el("p", { class: "product-meta muted" },
    (p.category || "Uten kategori") + " · fra ",
    el("span", { class: "price meta-price", text: formatKr(p.basePriceCents) }),
    metaTail));

  const actions = el("div", { class: "product-actions" },
    el("button", { class: "btn btn-small", type: "button", text: "Rediger", onclick: () => openForm(p) }),
    el("button", {
      class: "btn btn-small " + (p.active ? "btn-cancel" : "btn-advance"),
      type: "button",
      text: p.active ? "Deaktiver" : "Aktiver",
      onclick: () => toggleActive(p, row),
    }));

  row.append(thumb, main, actions, el("p", { class: "order-error product-error", role: "alert", hidden: true }));
  return row;
}

async function toggleActive(p, row) {
  const buttons = row.querySelectorAll("button");
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const data = await api("/api/admin/products/" + p.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    const idx = state.products.findIndex((x) => x.id === p.id);
    if (idx !== -1) state.products[idx] = data.product;
    renderProducts();
  } catch (err) {
    buttons.forEach((b) => { b.disabled = false; });
    const box = row.querySelector(".product-error");
    if (box) {
      box.textContent = err.message;
      box.hidden = false;
    }
  }
}

/* ---------------- Product form ---------------- */

function kronerString(cents) {
  const kr = (cents || 0) / 100;
  return Number.isInteger(kr) ? String(kr) : kr.toFixed(2).replace(".", ",");
}

// Parse a kroner amount typed by the user ("490", "490,50") into oere. Returns
// null when the input is not a valid amount.
function parseKroner(raw) {
  const s = String(raw).trim().replace(/\s+/g, "").replace(",", ".");
  if (s === "" || !/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

function radioGroupName(name) {
  return "opt-default-" + name.trim().toLowerCase().replace(/\s+/g, "-");
}

function addOptionRow(groupName = "", valueName = "", priceDeltaCents = 0, isDefault = false) {
  const row = el("div", { class: "opt-row" });
  const gInput = el("input", { type: "text", "aria-label": "Gruppenavn", placeholder: "Gruppe, f.eks. Størrelse" });
  gInput.value = groupName;
  const vInput = el("input", { type: "text", "aria-label": "Valgnavn", placeholder: "Valg, f.eks. 12 biter" });
  vInput.value = valueName;
  const pInput = el("input", { type: "text", inputmode: "decimal", class: "opt-price", "aria-label": "Pristillegg i kroner", placeholder: "0" });
  pInput.value = kronerString(priceDeltaCents);
  const radio = el("input", { type: "radio", class: "opt-default" });
  radio.name = radioGroupName(groupName);
  radio.checked = !!isDefault;
  gInput.addEventListener("input", () => { radio.name = radioGroupName(gInput.value); });
  const radioLabel = el("label", { class: "opt-default-label" }, radio, el("span", { text: "Standard" }));
  const removeBtn = el("button", { type: "button", class: "btn btn-small opt-remove", text: "Fjern", onclick: () => row.remove() });
  row.append(gInput, vInput, pInput, radioLabel, removeBtn);
  $("option-rows").append(row);
}

// Serialize the option rows to the contract's options array. Row order defines
// position. Throws with a Norwegian message when a row is invalid.
function collectOptions() {
  const rows = [...document.querySelectorAll("#option-rows .opt-row")];
  const options = [];
  for (const row of rows) {
    const [gInput, vInput, pInput] = row.querySelectorAll('input[type="text"]');
    const radio = row.querySelector('input[type="radio"]');
    const groupName = gInput.value.trim();
    const valueName = vInput.value.trim();
    if (!groupName && !valueName) continue; // ignore fully empty rows
    if (!groupName || !valueName) {
      throw new Error("Alle valgrader må ha både gruppenavn og valgnavn.");
    }
    const delta = parseKroner(pInput.value === "" ? "0" : pInput.value);
    if (delta == null) {
      throw new Error("Ugyldig pristillegg for \"" + valueName + "\". Skriv beløpet i kroner.");
    }
    options.push({ groupName, valueName, priceDeltaCents: delta, isDefault: radio.checked });
  }
  // Validate defaults per the same normalized bucket the "Standard" radios
  // use (radioGroupName), so group names that differ only in case or spacing
  // never demand more defaults than the radios can express.
  const groups = new Map();
  for (const o of options) {
    const key = radioGroupName(o.groupName);
    const entry = groups.get(key) || { name: o.groupName, defaults: 0 };
    if (o.isDefault) entry.defaults += 1;
    groups.set(key, entry);
  }
  for (const entry of groups.values()) {
    if (entry.defaults === 0) {
      throw new Error("Merk ett valg som standard i gruppen \"" + entry.name + "\".");
    }
  }
  return options;
}

function nextSortOrder() {
  let max = 0;
  for (const p of state.products) {
    if (Number.isInteger(p.sortOrder) && p.sortOrder > max) max = p.sortOrder;
  }
  return max + 1;
}

function syncCakeTextPrice() {
  $("f-caketextprice").disabled = !$("f-cantext").checked;
}

function openForm(product) {
  state.editingId = product ? product.id : null;
  $("form-title").textContent = product ? "Rediger produkt" : "Nytt produkt";
  $("f-name").value = product ? product.name : "";
  $("f-description").value = product ? (product.description || "") : "";
  $("f-category").value = product ? (product.category || "") : "";
  $("f-image").value = product ? (product.imageUrl || "") : "";
  $("f-baseprice").value = product ? kronerString(product.basePriceCents) : "";
  $("f-leadtime").value = product ? String(product.leadTimeDays) : "0";
  $("f-cantext").checked = product ? !!product.canHaveCakeText : false;
  $("f-caketextprice").value = product ? kronerString(product.cakeTextPriceCents || 0) : "0";
  $("f-sortorder").value = product ? String(product.sortOrder) : String(nextSortOrder());
  syncCakeTextPrice();
  $("option-rows").replaceChildren();
  if (product) {
    for (const group of product.optionGroups || []) {
      for (const opt of group.options) {
        addOptionRow(group.name, opt.value, opt.priceDeltaCents, opt.isDefault);
      }
    }
  }
  $("form-error").hidden = true;
  $("product-form-panel").hidden = false;
  $("product-form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  $("f-name").focus();
}

function closeForm() {
  state.editingId = null;
  $("product-form-panel").hidden = true;
  $("form-error").hidden = true;
}

function showFormError(message) {
  const box = $("form-error");
  box.textContent = message;
  box.hidden = false;
}

let statusTimer = null;
function setProductsStatus(message) {
  const note = $("products-status");
  note.textContent = message;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { note.textContent = ""; }, 5000);
}

async function submitForm(event) {
  event.preventDefault();
  $("form-error").hidden = true;

  const name = $("f-name").value.trim();
  if (!name) return showFormError("Produktet må ha et navn.");

  const base = parseKroner($("f-baseprice").value);
  if (base == null || base <= 0) return showFormError("Grunnprisen må være et beløp i kroner, for eksempel 490.");

  const leadRaw = $("f-leadtime").value.trim();
  const lead = leadRaw === "" ? 0 : Number(leadRaw);
  if (!Number.isInteger(lead) || lead < 0 || lead > 30) return showFormError("Ledetiden må være et helt tall mellom 0 og 30.");

  const sortRaw = $("f-sortorder").value.trim();
  const sort = sortRaw === "" ? 0 : Number(sortRaw);
  if (!Number.isInteger(sort)) return showFormError("Sorteringen må være et helt tall.");

  const canText = $("f-cantext").checked;
  let cakePrice = 0;
  if (canText) {
    const rawCake = $("f-caketextprice").value;
    cakePrice = parseKroner(rawCake === "" ? "0" : rawCake);
    if (cakePrice == null || cakePrice < 0) return showFormError("Prisen for kaketekst må være et gyldig beløp i kroner.");
  }

  let options;
  try {
    options = collectOptions();
  } catch (err) {
    return showFormError(err.message);
  }

  const body = {
    name,
    description: $("f-description").value.trim(),
    category: $("f-category").value.trim(),
    imageUrl: $("f-image").value.trim(),
    basePriceCents: base,
    leadTimeDays: lead,
    canHaveCakeText: canText,
    cakeTextPriceCents: canText ? cakePrice : 0,
    sortOrder: sort,
    options,
  };

  const saveBtn = $("form-save");
  saveBtn.disabled = true;
  try {
    if (state.editingId == null) {
      await api("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      // PATCH replaces the whole option list, so the full set is always sent.
      await api("/api/admin/products/" + state.editingId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    closeForm();
    setProductsStatus("Produktet ble lagret.");
    await loadProducts();
  } catch (err) {
    showFormError(err.message);
  } finally {
    saveBtn.disabled = false;
  }
}

/* ---------------- Tabs, header, init ---------------- */

function activateTab(which) {
  const ordersActive = which === "orders";
  $("tab-orders").classList.toggle("is-active", ordersActive);
  $("tab-orders").setAttribute("aria-selected", String(ordersActive));
  $("tab-products").classList.toggle("is-active", !ordersActive);
  $("tab-products").setAttribute("aria-selected", String(!ordersActive));
  $("panel-orders").hidden = !ordersActive;
  $("panel-products").hidden = ordersActive;
  if (ordersActive && !state.ordersLoaded) loadOrders();
  if (!ordersActive && !state.productsLoaded) loadProducts();
  history.replaceState(null, "", ordersActive ? "#bestillinger" : "#produkter");
}

function updateCartBadge() {
  const count = cartCount(loadCart());
  const badge = $("cart-badge");
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

async function loadShopName() {
  try {
    const data = await api("/api/shop");
    $("bakery-name").textContent = data.bakery.name;
    document.title = "Bakeriadmin - " + data.bakery.name;
  } catch {
    // keep the fallback heading
  }
}

function init() {
  updateCartBadge();
  loadShopName();
  $("tab-orders").addEventListener("click", () => activateTab("orders"));
  $("tab-products").addEventListener("click", () => activateTab("products"));
  $("refresh-orders").addEventListener("click", loadOrders);
  $("refresh-products").addEventListener("click", loadProducts);
  $("new-product").addEventListener("click", () => openForm(null));
  $("add-option-row").addEventListener("click", () => addOptionRow());
  $("form-cancel").addEventListener("click", closeForm);
  $("f-cantext").addEventListener("change", syncCakeTextPrice);
  $("product-form").addEventListener("submit", submitForm);
  activateTab(location.hash === "#produkter" ? "products" : "orders");
}

init();
