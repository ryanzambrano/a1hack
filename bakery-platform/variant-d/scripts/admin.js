// Variant D admin: order board + product management. Norwegian copy, playful theme.

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

const STATUS_META = {
  new: { label: "Ny", tone: "st-new" },
  confirmed: { label: "Bekreftet", tone: "st-confirmed" },
  ready: { label: "Klar til henting", tone: "st-ready" },
  picked_up: { label: "Hentet", tone: "st-picked" },
  cancelled: { label: "Kansellert", tone: "st-cancelled" },
};
const NEXT_STATUS = { new: "confirmed", confirmed: "ready", ready: "picked_up" };
const NEXT_LABEL = {
  confirmed: "Bekreft bestillingen",
  ready: "Marker som klar til henting",
  picked_up: "Marker som hentet",
};
const DEFAULT_STATUS_ORDER = ["new", "confirmed", "ready", "picked_up", "cancelled"];

// ---------- small DOM + format helpers ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key === "hidden" || key === "disabled" || key === "checked") { if (value) node[key] = true; }
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(child);
  }
  return node;
}

async function fetchJson(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error("Får ikke kontakt med serveren. Prøv igjen om litt.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    const message = data && data.error ? data.error : "Noe gikk galt (feilkode " + res.status + ").";
    throw new Error(message);
  }
  return data;
}

function formatPickupDate(iso) {
  const parts = String(iso).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return iso;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "long" }).format(date);
}

