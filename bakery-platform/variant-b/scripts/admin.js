// Variant B admin: order board + product management.
// Each page owns its script; shared helpers are copied from docs/contract.md.

const CART_KEY = "bakeri_cart_v1";
export function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || { lines: [] }; }
  catch { return { lines: [] }; }
}
export function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
export function cartCount(cart) { return cart.lines.reduce((n, l) => n + l.qty, 0); }
export function formatKr(cents) {
  const kr = cents / 100;
  return "kr " + (Number.isInteger(kr) ? kr : kr.toFixed(2).replace(".", ","));
}

// ---------- tiny DOM + fetch helpers ----------

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
}

async function api(path, options = {}) {
  const init = { method: options.method || "GET" };
  if (options.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, init);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  return { ok: res.ok, status: res.status, data };
}

function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || "");
}

function krString(cents) {
  const kr = (cents || 0) / 100;
  return Number.isInteger(kr) ? String(kr) : kr.toFixed(2).replace(".", ",");
}

function parseKrToCents(value) {
  const s = String(value).trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number.parseFloat(s) * 100);
}

// ---------- status metadata (labels + tones per contract) ----------

const STATUS_META = {
  new: { label: "Ny", tone: "badge-accent" },
  confirmed: { label: "Bekreftet", tone: "badge-accent" },
  ready: { label: "Klar til henting", tone: "badge-ok" },
  picked_up: { label: "Hentet", tone: "badge-muted" },
  cancelled: { label: "Kansellert", tone: "badge-warn" },
};
const STATUS_ORDER = ["new", "confirmed", "ready", "picked_up", "cancelled"];
const NEXT_STATUS = { new: "confirmed", confirmed: "ready", ready: "picked_up" };
const ADVANCE_LABEL = { confirmed: "Bekreft", ready: "Sett klar til henting", picked_up: "Marker som hentet" };
const TERMINAL = new Set(["picked_up", "cancelled"]);

function statusLabel(status) {
  return STATUS_META[status] ? STATUS_META[status].label : String(status);
}

function statusBadge(status) {
  const meta = STATUS_META[status];
  return el("span", { class: "badge " + (meta ? meta.tone : ""), text: statusLabel(status) });
}

// ---------- orders view ----------

let orders = [];
let statusList = STATUS_ORDER.slice();
let orderFilter = "all";
const expandedOrders = new Set();
const pendingOrders = new Set();
const orderErrors = new Map();

async function loadOrders() {
  const statusEl = $("#orders-status");
  statusEl.replaceChildren(el("p", { class: "status-msg", text: "Laster bestillinger ..." }));
  $("#orders-list").replaceChildren();
  try {
    const res = await api("/api/admin/orders");
    if (!res.ok || !res.data || !Array.isArray(res.data.orders)) throw new Error("bad response");
    orders = res.data.orders;
    if (Array.isArray(res.data.statuses) && res.data.statuses.length) statusList = res.data.statuses;
    statusEl.replaceChildren();
    renderOrderFilters();
    renderOrders();
  } catch {
    statusEl.replaceChildren(el("div", { class: "error-box" }, [
      el("span", { text: "Kunne ikke hente bestillingene. Sjekk tilkoblingen og prøv igjen." }),
      el("button", { class: "btn btn-small", type: "button", onclick: loadOrders, text: "Prøv igjen" }),
    ]));
  }
}

function renderOrderFilters() {
  const counts = {};
  for (const o of orders) counts[o.status] = (counts[o.status] || 0) + 1;
  const filterBtn = (key, label, count) => el("button", {
    class: "filter-btn" + (orderFilter === key ? " is-active" : ""),
    type: "button",
    "aria-pressed": String(orderFilter === key),
    onclick: () => { orderFilter = key; renderOrderFilters(); renderOrders(); },
  }, [
    el("span", { text: label }),
    el("span", { class: "count", text: String(count) }),
  ]);
  const buttons = [filterBtn("all", "Alle", orders.length)];
  for (const status of statusList) buttons.push(filterBtn(status, statusLabel(status), counts[status] || 0));
  $("#order-filters").replaceChildren(...buttons);
}

