/* Admin page for variant C "Tidsskrift": order board + product editor.
   Talks to /api/admin/* per docs/contract.md. */

/* ---------------------------- shared helpers ---------------------------- */

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

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function el(id) { return document.getElementById(id); }

async function api(path, opts) {
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    throw new Error(data && data.error ? data.error : "Noe gikk galt. Prøv igjen.");
  }
  return data;
}

/* Parse a kroner amount typed by a human ("490", "490,50") into integer øre.
   Returns null when the input is not a valid amount. */
function parseKrToCents(raw) {
  const s = String(raw).trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

function centsToKrInput(cents) {
  const kr = (Number(cents) || 0) / 100;
  return Number.isInteger(kr) ? String(kr) : kr.toFixed(2).replace(".", ",");
}

function formatDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(y, m - 1, d).toLocaleDateString("nb-NO", {
    weekday: "short", day: "numeric", month: "short",
  });
}

/* ------------------------------ page state ------------------------------ */

const STATUS_META = {
  new: { label: "Ny", tone: "accent" },
  confirmed: { label: "Bekreftet", tone: "accent" },
  ready: { label: "Klar til henting", tone: "ok" },
  picked_up: { label: "Hentet", tone: "muted" },
  cancelled: { label: "Kansellert", tone: "warn" },
};

const NEXT_ACTION = {
  new: { to: "confirmed", label: "Bekreft" },
  confirmed: { to: "ready", label: "Marker som klar" },
  ready: { to: "picked_up", label: "Marker som hentet" },
};

const TERMINAL_STATUSES = ["picked_up", "cancelled"];

const KNOWN_IMAGES = [
  "/img/blotkake.svg", "/img/croissant.svg", "/img/festkake.svg",
  "/img/gulrotkake.svg", "/img/kanelbolle.svg", "/img/kransekake.svg",
  "/img/makroner.svg", "/img/sjokoladekake.svg", "/img/skolebrod.svg",
  "/img/surdeigsbrod.svg",
];

const state = {
  orders: [],
  statuses: ["new", "confirmed", "ready", "picked_up", "cancelled"],
  filter: "all",
  visibleIds: [],
  expanded: new Set(),
  products: [],
  productsLoaded: false,
  editingId: null,
};

function toneClass(tone) {
  if (tone === "ok") return " badge-ok";
  if (tone === "muted") return " badge-muted";
  if (tone === "warn") return " badge-warn";
  return "";
}

function showFetchError(area, message, onRetry) {
  area.hidden = false;
  area.innerHTML = "";
  const p = document.createElement("p");
  p.textContent = message;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-sm";
  btn.textContent = "Prøv igjen";
  btn.addEventListener("click", onRetry);
  area.append(p, btn);
}

/* ------------------------------- orders --------------------------------- */

async function fetchOrders() {
  const statusEl = el("orders-status");
  statusEl.hidden = false;
  statusEl.textContent = "Henter bestillinger…";
  el("orders-list").innerHTML = "";
  try {
    const data = await api("/api/admin/orders");
    state.orders = data.orders || [];
    if (Array.isArray(data.statuses) && data.statuses.length) {
      state.statuses = data.statuses;
    }
    statusEl.hidden = true;
    statusEl.textContent = "";
    applyFilter(state.filter);
  } catch {
    showFetchError(statusEl, "Kunne ikke hente bestillingene. Sjekk at tjeneren kjører og prøv igjen.", fetchOrders);
  }
}

function orderMatchesFilter(order, filter) {
  return filter === "all" || order.status === filter;
}

function applyFilter(filter) {
  state.filter = filter;
  state.visibleIds = state.orders
    .filter((o) => orderMatchesFilter(o, filter))
    .map((o) => o.id);
  renderFilters();
  renderOrdersList();
}

