/* Variant E "Nordisk" bakery admin: order board + product management.
   All user-facing strings are Norwegian bokmål. */

/* ---------- shared helpers copied from docs/contract.md ---------- */
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

/* ---------- constants ---------- */
const STATUS_LABELS = {
  new: "Ny",
  confirmed: "Bekreftet",
  ready: "Klar til henting",
  picked_up: "Hentet",
  cancelled: "Kansellert",
};
const STATUS_BADGE_CLASS = {
  new: "badge",
  confirmed: "badge",
  ready: "badge badge-ok",
  picked_up: "badge badge-muted",
  cancelled: "badge badge-warn",
};
const STATUS_ORDER = ["new", "confirmed", "ready", "picked_up", "cancelled"];
const NEXT_STATUS = { new: "confirmed", confirmed: "ready", ready: "picked_up" };
const NEXT_ACTION_LABEL = {
  confirmed: "Bekreft",
  ready: "Marker som klar",
  picked_up: "Marker som hentet",
};
const TERMINAL_STATUSES = ["picked_up", "cancelled"];
const IMG_FILES = [
  "/img/blotkake.svg",
  "/img/croissant.svg",
  "/img/festkake.svg",
  "/img/gulrotkake.svg",
  "/img/kanelbolle.svg",
  "/img/kransekake.svg",
  "/img/makroner.svg",
  "/img/sjokoladekake.svg",
  "/img/skolebrod.svg",
  "/img/surdeigsbrod.svg",
];

/* ---------- tiny DOM helper (textContent everywhere, no innerHTML) ---------- */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (val === null || val === undefined) continue;
    if (key === "class") node.className = val;
    else if (key === "text") node.textContent = val;
    else if (key === "value") node.value = val;
    else if (key === "checked") node.checked = Boolean(val);
    else node.setAttribute(key, val);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    const msg = data && data.error ? data.error : "Noe gikk galt (" + res.status + ")";
    throw new Error(msg);
  }
  return data;
}