function renderOrders() {
  const listEl = $("#orders-list");
  const filtered = orderFilter === "all" ? orders : orders.filter((o) => o.status === orderFilter);
  if (!filtered.length) {
    const msg = orderFilter === "all"
      ? "Ingen bestillinger ennå."
      : `Ingen bestillinger med status ${statusLabel(orderFilter).toLowerCase()}.`;
    listEl.replaceChildren(el("p", { class: "empty", text: msg }));
    return;
  }
  const head = el("div", { class: "list-head", "aria-hidden": "true" }, [
    el("span", { class: "label", text: "Nr." }),
    el("span", { class: "label", text: "Henting" }),
    el("span", { class: "label", text: "Kunde" }),
    el("span", { class: "label h-total", text: "Totalt inkl. mva" }),
    el("span", { class: "label", text: "Status" }),
    el("span", { class: "label", text: "" }),
  ]);
  listEl.replaceChildren(head, ...filtered.map(orderRow));
}

function orderRow(order) {
  const isOpen = expandedOrders.has(order.id);
  const head = el("button", {
    class: "order-head",
    type: "button",
    "aria-expanded": String(isOpen),
    onclick: () => {
      if (expandedOrders.has(order.id)) expandedOrders.delete(order.id);
      else expandedOrders.add(order.id);
      renderOrders();
    },
  }, [
    el("span", { class: "o-num", text: order.orderNumber }),
    el("span", { class: "o-pickup" }, [
      el("span", { text: formatDate(order.pickupDate) }),
      el("span", { class: "muted o-sub", text: order.pickupSlot }),
    ]),
    el("span", { class: "o-cust" }, [
      el("span", { text: order.customer.name }),
      el("span", { class: "muted o-sub", text: order.customer.phone }),
    ]),
    el("span", { class: "o-total price", text: formatKr(order.totalCents) }),
    el("span", { class: "o-status" }, [statusBadge(order.status)]),
    el("span", { class: "o-toggle", "aria-hidden": "true", text: isOpen ? "−" : "+" }),
  ]);
  const wrap = el("article", { class: "order" }, [head]);
  if (isOpen) wrap.append(orderDetail(order));
  return wrap;
}

function orderDetail(order) {
  const detail = el("div", { class: "order-detail" });

  const linesWrap = el("div", {}, [el("span", { class: "label", text: "Innhold" })]);
  for (const line of order.lines || []) {
    const lineEl = el("div", { class: "order-line" }, [
      el("div", { class: "line-top" }, [
        el("span", { text: `${line.qty} x ${line.productName}` }),
        el("span", { class: "price", text: formatKr(line.lineTotalCents) }),
      ]),
    ]);
    if (Array.isArray(line.options) && line.options.length) {
      lineEl.append(el("ul", { class: "line-opts" }, line.options.map((opt) => {
        const delta = opt.priceDeltaCents
          ? ` (${opt.priceDeltaCents > 0 ? "+ " : ""}${formatKr(opt.priceDeltaCents)})`
          : "";
        return el("li", { text: `${opt.group}: ${opt.value}${delta}` });
      })));
    }
    if (line.cakeText) {
      lineEl.append(el("div", { class: "cake-text-block" }, [
        el("span", { class: "label", text: "Kaketekst" }),
        el("div", { class: "cake-text", text: line.cakeText }),
      ]));
    }
    linesWrap.append(lineEl);
  }
  detail.append(linesWrap);

  detail.append(el("div", { class: "order-total" }, [
    el("span", { text: "Totalt" }),
    el("span", {}, [
      el("span", { class: "price", text: formatKr(order.totalCents) }),
      el("span", { class: "muted", text: "inkl. mva" }),
    ]),
  ]));

  if (order.note) {
    detail.append(el("div", { class: "order-note" }, [
      el("span", { class: "label", text: "Merknad fra kunde" }),
      el("p", { class: "note-text", text: order.note }),
    ]));
  }

  const payment = order.paymentStatus === "demo_paid" ? "Demobetaling gjennomført" : String(order.paymentStatus || "");
  detail.append(el("div", { class: "order-meta" }, [
    el("div", {}, [el("span", { class: "label", text: "E-post" }), el("span", { text: String(order.customer.email || "") })]),
    el("div", {}, [el("span", { class: "label", text: "Betalingsreferanse" }), el("span", { text: String(order.paymentReference || "") })]),
    el("div", {}, [el("span", { class: "label", text: "Betaling" }), el("span", { text: payment })]),
    el("div", {}, [el("span", { class: "label", text: "Opprettet" }), el("span", { text: order.createdAt })]),
  ]));

  if (orderErrors.has(order.id)) {
    detail.append(el("div", { class: "order-err", role: "alert", text: orderErrors.get(order.id) }));
  }

  const actions = el("div", { class: "order-actions" });
  const busy = pendingOrders.has(order.id);
  const next = NEXT_STATUS[order.status];
  if (next) {
    actions.append(el("button", {
      class: "btn btn-small",
      type: "button",
      disabled: busy,
      onclick: () => changeStatus(order, next),
      text: ADVANCE_LABEL[next],
    }));
  }
  if (!TERMINAL.has(order.status)) {
    actions.append(el("button", {
      class: "btn btn-small",
      type: "button",
      disabled: busy,
      onclick: () => {
        if (window.confirm(`Kansellere bestilling ${order.orderNumber}? Dette kan ikke angres.`)) {
          changeStatus(order, "cancelled");
        }
      },
      text: "Kanseller",
    }));
  } else {
    actions.append(el("span", { class: "muted", text: "Bestillingen er avsluttet." }));
  }
  detail.append(actions);

  return detail;
}