function renderFilters() {
  const wrap = el("filters");
  wrap.innerHTML = "";
  const counts = {};
  for (const o of state.orders) counts[o.status] = (counts[o.status] || 0) + 1;
  const entries = [["all", "Alle", state.orders.length]];
  for (const s of state.statuses) {
    const meta = STATUS_META[s];
    entries.push([s, meta ? meta.label : s, counts[s] || 0]);
  }
  for (const [value, label, count] of entries) {
    const btn = document.createElement("button");
    btn.type = "button";
    const active = state.filter === value;
    btn.className = "filter-btn" + (active ? " is-active" : "");
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.innerHTML = esc(label) + ' <span class="filter-count">' + Number(count) + "</span>";
    btn.addEventListener("click", () => applyFilter(value));
    wrap.appendChild(btn);
  }
}

function renderOrdersList() {
  const list = el("orders-list");
  list.innerHTML = "";
  const visible = state.visibleIds
    .map((id) => state.orders.find((o) => o.id === id))
    .filter(Boolean);
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    if (state.filter === "all") {
      empty.textContent = "Ingen bestillinger ennå. Nye bestillinger dukker opp her.";
    } else {
      const meta = STATUS_META[state.filter];
      empty.textContent = "Ingen bestillinger med status " + (meta ? meta.label : state.filter) + ".";
    }
    list.appendChild(empty);
    return;
  }
  for (const o of visible) list.appendChild(buildOrderRow(o));
}

function buildOrderRow(order) {
  const meta = STATUS_META[order.status] || { label: order.status, tone: "accent" };
  const expanded = state.expanded.has(order.id);

  const art = document.createElement("article");
  art.className = "order";
  art.dataset.id = String(order.id);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "order-summary";
  btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  btn.innerHTML =
    '<span class="o-num">' + esc(order.orderNumber) + "</span>" +
    '<span class="o-pickup">' + esc(formatDate(order.pickupDate)) + " · " + esc(order.pickupSlot) + "</span>" +
    '<span class="o-cust">' + esc(order.customer.name) + " · " + esc(order.customer.phone) + "</span>" +
    '<span class="o-total">' + esc(formatKr(order.totalCents)) + "</span>" +
    '<span class="badge' + toneClass(meta.tone) + '">' + esc(meta.label) + "</span>" +
    '<span class="o-chevron" aria-hidden="true">' + (expanded ? "−" : "+") + "</span>";
  btn.addEventListener("click", () => {
    if (state.expanded.has(order.id)) state.expanded.delete(order.id);
    else state.expanded.add(order.id);
    const current = state.orders.find((o) => o.id === order.id) || order;
    art.replaceWith(buildOrderRow(current));
  });
  art.appendChild(btn);

  const detail = document.createElement("div");
  detail.className = "order-detail";
  detail.hidden = !expanded;
  detail.innerHTML = buildDetailHtml(order);

  const actions = document.createElement("div");
  actions.className = "order-actions";
  const err = document.createElement("p");
  err.className = "action-error";
  err.hidden = true;

  const next = NEXT_ACTION[order.status];
  if (next) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-primary btn-sm";
    b.textContent = next.label;
    b.addEventListener("click", () => changeStatus(order.id, next.to, art, err, actions));
    actions.appendChild(b);
  }
  if (!TERMINAL_STATUSES.includes(order.status)) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "btn btn-sm btn-danger";
    c.textContent = "Kanseller";
    c.addEventListener("click", () => {
      const ok = window.confirm("Vil du kansellere bestilling " + order.orderNumber + "? Dette kan ikke angres.");
      if (ok) changeStatus(order.id, "cancelled", art, err, actions);
    });
    actions.appendChild(c);
  } else {
    const done = document.createElement("p");
    done.className = "muted action-note";
    done.textContent = order.status === "cancelled"
      ? "Bestillingen er kansellert."
      : "Bestillingen er fullført.";
    actions.appendChild(done);
  }
  actions.appendChild(err);
  detail.appendChild(actions);
  art.appendChild(detail);
  return art;
}