/* ---------- money parsing (kroner text input -> integer øre) ---------- */
function parseKrInput(raw, allowNegative = false) {
  const s = String(raw).trim().replace(/\s+/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (!allowNegative && n < 0) return null;
  return Math.round(n * 100);
}
function krString(cents) {
  const kr = (cents || 0) / 100;
  return Number.isInteger(kr) ? String(kr) : kr.toFixed(2).replace(".", ",");
}

/* ---------- dates ---------- */
const shortDate = new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short" });
const longDate = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
});
function fmtDate(iso, fmt = shortDate) {
  const d = new Date(iso + "T12:00:00");
  return Number.isNaN(d.getTime()) ? iso : fmt.format(d);
}
function fmtDateTime(iso) {
  // createdAt comes as "2026-07-21 14:02:11"; normalize for Date parsing.
  const d = new Date(String(iso).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? iso : dateTime.format(d);
}

/* ---------- state ---------- */
const state = {
  orders: [],
  statuses: STATUS_ORDER,
  filter: "all",
  expanded: new Set(),
  orderErrors: new Map(),
  products: [],
  productsLoaded: false,
  productErrors: new Map(),
};

const refs = {
  ordersList: document.getElementById("orders-list"),
  ordersStatus: document.getElementById("orders-status"),
  orderFilters: document.getElementById("order-filters"),
  ordersRefresh: document.getElementById("orders-refresh"),
  productsList: document.getElementById("products-list"),
  productsStatus: document.getElementById("products-status"),
  productNew: document.getElementById("product-new"),
  formHolder: document.getElementById("product-form-holder"),
  tabOrders: document.getElementById("tab-orders"),
  tabProducts: document.getElementById("tab-products"),
  viewOrders: document.getElementById("view-orders"),
  viewProducts: document.getElementById("view-products"),
  cartBadge: document.getElementById("cart-badge"),
};

/* ---------- notices ---------- */
function setNotice(container, text) {
  container.replaceChildren(el("div", { class: "card notice", text }));
}
function setErrorNotice(container, message, retry) {
  const btn = el("button", { class: "btn btn-small", type: "button", text: "Prøv igjen" });
  btn.addEventListener("click", retry);
  container.replaceChildren(
    el("div", { class: "card notice notice-error" }, el("p", { text: message }), btn),
  );
}
function clearNotice(container) {
  container.replaceChildren();
}

/* ================================================================
   ORDERS VIEW
   ================================================================ */
async function loadOrders() {
  refs.ordersRefresh.disabled = true;
  setNotice(refs.ordersStatus, "Laster bestillinger...");
  try {
    const data = await fetchJson("/api/admin/orders");
    state.orders = Array.isArray(data.orders) ? data.orders : [];
    if (Array.isArray(data.statuses) && data.statuses.length) state.statuses = data.statuses;
    state.orderErrors.clear();
    renderOrders();
  } catch (err) {
    refs.ordersList.replaceChildren();
    refs.orderFilters.replaceChildren();
    setErrorNotice(refs.ordersStatus, "Kunne ikke laste bestillinger. " + err.message, loadOrders);
  } finally {
    refs.ordersRefresh.disabled = false;
  }
}

function renderFilters() {
  const counts = {};
  for (const o of state.orders) counts[o.status] = (counts[o.status] || 0) + 1;
  const makeChip = (key, label, count) => {
    const chip = el("button", {
      class: "chip",
      type: "button",
      "aria-pressed": String(state.filter === key),
      text: label + " (" + count + ")",
    });
    chip.addEventListener("click", () => {
      state.filter = key;
      renderOrders();
    });
    return chip;
  };
  const chips = [makeChip("all", "Alle", state.orders.length)];
  for (const s of state.statuses) chips.push(makeChip(s, STATUS_LABELS[s] || s, counts[s] || 0));
  refs.orderFilters.replaceChildren(...chips);
}

function renderOrders() {
  renderFilters();
  const visible = state.filter === "all"
    ? state.orders
    : state.orders.filter((o) => o.status === state.filter);
  if (!visible.length) {
    refs.ordersList.replaceChildren();
    if (state.filter === "all") {
      refs.ordersStatus.replaceChildren(
        el("div", { class: "card notice" },
          el("p", { text: "Ingen bestillinger ennå." }),
          el("a", { href: "./index.html", text: "Gå til butikken" })),
      );
    } else {
      setNotice(refs.ordersStatus, "Ingen bestillinger med status «" + (STATUS_LABELS[state.filter] || state.filter) + "».");
    }
    return;
  }
  clearNotice(refs.ordersStatus);
  refs.ordersList.replaceChildren(...visible.map(orderCard));
}

function orderCard(order) {
  const li = el("li", { class: "card order-card" });
  const expanded = state.expanded.has(order.id);
  const detailId = "order-detail-" + order.id;
  const head = el("button", {
    class: "order-head",
    type: "button",
    "aria-expanded": String(expanded),
    "aria-controls": detailId,
  });
  head.append(
    el("span", { class: "oh-num", text: order.orderNumber }),
    el("span", { class: "oh-pickup" },
      el("span", { text: fmtDate(order.pickupDate) }),
      el("span", { class: "oh-sub", text: "kl. " + order.pickupSlot })),
    el("span", { class: "oh-cust" },
      el("span", { text: order.customer.name }),
      el("span", { class: "oh-sub", text: order.customer.phone })),
    el("span", { class: "oh-total price", text: formatKr(order.totalCents) }),
    el("span", { class: "oh-status " + (STATUS_BADGE_CLASS[order.status] || "badge"), text: STATUS_LABELS[order.status] || order.status }),
    el("span", { class: "oh-caret", "aria-hidden": "true", text: expanded ? "▴" : "▾" }),
  );
  head.addEventListener("click", () => {
    if (state.expanded.has(order.id)) state.expanded.delete(order.id);
    else state.expanded.add(order.id);
    renderOrders();
  });
  li.append(head);
  if (expanded) li.append(orderDetail(order, detailId));
  return li;
}

function orderDetail(order, detailId) {
  const wrap = el("div", { class: "order-detail", id: detailId });

  const lines = el("ul", { class: "od-lines" });
  for (const line of order.lines || []) {
    const item = el("li", { class: "od-line" });
    item.append(
      el("div", { class: "od-line-top" },
        el("span", { class: "od-qty-name", text: line.qty + " × " + line.productName }),
        el("span", { class: "price", text: formatKr(line.lineTotalCents) })),
    );
    if (line.qty > 1) {
      item.append(el("div", { class: "od-opts", text: formatKr(line.unitPriceCents) + " per stk" }));
    }
    if (line.options && line.options.length) {
      item.append(el("div", {
        class: "od-opts",
        text: line.options.map((op) => op.group + ": " + op.value).join(" · "),
      }));
    }
    if (line.cakeText) {
      item.append(
        el("div", { class: "cake-text" },
          el("span", { class: "cake-text-label", text: "Tekst på kaken" }),
          el("span", { class: "cake-text-value", text: "«" + line.cakeText + "»" })),
      );
    }
    lines.append(item);
  }
  wrap.append(lines);

  wrap.append(
    el("p", { class: "od-total" },
      el("strong", { class: "price", text: "Totalt " + formatKr(order.totalCents) }),
      el("span", { class: "muted", text: " inkl. mva" })),
  );

  const meta = el("div", { class: "od-meta" });
  if (order.note) {
    meta.append(el("div", {},
      el("span", { class: "od-key", text: "Merknad: " }),
      el("span", { class: "od-note-value", text: order.note })));
  }
  meta.append(el("div", {},
    el("span", { class: "od-key", text: "Henting: " }),
    el("span", { text: fmtDate(order.pickupDate, longDate) + ", kl. " + order.pickupSlot })));
  meta.append(el("div", {},
    el("span", { class: "od-key", text: "E-post: " }),
    el("span", { text: order.customer.email })));
  meta.append(el("div", {},
    el("span", { class: "od-key", text: "Telefon: " }),
    el("span", { text: order.customer.phone })));
  meta.append(el("div", {},
    el("span", { class: "od-key", text: "Betalingsreferanse: " }),
    el("span", { text: order.paymentReference })));
  meta.append(el("div", {},
    el("span", { class: "od-key", text: "Registrert: " }),
    el("span", { text: fmtDateTime(order.createdAt) })));
  wrap.append(meta);

  const actions = el("div", { class: "od-actions" });
  const next = NEXT_STATUS[order.status];
  if (next) {
    const btn = el("button", { class: "btn btn-primary btn-small", type: "button", text: NEXT_ACTION_LABEL[next] });
    btn.addEventListener("click", () => changeStatus(order, next, actions));
    actions.append(btn);
  }
  if (!TERMINAL_STATUSES.includes(order.status)) {
    const btn = el("button", { class: "btn btn-danger btn-small", type: "button", text: "Kanseller" });
    btn.addEventListener("click", () => {
      if (!window.confirm("Kansellere bestilling " + order.orderNumber + "? Dette kan ikke angres.")) return;
      changeStatus(order, "cancelled", actions);
    });
    actions.append(btn);
  }
  const err = state.orderErrors.get(order.id);
  if (err) actions.append(el("span", { class: "action-error", role: "alert", text: err }));
  if (actions.childNodes.length) wrap.append(actions);
  return wrap;
}

async function changeStatus(order, nextStatus, actionsEl) {
  for (const b of actionsEl.querySelectorAll("button")) b.disabled = true;
  state.orderErrors.delete(order.id);
  try {
    const data = await fetchJson("/api/admin/orders/" + order.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (data && data.order) {
      const idx = state.orders.findIndex((o) => o.id === order.id);
      if (idx !== -1) state.orders[idx] = data.order;
    }
    renderOrders();
  } catch (err) {
    state.orderErrors.set(order.id, err.message);
    renderOrders();
  }
}

/* ================================================================
   PRODUCTS VIEW
   ================================================================ */
async function loadProducts() {
  state.productsLoaded = true;
  setNotice(refs.productsStatus, "Laster produkter...");
  try {
    const data = await fetchJson("/api/admin/products");
    state.products = Array.isArray(data.products) ? data.products : [];
    state.productErrors.clear();
    renderProducts();
  } catch (err) {
    refs.productsList.replaceChildren();
    setErrorNotice(refs.productsStatus, "Kunne ikke laste produkter. " + err.message, loadProducts);
  }
}

function renderProducts() {
  if (!state.products.length) {
    refs.productsList.replaceChildren();
    setNotice(refs.productsStatus, "Ingen produkter ennå. Trykk Nytt produkt for å legge til det første.");
    return;
  }
  clearNotice(refs.productsStatus);
  refs.productsList.replaceChildren(...state.products.map(productRow));
}

function showProductsNotice(text) {
  refs.productsStatus.replaceChildren(el("div", { class: "card notice notice-ok", text }));
}

function leadLabel(days) {
  const d = Number(days) || 0;
  if (d === 0) return "Kan hentes samme dag";
  return "Bestilles minst " + d + (d === 1 ? " dag" : " dager") + " før henting";
}

function productRow(product) {
  const li = el("li", { class: "card product-row" + (product.active ? "" : " product-inactive") });
  li.append(
    el("img", { class: "p-thumb", src: product.imageUrl || "", alt: product.name }),
    el("div", { class: "p-main" },
      el("div", { class: "p-name", text: product.name }),
      el("div", { class: "p-cat", text: product.category || "Uten kategori" })),
    el("div", { class: "p-meta" },
      el("span", { class: "price", text: "fra " + formatKr(product.basePriceCents) }),
      el("span", { class: "p-lead", text: leadLabel(product.leadTimeDays) })),
    el("span", {
      class: "p-state " + (product.active ? "badge badge-ok" : "badge badge-warn"),
      text: product.active ? "Aktiv" : "Inaktiv",
    }),
  );
  const actions = el("div", { class: "p-actions" });
  const edit = el("button", { class: "btn btn-small", type: "button", text: "Rediger" });
  edit.addEventListener("click", () => openProductForm(product));
  const toggle = el("button", {
    class: "btn btn-small" + (product.active ? "" : " btn-primary"),
    type: "button",
    text: product.active ? "Deaktiver" : "Aktiver",
  });
  toggle.addEventListener("click", () => toggleActive(product, toggle));
  actions.append(edit, toggle);
  li.append(actions);
  const err = state.productErrors.get(product.id);
  if (err) li.append(el("div", { class: "action-error p-error", role: "alert", text: err }));
  return li;
}

async function toggleActive(product, btn) {
  btn.disabled = true;
  state.productErrors.delete(product.id);
  try {
    await fetchJson("/api/admin/products/" + product.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !product.active }),
    });
    await loadProducts();
  } catch (err) {
    state.productErrors.set(product.id, err.message);
    renderProducts();
  }
}