async function changeStatus(order, status) {
  pendingOrders.add(order.id);
  orderErrors.delete(order.id);
  renderOrders();
  try {
    const res = await api(`/api/admin/orders/${order.id}`, { method: "PATCH", body: { status } });
    if (res.ok && res.data && res.data.order) {
      const idx = orders.findIndex((o) => o.id === order.id);
      if (idx >= 0) orders[idx] = res.data.order;
    } else {
      orderErrors.set(order.id, (res.data && res.data.error) || "Noe gikk galt. Prøv igjen.");
    }
  } catch {
    orderErrors.set(order.id, "Nettverksfeil. Prøv igjen.");
  }
  pendingOrders.delete(order.id);
  renderOrderFilters();
  renderOrders();
}

// ---------- products view ----------

let products = [];
let productsLoaded = false;
let editingId = null;
const productErrors = new Map();

async function loadProducts() {
  const statusEl = $("#products-status");
  statusEl.replaceChildren(el("p", { class: "status-msg", text: "Laster produkter ..." }));
  $("#products-list").replaceChildren();
  try {
    const res = await api("/api/admin/products");
    if (!res.ok || !res.data || !Array.isArray(res.data.products)) throw new Error("bad response");
    products = res.data.products;
    productsLoaded = true;
    statusEl.replaceChildren();
    renderProducts();
  } catch {
    statusEl.replaceChildren(el("div", { class: "error-box" }, [
      el("span", { text: "Kunne ikke hente produktene. Sjekk tilkoblingen og prøv igjen." }),
      el("button", { class: "btn btn-small", type: "button", onclick: loadProducts, text: "Prøv igjen" }),
    ]));
  }
}

function renderProducts() {
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
  $("#category-list").replaceChildren(...categories.map((c) => el("option", { value: c })));

  const listEl = $("#products-list");
  if (!products.length) {
    listEl.replaceChildren(el("p", { class: "empty", text: "Ingen produkter ennå." }));
    return;
  }
  listEl.replaceChildren(...products.map(productRow));
}

function productRow(product) {
  const row = el("div", { class: "product-row" + (product.active ? "" : " is-inactive") });

  row.append(product.imageUrl
    ? el("img", { class: "p-thumb", src: product.imageUrl, alt: product.name })
    : el("span", { class: "p-thumb p-thumb-empty", "aria-hidden": "true" }));

  row.append(el("div", { class: "p-name", text: product.name }));

  const days = product.leadTimeDays === 1 ? "1 dag" : `${product.leadTimeDays} dager`;
  row.append(el("div", { class: "p-meta" }, [
    el("span", { text: product.category || "Uten kategori" }),
    el("span", { "aria-hidden": "true", text: "·" }),
    el("span", { class: "price", text: `fra ${formatKr(product.basePriceCents)}` }),
    el("span", { "aria-hidden": "true", text: "·" }),
    el("span", { text: `ledetid ${days}` }),
    product.active
      ? el("span", { class: "badge badge-ok", text: "Aktiv" })
      : el("span", { class: "badge badge-warn", text: "Inaktiv" }),
  ]));

  row.append(el("div", { class: "p-actions" }, [
    el("button", { class: "btn btn-small", type: "button", onclick: () => openForm(product), text: "Rediger" }),
    el("button", {
      class: "btn btn-small",
      type: "button",
      onclick: () => toggleActive(product),
      text: product.active ? "Deaktiver" : "Aktiver",
    }),
  ]));

  if (productErrors.has(product.id)) {
    row.append(el("div", { class: "order-err product-err", role: "alert", text: productErrors.get(product.id) }));
  }
  return row;
}

async function toggleActive(product) {
  productErrors.delete(product.id);
  try {
    const res = await api(`/api/admin/products/${product.id}`, { method: "PATCH", body: { active: !product.active } });
    if (res.ok && res.data && res.data.product) {
      const idx = products.findIndex((p) => p.id === product.id);
      if (idx >= 0) products[idx] = res.data.product;
    } else {
      productErrors.set(product.id, (res.data && res.data.error) || "Noe gikk galt. Prøv igjen.");
    }
  } catch {
    productErrors.set(product.id, "Nettverksfeil. Prøv igjen.");
  }
  renderProducts();
}