function buildDetailHtml(order) {
  const lines = (order.lines || []).map((line) => {
    const opts = (line.options || [])
      .map((o) => esc(o.group) + ": " + esc(o.value))
      .join(" · ");
    const cake = line.cakeText
      ? '<div class="cake-callout"><span class="cake-kicker">Kaketekst</span>' +
        '<span class="cake-text">«' + esc(line.cakeText) + "»</span></div>"
      : "";
    return (
      '<div class="oline">' +
      '<div class="oline-main"><span class="oline-name">' + Number(line.qty) + " × " + esc(line.productName) + "</span>" +
      '<span class="leader"></span>' +
      '<span class="oline-total">' + esc(formatKr(line.lineTotalCents)) + "</span></div>" +
      (opts ? '<div class="oline-opts muted">' + opts + "</div>" : "") +
      cake +
      "</div>"
    );
  }).join("");

  const note = order.note
    ? '<div class="onote"><span class="kicker-sm">Merknad fra kunden</span>' + esc(order.note) + "</div>"
    : "";

  const payment = (order.paymentStatus === "demo_paid" ? "Demobetaling gjennomført" : esc(order.paymentStatus)) +
    " · " + esc(order.paymentReference || "");

  return (
    lines +
    '<div class="oline-main osum"><span>Totalt</span><span class="leader"></span>' +
    '<span class="oline-total">' + esc(formatKr(order.totalCents)) + "</span></div>" +
    '<p class="muted vat">inkl. mva</p>' +
    note +
    '<dl class="ometa">' +
    "<div><dt>E-post</dt><dd>" + esc(order.customer.email) + "</dd></div>" +
    "<div><dt>Betaling</dt><dd>" + payment + "</dd></div>" +
    "<div><dt>Registrert</dt><dd>" + esc(order.createdAt || "") + "</dd></div>" +
    "</dl>"
  );
}

async function changeStatus(id, to, rowEl, errEl, actionsEl) {
  errEl.hidden = true;
  const buttons = actionsEl.querySelectorAll("button");
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const data = await api("/api/admin/orders/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: to }),
    });
    const idx = state.orders.findIndex((o) => o.id === id);
    if (idx !== -1) state.orders[idx] = data.order;
    renderFilters();
    /* Update the row in place; it stays visible until the filter is reapplied. */
    rowEl.replaceWith(buildOrderRow(data.order));
  } catch (err) {
    buttons.forEach((b) => { b.disabled = false; });
    errEl.hidden = false;
    errEl.textContent = err.message;
  }
}

/* ------------------------------ products -------------------------------- */

async function fetchProducts() {
  const statusEl = el("products-status");
  statusEl.hidden = false;
  statusEl.textContent = "Henter produkter…";
  el("products-list").innerHTML = "";
  try {
    const data = await api("/api/admin/products");
    state.products = data.products || [];
    statusEl.hidden = true;
    statusEl.textContent = "";
    renderProducts();
    updateDatalists();
  } catch {
    showFetchError(statusEl, "Kunne ikke hente produktene. Sjekk at tjeneren kjører og prøv igjen.", fetchProducts);
  }
}

function renderProducts() {
  const list = el("products-list");
  list.innerHTML = "";
  const n = state.products.length;
  el("products-count").textContent = n === 0 ? "" : n === 1 ? "1 produkt" : n + " produkter";
  if (!n) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Ingen produkter ennå. Trykk Nytt produkt for å legge til det første.";
    list.appendChild(empty);
    return;
  }
  for (const p of state.products) list.appendChild(buildProductRow(p));
}

function leadTimeText(days) {
  if (days === 0) return "Samme dag";
  if (days === 1) return "1 dags frist";
  return days + " dagers frist";
}