/* ---------- product create/edit form ---------- */
function collectOptions(rowsBox) {
  const rows = [...rowsBox.querySelectorAll(".opt-row")];
  const out = [];
  for (const row of rows) {
    const [groupInput, valueInput, deltaInput] = row.querySelectorAll('input[type="text"]');
    const groupName = groupInput.value.trim();
    const valueName = valueInput.value.trim();
    const deltaRaw = deltaInput.value.trim();
    if (!groupName && !valueName && (deltaRaw === "" || deltaRaw === "0")) continue;
    if (!groupName || !valueName) {
      return { error: "Alle valgrader trenger både gruppenavn og navn på valget. Fjern tomme rader." };
    }
    const priceDeltaCents = deltaRaw === "" ? 0 : parseKrInput(deltaRaw, true);
    if (priceDeltaCents === null) {
      return { error: 'Ugyldig pristillegg: "' + deltaRaw + '". Skriv et beløp i kroner.' };
    }
    out.push({
      groupName,
      valueName,
      priceDeltaCents,
      isDefault: row.querySelector('input[type="radio"]').checked,
    });
  }
  // Exactly one default per group: fall back to the group's first row.
  const groups = new Map();
  for (const o of out) {
    const key = o.groupName.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  for (const rows2 of groups.values()) {
    if (!rows2.some((o) => o.isDefault)) rows2[0].isDefault = true;
  }
  return { options: out };
}

function closeProductForm() {
  refs.formHolder.replaceChildren();
}

function openProductForm(product) {
  const isNew = !product;

  const form = el("form", { class: "card product-form", novalidate: "" });
  form.append(el("h2", { text: isNew ? "Nytt produkt" : "Rediger produkt" }));

  const nameIn = el("input", { type: "text", value: product ? product.name : "" });
  const descIn = el("textarea", { rows: "3", value: product ? product.description || "" : "" });
  const catIn = el("input", { type: "text", list: "pf-cat-list", value: product ? product.category || "" : "" });
  const imgIn = el("input", {
    type: "text",
    list: "pf-img-list",
    placeholder: "/img/blotkake.svg",
    value: product ? product.imageUrl || "" : "",
  });
  const priceIn = el("input", {
    type: "text",
    inputmode: "decimal",
    placeholder: "490",
    value: product ? krString(product.basePriceCents) : "",
  });
  const leadIn = el("input", {
    type: "number", min: "0", max: "30", step: "1",
    value: product ? String(product.leadTimeDays) : "0",
  });
  const cakeChk = el("input", { type: "checkbox", checked: product ? !!product.canHaveCakeText : false });
  const cakePriceIn = el("input", {
    type: "text",
    inputmode: "decimal",
    value: product ? krString(product.cakeTextPriceCents || 0) : "0",
  });
  const nextSort = state.products.reduce((m, p) => Math.max(m, p.sortOrder || 0), 0) + 1;
  const sortIn = el("input", {
    type: "number", step: "1",
    value: product ? String(product.sortOrder) : String(nextSort),
  });

  function syncCakePrice() { cakePriceIn.disabled = !cakeChk.checked; }
  cakeChk.addEventListener("change", syncCakePrice);
  syncCakePrice();

  function field(id, labelText, input, hint, wide) {
    const wrap = el("div", { class: "field" + (wide ? " field-wide" : "") });
    input.id = id;
    wrap.append(el("label", { for: id, text: labelText }), input);
    if (hint) wrap.append(el("p", { class: "hint", text: hint }));
    return wrap;
  }

  /* options editor */
  const rowsBox = el("div", { class: "opt-rows" });

  function syncRadioNames() {
    const rows = [...rowsBox.querySelectorAll(".opt-row")];
    rows.forEach((row, i) => {
      const groupInput = row.querySelector('input[type="text"]');
      const radio = row.querySelector('input[type="radio"]');
      const key = groupInput.value.trim().toLowerCase().replace(/\s+/g, "-");
      radio.name = "pf-default-" + (key || "row-" + i);
    });
  }

  function optionRowEl(data) {
    const row = el("div", { class: "opt-row" });
    const groupIn = el("input", { type: "text", "aria-label": "Gruppenavn", placeholder: "Gruppe", value: data.groupName || "" });
    const valueIn = el("input", { type: "text", "aria-label": "Navn på valget", placeholder: "Valg", value: data.valueName || "" });
    const deltaIn = el("input", {
      type: "text", inputmode: "decimal", "aria-label": "Pristillegg i kroner",
      value: data.priceDeltaCents ? krString(data.priceDeltaCents) : "0",
    });
    const radio = el("input", { type: "radio", "aria-label": "Standardvalg i gruppen" });
    const removeBtn = el("button", { class: "btn btn-small opt-remove", type: "button", text: "Fjern" });
    removeBtn.addEventListener("click", () => { row.remove(); syncRadioNames(); });
    groupIn.addEventListener("input", syncRadioNames);
    row.append(groupIn, valueIn, deltaIn, radio, removeBtn);
    row._isDefault = !!data.isDefault;
    return row;
  }

  const optWrap = el("div", { class: "opt-editor field-wide" });
  optWrap.append(
    el("h3", { text: "Valggrupper" }),
    el("p", {
      class: "hint",
      text: "Rader med samme gruppenavn blir en gruppe. Rekkefølgen på radene bestemmer rekkefølgen i butikken. Listen erstatter alle valg som er lagret fra før.",
    }),
  );
  const scroll = el("div", { class: "opt-scroll" });
  scroll.append(
    el("div", { class: "opt-head-row", "aria-hidden": "true" },
      el("span", { text: "Gruppe" }),
      el("span", { text: "Valg" }),
      el("span", { text: "Tillegg (kr)" }),
      el("span", { text: "Standard" }),
      el("span", { text: "" })),
    rowsBox,
  );
  optWrap.append(scroll);
  const addRowBtn = el("button", { class: "btn btn-small", type: "button", text: "Legg til rad" });
  addRowBtn.addEventListener("click", () => {
    rowsBox.append(optionRowEl({}));
    syncRadioNames();
  });
  optWrap.append(addRowBtn);

  if (product && Array.isArray(product.optionGroups)) {
    for (const group of product.optionGroups) {
      for (const opt of group.options) {
        rowsBox.append(optionRowEl({
          groupName: group.name,
          valueName: opt.value,
          priceDeltaCents: opt.priceDeltaCents,
          isDefault: opt.isDefault,
        }));
      }
    }
    syncRadioNames();
    for (const row of rowsBox.querySelectorAll(".opt-row")) {
      if (row._isDefault) row.querySelector('input[type="radio"]').checked = true;
    }
  }

  const grid = el("div", { class: "form-grid" });
  grid.append(
    field("pf-name", "Navn", nameIn),
    field("pf-cat", "Kategori", catIn),
    field("pf-desc", "Beskrivelse", descIn, null, true),
    field("pf-img", "Bildeadresse", imgIn, "Tilgjengelige bilder: " + IMG_FILES.join(", "), true),
    field("pf-price", "Grunnpris (kr)", priceIn),
    field("pf-lead", "Bestillingstid (dager)", leadIn, "0 til 30 dager. 0 betyr at produktet kan bestilles samme dag."),
    el("div", { class: "field" },
      el("label", { class: "check-field" }, cakeChk, "Kan ha tekst på kaken")),
    field("pf-cakeprice", "Pris for kaketekst (kr)", cakePriceIn),
    field("pf-sort", "Sortering", sortIn, "Lavere tall vises først i butikken."),
    optWrap,
  );

  const errEl = el("p", { class: "form-error", role: "alert", hidden: "" });
  function showErr(msg) {
    errEl.hidden = false;
    errEl.textContent = msg;
  }

  const submitBtn = el("button", {
    class: "btn btn-primary", type: "submit",
    text: isNew ? "Opprett produkt" : "Lagre endringer",
  });
  const cancelBtn = el("button", { class: "btn", type: "button", text: "Avbryt" });
  cancelBtn.addEventListener("click", closeProductForm);

  const cats = [...new Set(state.products.map((p) => p.category).filter(Boolean))];
  form.append(
    grid,
    errEl,
    el("div", { class: "form-actions" }, submitBtn, cancelBtn),
    el("datalist", { id: "pf-cat-list" }, cats.map((c) => el("option", { value: c }))),
    el("datalist", { id: "pf-img-list" }, IMG_FILES.map((f) => el("option", { value: f }))),
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.hidden = true;

    const name = nameIn.value.trim();
    if (!name) return showErr("Navn er påkrevd.");
    const basePriceCents = parseKrInput(priceIn.value);
    if (basePriceCents === null) return showErr("Grunnpris må være et gyldig beløp i kroner.");
    const leadRaw = leadIn.value.trim();
    const leadTimeDays = leadRaw === "" ? 0 : Number(leadRaw);
    if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 30) {
      return showErr("Bestillingstid må være et helt tall mellom 0 og 30 dager.");
    }
    let cakeTextPriceCents = 0;
    if (cakeChk.checked) {
      cakeTextPriceCents = cakePriceIn.value.trim() === "" ? 0 : parseKrInput(cakePriceIn.value);
      if (cakeTextPriceCents === null) return showErr("Pris for kaketekst må være et gyldig beløp i kroner.");
    }
    const sortRaw = sortIn.value.trim();
    const sortOrder = sortRaw === "" ? 0 : Number(sortRaw);
    if (!Number.isInteger(sortOrder)) return showErr("Sortering må være et helt tall.");
    const collected = collectOptions(rowsBox);
    if (collected.error) return showErr(collected.error);

    // On PATCH, options always REPLACES the whole list, so send the full set.
    const payload = {
      name,
      description: descIn.value.trim(),
      category: catIn.value.trim(),
      imageUrl: imgIn.value.trim(),
      basePriceCents,
      leadTimeDays,
      canHaveCakeText: cakeChk.checked,
      cakeTextPriceCents,
      sortOrder,
      options: collected.options,
    };

    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      const url = isNew ? "/api/admin/products" : "/api/admin/products/" + product.id;
      const data = await fetchJson(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      closeProductForm();
      await loadProducts();
      showProductsNotice("Lagret: " + (data && data.product ? data.product.name : name));
    } catch (err) {
      showErr(err.message);
      submitBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });

  refs.formHolder.replaceChildren(form);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  nameIn.focus();
}

/* ================================================================
   TABS, HEADER, INIT
   ================================================================ */
function renderCartBadge() {
  const n = cartCount(loadCart());
  refs.cartBadge.textContent = String(n);
  refs.cartBadge.hidden = n === 0;
}

function activateTab(hash) {
  const products = hash === "produkter";
  refs.tabOrders.setAttribute("aria-selected", String(!products));
  refs.tabProducts.setAttribute("aria-selected", String(products));
  refs.viewOrders.hidden = products;
  refs.viewProducts.hidden = !products;
  if (products && !state.productsLoaded) loadProducts();
}

refs.tabOrders.addEventListener("click", () => { location.hash = "bestillinger"; });
refs.tabProducts.addEventListener("click", () => { location.hash = "produkter"; });
window.addEventListener("hashchange", () => activateTab(location.hash.slice(1)));

refs.ordersRefresh.addEventListener("click", loadOrders);
refs.productNew.addEventListener("click", () => openProductForm(null));
window.addEventListener("storage", renderCartBadge);

renderCartBadge();
activateTab(location.hash.slice(1));
loadOrders();