// ---------- product form ----------

const formWrap = $("#product-form-wrap");
const optionRowsEl = $("#option-rows");

function syncRadioNames() {
  const rows = [...optionRowsEl.querySelectorAll(".opt-row")];
  rows.forEach((row, i) => {
    const group = row.querySelector(".opt-group").value.trim().toLowerCase();
    row.querySelector(".opt-radio").name = group ? `optdef-${group}` : `optdef-row-${i}`;
  });
}

function addOptionRow(data = {}) {
  const groupInput = el("input", {
    class: "opt-text opt-group", type: "text", autocomplete: "off",
    placeholder: "Gruppe, f.eks. Størrelse", "aria-label": "Gruppenavn",
    value: data.groupName || "",
    oninput: syncRadioNames,
  });
  const valueInput = el("input", {
    class: "opt-text opt-value", type: "text", autocomplete: "off",
    placeholder: "Valg, f.eks. 12 biter", "aria-label": "Valgnavn",
    value: data.valueName || "",
  });
  const priceInput = el("input", {
    class: "opt-price", type: "text", inputmode: "decimal", autocomplete: "off",
    placeholder: "Tillegg kr", "aria-label": "Pristillegg i kroner",
    value: data.priceDeltaCents ? krString(data.priceDeltaCents) : "",
  });
  const radio = el("input", { class: "opt-radio", type: "radio", "aria-label": "Standardvalg i gruppen" });
  radio.checked = !!data.isDefault;
  const row = el("div", { class: "opt-row" }, [
    groupInput,
    valueInput,
    priceInput,
    el("label", { class: "opt-default" }, [radio, "Standard"]),
    el("button", {
      class: "btn btn-small", type: "button", text: "Fjern",
      onclick: () => { row.remove(); syncRadioNames(); },
    }),
  ]);
  optionRowsEl.append(row);
  syncRadioNames();
}

function showFormError(message) {
  const box = $("#form-error");
  box.textContent = message;
  box.hidden = false;
}

function openForm(product) {
  editingId = product ? product.id : null;
  $("#product-form-title").textContent = product ? `Rediger ${product.name}` : "Nytt produkt";
  $("#f-name").value = product ? product.name : "";
  $("#f-category").value = product ? product.category || "" : "";
  $("#f-description").value = product ? product.description || "" : "";
  $("#f-image").value = product ? product.imageUrl || "" : "";
  $("#f-price").value = product ? krString(product.basePriceCents) : "";
  $("#f-leadtime").value = product ? String(product.leadTimeDays ?? 0) : "0";
  const nextSort = products.reduce((max, p) => Math.max(max, p.sortOrder || 0), 0) + 1;
  $("#f-sort").value = product ? String(product.sortOrder ?? 0) : String(nextSort);
  $("#f-caketext").checked = product ? !!product.canHaveCakeText : false;
  $("#f-caketext-price").value = krString(product ? product.cakeTextPriceCents || 0 : 0);
  $("#f-caketext-price").disabled = !$("#f-caketext").checked;
  $("#f-active").checked = product ? !!product.active : true;

  optionRowsEl.replaceChildren();
  if (product && Array.isArray(product.optionGroups)) {
    for (const group of product.optionGroups) {
      for (const opt of group.options || []) {
        addOptionRow({
          groupName: group.name,
          valueName: opt.value,
          priceDeltaCents: opt.priceDeltaCents,
          isDefault: opt.isDefault,
        });
      }
    }
  }

  $("#form-error").hidden = true;
  formWrap.hidden = false;
  formWrap.scrollIntoView({ block: "nearest" });
  $("#f-name").focus();
}

function closeForm() {
  formWrap.hidden = true;
  editingId = null;
  optionRowsEl.replaceChildren();
  $("#form-error").hidden = true;
  $("#new-product").focus();
}