function buildProductRow(p) {
  const row = document.createElement("div");
  row.className = "prod-row" + (p.active ? "" : " is-inactive");
  const thumb = p.imageUrl
    ? '<img class="prod-thumb" src="' + esc(p.imageUrl) + '" alt="' + esc(p.name) + '">'
    : '<span class="prod-thumb prod-thumb-empty" aria-hidden="true"></span>';
  row.innerHTML =
    thumb +
    '<div class="prod-main">' +
    '<span class="prod-name">' + esc(p.name) + "</span>" +
    '<span class="prod-meta muted">' + esc(p.category) + " · fra " + esc(formatKr(p.basePriceCents)) +
    " · " + esc(leadTimeText(p.leadTimeDays)) + "</span>" +
    "</div>" +
    '<span class="badge' + (p.active ? " badge-ok" : " badge-warn") + '">' + (p.active ? "Aktiv" : "Inaktiv") + "</span>" +
    '<div class="prod-actions"></div>';

  const actions = row.querySelector(".prod-actions");
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "btn btn-sm";
  edit.textContent = "Rediger";
  edit.addEventListener("click", () => openForm(p));
  actions.appendChild(edit);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "btn btn-sm" + (p.active ? " btn-danger" : "");
  toggle.textContent = p.active ? "Deaktiver" : "Aktiver";
  toggle.addEventListener("click", () => toggleActive(p, toggle));
  actions.appendChild(toggle);

  return row;
}