// Format a "YYYY-MM-DD HH:MM:SS" timestamp as a Norwegian date and time.
function formatCreatedAt(raw) {
  const date = new Date(String(raw).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

// Parse a kroner amount typed by the baker ("490" or "490,50") to integer oere.
function parseKrToCents(raw) {
  const s = String(raw).trim().replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}

function centsToKrInput(cents) {
  const kr = cents / 100;
  return Number.isInteger(kr) ? String(kr) : kr.toFixed(2).replace(".", ",");
}

function leadLabel(days) {
  if (!days) return "samme dag";
  return days === 1 ? "1 dag" : days + " dager";
}

// ---------- state ----------

let allOrders = [];
let statusOrder = DEFAULT_STATUS_ORDER;
let currentFilter = "all";
const expandedOrders = new Set();

let products = [];
let editingId = null;
let optRowSeq = 0;

// ---------- orders view ----------

async function loadOrders() {
  const status = document.getElementById("orders-status");
  const list = document.getElementById("orders-list");
  status.textContent = "Henter bestillinger...";
  list.textContent = "";
  try {
    const data = await fetchJson("/api/admin/orders");
    allOrders = data.orders || [];
    if (Array.isArray(data.statuses) && data.statuses.length) statusOrder = data.statuses;
    status.textContent = "";
    renderFilterChips();
    renderOrders();
  } catch {
    status.textContent = "";
    list.append(el("div", { class: "empty card" },
      el("p", { text: "Oi, vi fikk ikke hentet bestillingene. Sjekk at serveren kjører." }),
      el("button", { class: "btn btn-sm", type: "button", text: "Prøv igjen", onclick: loadOrders })
    ));
  }
}

function renderFilterChips() {
  const wrap = document.getElementById("order-filters");
  wrap.textContent = "";
  const counts = {};
  for (const o of allOrders) counts[o.status] = (counts[o.status] || 0) + 1;
  const chips = [["all", "Alle", allOrders.length]];
  for (const s of statusOrder) {
    const meta = STATUS_META[s];
    chips.push([s, meta ? meta.label : s, counts[s] || 0]);
  }
  for (const [value, label, count] of chips) {
    const active = currentFilter === value;
    wrap.append(el("button", {
      class: "chip" + (active ? " chip-active" : ""),
      type: "button",
      "aria-pressed": String(active),
      onclick: () => { currentFilter = value; renderFilterChips(); renderOrders(); },
    },
      el("span", { text: label }),
      el("span", { class: "chip-count", text: String(count) })
    ));
  }
}

function renderOrders(focusOrderId) {
  const list = document.getElementById("orders-list");
  list.textContent = "";
  const visible = currentFilter === "all"
    ? allOrders
    : allOrders.filter((o) => o.status === currentFilter);
  if (!visible.length) {
    const meta = STATUS_META[currentFilter];
    const msg = currentFilter === "all"
      ? "Ingen bestillinger ennå. De dukker opp her når kundene bestiller!"
      : "Ingen bestillinger med status " + (meta ? meta.label : currentFilter) + " akkurat nå.";
    list.append(el("div", { class: "empty card", text: msg }));
    return;
  }
  for (const order of visible) list.append(buildOrderRow(order));
  if (focusOrderId != null) {
    const target = list.querySelector('[data-order-id="' + focusOrderId + '"] .o-sum');
    if (target) target.focus();
  }
}

function buildOrderRow(order) {
  const meta = STATUS_META[order.status] || { label: order.status, tone: "st-picked" };
  const isOpen = expandedOrders.has(order.id);

  const detail = buildOrderDetail(order);
  detail.hidden = !isOpen;

  const summaryBtn = el("button", { class: "o-sum", type: "button", "aria-expanded": String(isOpen) },
    el("span", { class: "o-nr", text: order.orderNumber }),
    el("span", { class: "badge-status " + meta.tone, text: meta.label }),
    el("span", { class: "o-pickup" },
      el("strong", { text: formatPickupDate(order.pickupDate) }),
      el("span", { class: "muted", text: " " + order.pickupSlot })
    ),
    el("span", { class: "o-cust muted", text: order.customer.name + " · " + order.customer.phone }),
    el("span", { class: "o-total" },
      el("strong", { text: formatKr(order.totalCents) }),
      el("span", { class: "o-mva muted", text: " inkl. mva" })
    ),
    el("span", { class: "chev", "aria-hidden": "true", text: "▾" })
  );
  summaryBtn.addEventListener("click", () => {
    const open = detail.hidden;
    detail.hidden = !open;
    summaryBtn.setAttribute("aria-expanded", String(open));
    if (open) expandedOrders.add(order.id); else expandedOrders.delete(order.id);
  });

  return el("article", { class: "o-row card", "data-order-id": String(order.id) }, summaryBtn, detail);
}

function metaItem(label, value) {
  if (!value) return null;
  return el("div", { class: "o-meta-item" },
    el("dt", { text: label }),
    el("dd", { text: value })
  );
}

function buildOrderDetail(order) {
  const linesWrap = el("div", { class: "o-lines" });
  for (const line of order.lines || []) {
    const optBits = (line.options || []).map((o) =>
      o.group + ": " + o.value + (o.priceDeltaCents > 0 ? " (+ " + formatKr(o.priceDeltaCents) + ")" : "")
    );
    linesWrap.append(el("div", { class: "o-line" },
      el("div", { class: "o-line-head" },
        el("span", { class: "o-line-name", text: line.qty + " × " + line.productName }),
        el("span", { class: "o-line-price price", text: formatKr(line.lineTotalCents) })
      ),
      line.qty > 1 ? el("div", { class: "o-line-unit muted", text: formatKr(line.unitPriceCents) + " per stk" }) : null,
      optBits.length ? el("div", { class: "o-line-opts muted", text: optBits.join(" · ") }) : null,
      line.cakeText ? el("div", { class: "cake-flag" },
        el("span", { class: "cake-flag-label", text: "Tekst på kaken" }),
        el("span", { class: "cake-flag-text", text: "«" + line.cakeText + "»" })
      ) : null
    ));
  }

  const metaWrap = el("dl", { class: "o-meta" },
    metaItem("E-post", order.customer.email),
    metaItem("Telefon", order.customer.phone),
    order.note ? metaItem("Merknad fra kunden", order.note) : null,
    metaItem("Betalingsreferanse", order.paymentReference),
    metaItem("Bestilt", order.createdAt ? formatCreatedAt(order.createdAt) : "")
  );

  const totalLine = el("div", { class: "o-detail-total" },
    el("span", { text: "Totalt " }),
    el("strong", { text: formatKr(order.totalCents) }),
    el("span", { class: "muted", text: " inkl. mva" })
  );

  const errorEl = el("p", { class: "form-error o-error", role: "alert" });
  const actions = buildOrderActions(order, errorEl);

  return el("div", { class: "o-detail" }, linesWrap, totalLine, metaWrap, errorEl, actions);
}

function buildOrderActions(order, errorEl) {
  const wrap = el("div", { class: "o-actions" });
  const next = NEXT_STATUS[order.status];
  if (next) {
    wrap.append(el("button", {
      class: "btn btn-primary btn-sm", type: "button", text: NEXT_LABEL[next],
      onclick: () => changeStatus(order, next, wrap, errorEl),
    }));
  }
  const terminal = order.status === "picked_up" || order.status === "cancelled";
  if (!terminal) {
    wrap.append(el("button", {
      class: "btn btn-sm btn-danger", type: "button", text: "Kanseller",
      onclick: () => {
        const ok = window.confirm("Vil du kansellere bestilling " + order.orderNumber + "? Dette kan ikke angres.");
        if (ok) changeStatus(order, "cancelled", wrap, errorEl);
      },
    }));
  } else {
    wrap.append(el("span", {
      class: "muted o-done",
      text: order.status === "picked_up" ? "Hentet og ferdig. Godt jobbet!" : "Bestillingen er kansellert.",
    }));
  }
  return wrap;
}

async function changeStatus(order, nextStatus, actionsWrap, errorEl) {
  errorEl.textContent = "";
  const buttons = actionsWrap.querySelectorAll("button");
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const data = await fetchJson("/api/admin/orders/" + order.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const idx = allOrders.findIndex((o) => o.id === order.id);
    if (idx !== -1 && data && data.order) allOrders[idx] = data.order;
    expandedOrders.add(order.id);
    renderFilterChips();
    renderOrders(order.id);
  } catch (err) {
    errorEl.textContent = err.message;
    buttons.forEach((b) => { b.disabled = false; });
  }
}

// ---------- products view ----------

async function loadProducts() {
  const status = document.getElementById("products-status");
  const list = document.getElementById("products-list");
  status.textContent = "Henter produkter...";
  try {
    const data = await fetchJson("/api/admin/products");
    products = data.products || [];
    status.textContent = "";
    renderProducts();
    fillCategoryDatalist();
  } catch {
    status.textContent = "";
    list.textContent = "";
    list.append(el("div", { class: "empty card" },
      el("p", { text: "Oi, vi fikk ikke hentet produktene. Sjekk at serveren kjører." }),
      el("button", { class: "btn btn-sm", type: "button", text: "Prøv igjen", onclick: loadProducts })
    ));
  }
}

function fillCategoryDatalist() {
  const datalist = document.getElementById("category-list");
  datalist.textContent = "";
  const seen = new Set();
  for (const p of products) {
    const c = (p.category || "").trim();
    if (c && !seen.has(c)) {
      seen.add(c);
      datalist.append(el("option", { value: c }));
    }
  }
}

function renderProducts() {
  const list = document.getElementById("products-list");
  list.textContent = "";
  if (!products.length) {
    list.append(el("div", { class: "empty card", text: "Ingen produkter ennå. Lag det første!" }));
    return;
  }
  for (const p of products) list.append(buildProductRow(p));
}

function buildProductRow(p) {
  const thumb = p.imageUrl
    ? el("img", { class: "p-thumb", src: p.imageUrl, alt: p.name })
    : el("div", { class: "p-thumb p-thumb-empty", "aria-hidden": "true" });

  const row = el("article", { class: "p-row card" + (p.active ? "" : " p-inactive") },
    thumb,
    el("div", { class: "p-info" },
      el("div", { class: "p-name" },
        el("strong", { text: p.name }),
        p.active ? null : el("span", { class: "badge-status st-cancelled", text: "Inaktiv" })
      ),
      el("div", { class: "p-meta muted", text: (p.category || "Uten kategori") + " · fra " + formatKr(p.basePriceCents) + " · ledetid " + leadLabel(p.leadTimeDays) })
    ),
    el("div", { class: "p-actions" },
      el("button", { class: "btn btn-sm", type: "button", text: "Rediger", onclick: () => openForm(p) }),
      p.active
        ? el("button", { class: "btn btn-sm btn-danger", type: "button", text: "Deaktiver", onclick: () => toggleActive(p, row) })
        : el("button", { class: "btn btn-sm btn-mint", type: "button", text: "Aktiver", onclick: () => toggleActive(p, row) })
    ),
    el("p", { class: "form-error p-error", role: "alert" })
  );
  return row;
}

async function toggleActive(p, row) {
  const errEl = row.querySelector(".p-error");
  errEl.textContent = "";
  const buttons = row.querySelectorAll("button");
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const data = await fetchJson("/api/admin/products/" + p.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    const idx = products.findIndex((x) => x.id === p.id);
    if (idx !== -1 && data && data.product) products[idx] = data.product;
    renderProducts();
    flashProductsNote(p.active ? "Produktet er deaktivert." : "Produktet er aktivert igjen!");
  } catch (err) {
    errEl.textContent = err.message;
    buttons.forEach((b) => { b.disabled = false; });
  }
}

// ---------- product form ----------

function nextSortOrder() {
  let max = 0;
  for (const p of products) {
    if (Number.isFinite(p.sortOrder) && p.sortOrder > max) max = p.sortOrder;
  }
  return max + 1;
}

function openForm(p) {
  editingId = p ? p.id : null;
  document.getElementById("form-title").textContent = p ? "Rediger produkt" : "Nytt produkt";
  document.getElementById("f-name").value = p ? p.name : "";
  document.getElementById("f-desc").value = p ? (p.description || "") : "";
  document.getElementById("f-category").value = p ? (p.category || "") : "";
  document.getElementById("f-image").value = p ? (p.imageUrl || "") : "";
  document.getElementById("f-price").value = p ? centsToKrInput(p.basePriceCents) : "";
  document.getElementById("f-lead").value = p ? String(p.leadTimeDays || 0) : "0";
  const cake = document.getElementById("f-cake");
  cake.checked = p ? !!p.canHaveCakeText : false;
  const cakePrice = document.getElementById("f-cake-price");
  cakePrice.value = p && p.cakeTextPriceCents ? centsToKrInput(p.cakeTextPriceCents) : "";
  cakePrice.disabled = !cake.checked;
  document.getElementById("f-sort").value = p ? String(p.sortOrder || 0) : String(nextSortOrder());

  const rows = document.getElementById("opt-rows");
  rows.textContent = "";
  if (p) {
    for (const group of p.optionGroups || []) {
      for (const option of group.options || []) {
        addOptRow({
          groupName: group.name,
          valueName: option.value,
          priceDeltaCents: option.priceDeltaCents,
          isDefault: option.isDefault,
        });
      }
    }
  }

  document.getElementById("form-error").textContent = "";
  const panel = document.getElementById("form-panel");
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("f-name").focus();
}

function closeForm() {
  editingId = null;
  document.getElementById("form-panel").hidden = true;
  document.getElementById("form-error").textContent = "";
}

function addOptRow(data) {
  const uid = "opt-" + (++optRowSeq);
  const groupInput = el("input", { type: "text", id: uid + "-g", placeholder: "F.eks. Størrelse", value: data ? data.groupName : "" });
  const valueInput = el("input", { type: "text", id: uid + "-v", placeholder: "F.eks. 8 personer", value: data ? data.valueName : "" });
  const priceInput = el("input", { type: "text", inputmode: "decimal", id: uid + "-p", placeholder: "0", value: data && data.priceDeltaCents ? centsToKrInput(data.priceDeltaCents) : "" });
  const radio = el("input", { type: "radio", class: "opt-default", id: uid + "-d" });

  function syncRadioName() {
    const slug = groupInput.value.trim().toLowerCase();
    radio.name = "optdef-" + (slug ? encodeURIComponent(slug) : uid);
  }
  groupInput.addEventListener("input", syncRadioName);
  syncRadioName();

  const row = el("div", { class: "opt-row" },
    el("div", { class: "opt-cell" },
      el("label", { for: uid + "-g", class: "opt-label", text: "Gruppe" }), groupInput),
    el("div", { class: "opt-cell" },
      el("label", { for: uid + "-v", class: "opt-label", text: "Verdi" }), valueInput),
    el("div", { class: "opt-cell opt-cell-price" },
      el("label", { for: uid + "-p", class: "opt-label", text: "Tillegg (kr)" }), priceInput),
    el("div", { class: "opt-cell opt-cell-default" },
      el("label", { for: uid + "-d", class: "opt-label", text: "Standard" }), radio),
    el("button", { class: "btn btn-sm opt-remove", type: "button", text: "Fjern", "aria-label": "Fjern raden", onclick: () => row.remove() })
  );
  document.getElementById("opt-rows").append(row);
  if (data && data.isDefault) radio.checked = true;
}

// Serialize option rows in DOM order; row order becomes the option position.
function serializeOptions() {
  const rows = document.querySelectorAll("#opt-rows .opt-row");
  const options = [];
  for (const row of rows) {
    const textInputs = row.querySelectorAll('input[type="text"]');
    const radio = row.querySelector('input[type="radio"]');
    const groupName = textInputs[0].value.trim();
    const valueName = textInputs[1].value.trim();
    const priceRaw = textInputs[2].value.trim();
    if (!groupName && !valueName && !priceRaw) continue;
    if (!groupName || !valueName) {
      throw new Error("Fyll ut både gruppe og verdi i alle valgradene, eller fjern raden.");
    }
    let delta = 0;
    if (priceRaw) {
      delta = parseKrToCents(priceRaw);
      if (!Number.isFinite(delta)) {
        throw new Error("Pristillegget «" + priceRaw + "» er ikke et gyldig beløp i kroner.");
      }
    }
    options.push({ groupName, valueName, priceDeltaCents: delta, isDefault: !!(radio && radio.checked) });
  }
  return options;
}

async function submitForm(event) {
  event.preventDefault();
  const errEl = document.getElementById("form-error");
  errEl.textContent = "";

  const name = document.getElementById("f-name").value.trim();
  if (!name) { errEl.textContent = "Produktet må ha et navn."; return; }

  const priceRaw = document.getElementById("f-price").value.trim();
  const basePriceCents = parseKrToCents(priceRaw);
  if (!priceRaw || !Number.isFinite(basePriceCents) || basePriceCents < 0) {
    errEl.textContent = "Grunnprisen må være et gyldig beløp i kroner.";
    return;
  }

  const lead = Number(document.getElementById("f-lead").value);
  if (!Number.isInteger(lead) || lead < 0 || lead > 30) {
    errEl.textContent = "Ledetiden må være et helt tall mellom 0 og 30 dager.";
    return;
  }

  const canCake = document.getElementById("f-cake").checked;
  let cakeTextPriceCents = 0;
  const cakePriceRaw = document.getElementById("f-cake-price").value.trim();
  if (canCake && cakePriceRaw) {
    cakeTextPriceCents = parseKrToCents(cakePriceRaw);
    if (!Number.isFinite(cakeTextPriceCents) || cakeTextPriceCents < 0) {
      errEl.textContent = "Prisen for kaketekst må være et gyldig beløp i kroner.";
      return;
    }
  }

  const sortRaw = document.getElementById("f-sort").value.trim();
  const sortOrder = sortRaw === "" ? 0 : Number(sortRaw);
  if (!Number.isInteger(sortOrder)) {
    errEl.textContent = "Sorteringen må være et helt tall.";
    return;
  }

  let options;
  try {
    options = serializeOptions();
  } catch (err) {
    errEl.textContent = err.message;
    return;
  }

  // PATCH replaces the whole option list, so we always send the full set.
  const body = {
    name,
    description: document.getElementById("f-desc").value.trim(),
    category: document.getElementById("f-category").value.trim(),
    imageUrl: document.getElementById("f-image").value.trim(),
    basePriceCents,
    leadTimeDays: lead,
    canHaveCakeText: canCake,
    cakeTextPriceCents: canCake ? cakeTextPriceCents : 0,
    sortOrder,
    options,
  };

  const saveBtn = document.getElementById("btn-save");
  saveBtn.disabled = true;
  try {
    if (editingId == null) {
      await fetchJson("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetchJson("/api/admin/products/" + editingId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    closeForm();
    await loadProducts();
    flashProductsNote("Produktet er lagret!");
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    saveBtn.disabled = false;
  }
}

let noteTimer = null;
function flashProductsNote(message) {
  const note = document.getElementById("products-note");
  note.textContent = message;
  if (noteTimer) clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { note.textContent = ""; }, 4000);
}

// ---------- tabs + init ----------

function activateTab(which) {
  const orders = which === "orders";
  const tabOrders = document.getElementById("tab-orders");
  const tabProducts = document.getElementById("tab-products");
  tabOrders.setAttribute("aria-pressed", String(orders));
  tabProducts.setAttribute("aria-pressed", String(!orders));
  tabOrders.classList.toggle("tab-active", orders);
  tabProducts.classList.toggle("tab-active", !orders);
  document.getElementById("panel-orders").hidden = !orders;
  document.getElementById("panel-products").hidden = orders;
  history.replaceState(null, "", orders ? "#bestillinger" : "#produkter");
}

async function loadBakeryName() {
  try {
    const data = await fetchJson("/api/shop");
    if (data && data.bakery && data.bakery.name) {
      document.getElementById("brand-name").textContent = data.bakery.name;
      document.title = "Admin: " + data.bakery.name;
    }
  } catch { /* keep the fallback name */ }
}

function init() {
  const badge = document.getElementById("cart-badge");
  const cart = loadCart();
  const count = Array.isArray(cart.lines) ? cartCount(cart) : 0;
  if (count > 0) {
    badge.textContent = String(count);
    badge.hidden = false;
  }

  document.getElementById("tab-orders").addEventListener("click", () => activateTab("orders"));
  document.getElementById("tab-products").addEventListener("click", () => activateTab("products"));
  document.getElementById("btn-refresh").addEventListener("click", loadOrders);
  document.getElementById("btn-new-product").addEventListener("click", () => openForm(null));
  document.getElementById("btn-add-opt").addEventListener("click", () => addOptRow(null));
  document.getElementById("btn-cancel").addEventListener("click", closeForm);
  document.getElementById("product-form").addEventListener("submit", submitForm);
  document.getElementById("f-cake").addEventListener("change", (event) => {
    document.getElementById("f-cake-price").disabled = !event.target.checked;
  });

  if (location.hash === "#produkter") activateTab("products");
  else activateTab("orders");

  loadBakeryName();
  loadOrders();
  loadProducts();
}

init();