function collectForm() {
  const name = $("#f-name").value.trim();
  if (!name) return { error: "Skriv inn produktnavn." };

  const basePriceCents = parseKrToCents($("#f-price").value);
  if (basePriceCents === null || basePriceCents <= 0) {
    return { error: "Skriv inn en gyldig grunnpris i kroner." };
  }

  const leadTimeDays = Number.parseInt($("#f-leadtime").value, 10);
  if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 30) {
    return { error: "Ledetid må være mellom 0 og 30 dager." };
  }

  const canHaveCakeText = $("#f-caketext").checked;
  const cakeTextRaw = $("#f-caketext-price").value.trim();
  let cakeTextPriceCents = cakeTextRaw === "" ? 0 : parseKrToCents(cakeTextRaw);
  if (canHaveCakeText && (cakeTextPriceCents === null || cakeTextPriceCents < 0)) {
    return { error: "Skriv inn en gyldig pris for kaketekst." };
  }
  if (cakeTextPriceCents === null || cakeTextPriceCents < 0) cakeTextPriceCents = 0;

  const sortParsed = Number.parseInt($("#f-sort").value, 10);
  const sortOrder = Number.isInteger(sortParsed) ? sortParsed : 0;

  const options = [];
  const seenDefault = new Set();
  const rows = [...optionRowsEl.querySelectorAll(".opt-row")];
  for (let i = 0; i < rows.length; i++) {
    const groupName = rows[i].querySelector(".opt-group").value.trim();
    const valueName = rows[i].querySelector(".opt-value").value.trim();
    if (!groupName && !valueName) continue;
    if (!groupName || !valueName) {
      return { error: `Rad ${i + 1} under valggrupper mangler gruppenavn eller valgnavn.` };
    }
    const deltaRaw = rows[i].querySelector(".opt-price").value.trim();
    const priceDeltaCents = deltaRaw === "" ? 0 : parseKrToCents(deltaRaw);
    if (priceDeltaCents === null) {
      return { error: `Ugyldig pristillegg i rad ${i + 1} under valggrupper.` };
    }
    const groupKey = groupName.toLowerCase();
    let isDefault = rows[i].querySelector(".opt-radio").checked;
    if (isDefault && seenDefault.has(groupKey)) isDefault = false;
    if (isDefault) seenDefault.add(groupKey);
    options.push({ groupName, valueName, priceDeltaCents, isDefault });
  }

  return {
    body: {
      name,
      description: $("#f-description").value.trim(),
      category: $("#f-category").value.trim(),
      imageUrl: $("#f-image").value.trim(),
      basePriceCents,
      leadTimeDays,
      canHaveCakeText,
      cakeTextPriceCents,
      active: $("#f-active").checked,
      sortOrder,
      options,
    },
  };
}

async function submitForm(event) {
  event.preventDefault();
  $("#form-error").hidden = true;
  const collected = collectForm();
  if (collected.error) { showFormError(collected.error); return; }

  const saveBtn = $("#save-product");
  saveBtn.disabled = true;
  saveBtn.textContent = "Lagrer";
  try {
    const res = editingId === null
      ? await api("/api/admin/products", { method: "POST", body: collected.body })
      : await api(`/api/admin/products/${editingId}`, { method: "PATCH", body: collected.body });
    if (res.ok && res.data && res.data.product) {
      closeForm();
      await loadProducts();
    } else {
      showFormError((res.data && res.data.error) || "Noe gikk galt. Prøv igjen.");
    }
  } catch {
    showFormError("Nettverksfeil. Prøv igjen.");
  }
  saveBtn.disabled = false;
  saveBtn.textContent = "Lagre";
}

// ---------- tabs + init ----------

function showTab(name) {
  const isOrders = name === "orders";
  $("#tab-orders").classList.toggle("is-active", isOrders);
  $("#tab-orders").setAttribute("aria-selected", String(isOrders));
  $("#tab-products").classList.toggle("is-active", !isOrders);
  $("#tab-products").setAttribute("aria-selected", String(!isOrders));
  $("#panel-orders").hidden = !isOrders;
  $("#panel-products").hidden = isOrders;
  if (!isOrders && !productsLoaded) loadProducts();
}

$("#tab-orders").addEventListener("click", () => showTab("orders"));
$("#tab-products").addEventListener("click", () => showTab("products"));
$("#refresh-orders").addEventListener("click", loadOrders);
$("#refresh-products").addEventListener("click", loadProducts);
$("#new-product").addEventListener("click", () => openForm(null));
$("#add-option-row").addEventListener("click", () => addOptionRow());
$("#cancel-form").addEventListener("click", closeForm);
$("#product-form").addEventListener("submit", submitForm);
$("#f-caketext").addEventListener("change", () => {
  $("#f-caketext-price").disabled = !$("#f-caketext").checked;
});

const cartBadge = $("#cart-badge");
const cartItemCount = cartCount(loadCart());
cartBadge.textContent = String(cartItemCount);
cartBadge.classList.toggle("has-items", cartItemCount > 0);
loadOrders();