async function toggleActive(p, btnEl) {
  hideProductsMsg();
  btnEl.disabled = true;
  try {
    const data = await api("/api/admin/products/" + p.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    const idx = state.products.findIndex((x) => x.id === p.id);
    if (idx !== -1) state.products[idx] = data.product;
    renderProducts();
    showProductsMsg("«" + data.product.name + "» er nå " + (data.product.active ? "aktiv" : "deaktivert") + ".", false);
  } catch (err) {
    btnEl.disabled = false;
    showProductsMsg(err.message, true);
  }
}

function showProductsMsg(text, isError) {
  const msg = el("products-msg");
  msg.hidden = false;
  msg.textContent = text;
  msg.classList.toggle("is-error", !!isError);
}

function hideProductsMsg() {
  const msg = el("products-msg");
  msg.hidden = true;
  msg.textContent = "";
}

function updateDatalists() {
  const cats = [...new Set(state.products.map((p) => p.category).filter(Boolean))];
  el("category-list").innerHTML = cats.map((c) => '<option value="' + esc(c) + '"></option>').join("");
  const imgs = [...new Set([...KNOWN_IMAGES, ...state.products.map((p) => p.imageUrl).filter(Boolean)])];
  el("image-list").innerHTML = imgs.map((u) => '<option value="' + esc(u) + '"></option>').join("");
}

/* ---------------------------- product form ------------------------------ */

function nextSortOrder() {
  let max = 0;
  for (const p of state.products) max = Math.max(max, Number(p.sortOrder) || 0);
  return max + 1;
}

function openForm(p) {
  hideProductsMsg();
  state.editingId = p ? p.id : null;
  el("form-title").textContent = p ? "Rediger: " + p.name : "Nytt produkt";
  el("f-name").value = p ? p.name : "";
  el("f-category").value = p ? p.category : "";
  el("f-description").value = p ? p.description || "" : "";
  el("f-image").value = p ? p.imageUrl || "" : "";
  el("f-price").value = p ? centsToKrInput(p.basePriceCents) : "";
  el("f-lead").value = p ? String(p.leadTimeDays) : "1";
  el("f-sort").value = p ? String(p.sortOrder) : String(nextSortOrder());
  el("f-caketext").checked = p ? !!p.canHaveCakeText : false;
  el("f-caketext-price").value = p ? centsToKrInput(p.cakeTextPriceCents) : "0";
  syncCakeTextPriceState();

  const rowsWrap = el("opt-rows");
  rowsWrap.innerHTML = "";
  if (p) {
    for (const g of p.optionGroups || []) {
      for (const o of g.options || []) {
        addOptRow({
          groupName: g.name,
          valueName: o.value,
          priceDeltaCents: o.priceDeltaCents,
          isDefault: o.isDefault,
        });
      }
    }
  }
  syncRadioNames();

  el("form-error").hidden = true;
  el("form-error").textContent = "";
  const panel = el("form-panel");
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  el("f-name").focus();
}

function closeForm() {
  state.editingId = null;
  el("form-panel").hidden = true;
  el("opt-rows").innerHTML = "";
  el("product-form").reset();
}

function syncCakeTextPriceState() {
  el("f-caketext-price").disabled = !el("f-caketext").checked;
}

let optRowSeq = 0;

function addOptRow(data = {}) {
  const row = document.createElement("div");
  row.className = "opt-row";
  row.innerHTML =
    '<input class="og" type="text" placeholder="Gruppe" aria-label="Gruppenavn" autocomplete="off">' +
    '<input class="ov" type="text" placeholder="Alternativ" aria-label="Alternativnavn" autocomplete="off">' +
    '<input class="od" type="text" inputmode="decimal" placeholder="0" aria-label="Pristillegg i kroner" autocomplete="off">' +
    '<label class="or-wrap"><input class="or" type="radio"> <span>Std.</span></label>' +
    '<button type="button" class="opt-del">Fjern</button>';
  row.querySelector(".og").value = data.groupName || "";
  row.querySelector(".ov").value = data.valueName || "";
  row.querySelector(".od").value = centsToKrInput(data.priceDeltaCents || 0);
  /* Set the per-group radio name BEFORE the row joins the form. Inserting a
     checked radio into a form unchecks every other checked radio with the
     same name, so a shared temporary name would wipe the defaults of all
     groups except the last one. */
  const groupKey = String(data.groupName || "").trim().toLowerCase();
  const radio = row.querySelector(".or");
  radio.name = groupKey ? "optdef-" + groupKey : "optdef-new-" + (optRowSeq++);
  radio.checked = !!data.isDefault;
  row.querySelector(".og").addEventListener("input", syncRadioNames);
  row.querySelector(".opt-del").addEventListener("click", () => {
    row.remove();
    syncRadioNames();
  });
  el("opt-rows").appendChild(row);
  return row;
}

/* Native radio grouping per option group: radios share a name derived from
   the row's group name, so picking a default unchecks the others. */
function syncRadioNames() {
  const rows = el("opt-rows").querySelectorAll(".opt-row");
  rows.forEach((row, i) => {
    const g = row.querySelector(".og").value.trim().toLowerCase();
    row.querySelector(".or").name = g ? "optdef-" + g : "optdef-row-" + i;
  });
}

function collectOptions() {
  const rows = [...el("opt-rows").querySelectorAll(".opt-row")];
  const options = [];
  for (const row of rows) {
    const g = row.querySelector(".og").value.trim();
    const v = row.querySelector(".ov").value.trim();
    const dRaw = row.querySelector(".od").value.trim();
    const def = row.querySelector(".or").checked;
    if (!g && !v) continue; // skip empty rows
    if (!g || !v) {
      throw new Error("Hver rad i alternativene må ha både gruppe og alternativnavn.");
    }
    const delta = dRaw === "" ? 0 : parseKrToCents(dRaw);
    if (delta === null) {
      throw new Error("Ugyldig pristillegg for «" + v + "». Skriv beløpet i kroner.");
    }
    options.push({ groupName: g, valueName: v, priceDeltaCents: delta, isDefault: def });
  }
  /* Exactly one default per group (case-insensitive group match). */
  const groups = new Map();
  options.forEach((o, i) => {
    const key = o.groupName.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  for (const idxs of groups.values()) {
    const defaults = idxs.filter((i) => options[i].isDefault);
    if (defaults.length === 0) options[idxs[0]].isDefault = true;
    else defaults.slice(1).forEach((i) => { options[i].isDefault = false; });
  }
  return options;
}

function formFail(message) {
  const errEl = el("form-error");
  errEl.hidden = false;
  errEl.textContent = message;
}

async function submitProductForm(event) {
  event.preventDefault();
  el("form-error").hidden = true;

  const name = el("f-name").value.trim();
  if (name.length < 2) return formFail("Produktet må ha et navn på minst to tegn.");

  const price = parseKrToCents(el("f-price").value);
  if (price === null || price < 0) {
    return formFail("Ugyldig grunnpris. Skriv beløpet i kroner, for eksempel 490 eller 490,50.");
  }

  const leadRaw = String(el("f-lead").value).trim();
  const lead = Number(leadRaw);
  if (leadRaw === "" || !Number.isInteger(lead) || lead < 0 || lead > 30) {
    return formFail("Bestillingsfristen må være et helt tall mellom 0 og 30 dager.");
  }

  const canCake = el("f-caketext").checked;
  let cakePrice = 0;
  if (canCake) {
    const raw = el("f-caketext-price").value.trim();
    cakePrice = raw === "" ? 0 : parseKrToCents(raw);
    if (cakePrice === null || cakePrice < 0) return formFail("Ugyldig pris for kaketekst.");
  }

  const sortRaw = String(el("f-sort").value).trim();
  const sort = sortRaw === "" ? 0 : Number(sortRaw);
  if (!Number.isInteger(sort)) return formFail("Sortering må være et helt tall.");

  let options;
  try { options = collectOptions(); }
  catch (err) { return formFail(err.message); }

  const payload = {
    name,
    description: el("f-description").value,
    category: el("f-category").value.trim(),
    imageUrl: el("f-image").value.trim(),
    basePriceCents: price,
    leadTimeDays: lead,
    canHaveCakeText: canCake,
    cakeTextPriceCents: cakePrice,
    sortOrder: sort,
    options,
  };

  const saveBtn = el("form-save");
  saveBtn.disabled = true;
  try {
    const isEdit = state.editingId != null;
    const data = await api(
      isEdit ? "/api/admin/products/" + state.editingId : "/api/admin/products",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const p = data.product;
    const idx = state.products.findIndex((x) => x.id === p.id);
    if (idx === -1) state.products.push(p);
    else state.products[idx] = p;
    closeForm();
    renderProducts();
    updateDatalists();
    showProductsMsg(
      isEdit ? "«" + p.name + "» er oppdatert." : "«" + p.name + "» er opprettet.",
      false
    );
  } catch (err) {
    formFail(err.message);
  } finally {
    saveBtn.disabled = false;
  }
}

/* -------------------------------- tabs ---------------------------------- */

function switchTab(which) {
  const orders = which === "orders";
  el("tab-orders").setAttribute("aria-selected", orders ? "true" : "false");
  el("tab-products").setAttribute("aria-selected", orders ? "false" : "true");
  el("tab-orders").classList.toggle("is-active", orders);
  el("tab-products").classList.toggle("is-active", !orders);
  /* Roving tabindex, per the ARIA tabs pattern. */
  el("tab-orders").tabIndex = orders ? 0 : -1;
  el("tab-products").tabIndex = orders ? -1 : 0;
  el("view-orders").hidden = !orders;
  el("view-products").hidden = orders;
  history.replaceState(null, "", orders ? "#bestillinger" : "#produkter");
  if (!orders && !state.productsLoaded) {
    state.productsLoaded = true;
    fetchProducts();
  }
}

/* -------------------------------- init ----------------------------------- */

function init() {
  const today = new Date().toLocaleDateString("nb-NO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  el("dateline").textContent = today.charAt(0).toUpperCase() + today.slice(1);
  const cartN = cartCount(loadCart());
  el("cart-count").textContent = String(cartN);
  el("cart-count").hidden = cartN === 0;

  el("tab-orders").addEventListener("click", () => switchTab("orders"));
  el("tab-products").addEventListener("click", () => switchTab("products"));
  /* Arrow keys move between the two tabs (roving tabindex). */
  el("tab-products").tabIndex = -1;
  const tabPairs = [["tab-orders", "products"], ["tab-products", "orders"]];
  for (const [id, otherView] of tabPairs) {
    el(id).addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      switchTab(otherView);
      el(otherView === "orders" ? "tab-orders" : "tab-products").focus();
    });
  }
  el("refresh-orders").addEventListener("click", fetchOrders);
  el("refresh-products").addEventListener("click", fetchProducts);
  el("new-product").addEventListener("click", () => openForm(null));
  el("form-cancel").addEventListener("click", closeForm);
  el("add-opt").addEventListener("click", () => { addOptRow(); syncRadioNames(); });
  el("f-caketext").addEventListener("change", syncCakeTextPriceState);
  el("product-form").addEventListener("submit", submitProductForm);

  fetchOrders();
  if (location.hash === "#produkter") switchTab("products");
}

init();
