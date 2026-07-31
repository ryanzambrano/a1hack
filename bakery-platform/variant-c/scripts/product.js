// Product detail page for variant C "Tidsskrift" (editorial).
// Reads ?id= from the URL, renders the configuration form, adds to the cart.

// --- Shared helpers copied from docs/contract.md ---

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

// --- Limits mirrored from the server (docs/contract.md) ---

const MAX_QTY = 50;
const MAX_LINES = 30;
const MAX_CAKE_TEXT = 60;

// --- Page state ---

const pageEl = document.getElementById("page");
const badgeEl = document.getElementById("cartBadge");
const bakeryNameEl = document.getElementById("bakeryName");
const footerLineEl = document.getElementById("footerLine");

let product = null;
let selectedByGroup = []; // selected option id per option-group index
let qty = 1;

// --- Small DOM helpers (textContent only, user text is never injected as HTML) ---

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function padNo(n) {
  return n < 10 ? "0" + n : String(n);
}

function renderBadge() {
  const cart = loadCart();
  const n = Array.isArray(cart.lines) ? cartCount(cart) : 0;
  badgeEl.textContent = String(n);
  badgeEl.hidden = n === 0;
}

// --- Header and footer bakery info (non-fatal if it fails) ---

async function fetchShop() {
  try {
    const res = await fetch("/api/shop");
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.bakery && data.bakery.name) {
      bakeryNameEl.textContent = data.bakery.name;
      const parts = [data.bakery.name, data.bakery.address, data.bakery.phone].filter(Boolean);
      footerLineEl.textContent = parts.join(" · ");
      if (product) document.title = product.name + " - " + data.bakery.name;
    }
  } catch {
    // Keep the static fallback text.
  }
}

// --- Loading, error and not-found states ---

function showLoading() {
  pageEl.textContent = "";
  pageEl.appendChild(el("p", "muted loading", "Henter produktet…"));
}

function showNotFound() {
  pageEl.textContent = "";
  const box = el("div", "error-box");
  box.appendChild(el("span", "kicker", "Beklager"));
  box.appendChild(el("h2", null, "Vi fant ikke produktet"));
  box.appendChild(el("p", "muted", "Produktet kan være utsolgt eller tatt ut av utvalget. Se gjerne hva vi ellers baker i dag."));
  const actions = el("div", "error-actions");
  const back = el("a", "btn btn-primary", "Tilbake til utvalget");
  back.href = "./index.html";
  actions.appendChild(back);
  box.appendChild(actions);
  pageEl.appendChild(box);
}

function showNetworkError(id) {
  pageEl.textContent = "";
  const box = el("div", "error-box");
  box.appendChild(el("span", "kicker", "Beklager"));
  box.appendChild(el("h2", null, "Vi fikk ikke hentet produktet"));
  box.appendChild(el("p", "muted", "Forbindelsen glapp et øyeblikk. Prøv igjen, så står kaken klar."));
  const actions = el("div", "error-actions");
  const retry = el("button", "btn btn-primary", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", () => loadProduct(id));
  actions.appendChild(retry);
  const back = el("a", "btn", "Tilbake til utvalget");
  back.href = "./index.html";
  actions.appendChild(back);
  box.appendChild(actions);
  pageEl.appendChild(box);
}

// --- Product fetch ---

async function loadProduct(id) {
  showLoading();
  let res;
  try {
    res = await fetch("/api/products/" + encodeURIComponent(id));
  } catch {
    showNetworkError(id);
    return;
  }
  if (res.status === 404) { showNotFound(); return; }
  if (!res.ok) { showNetworkError(id); return; }
  let data;
  try {
    data = await res.json();
  } catch {
    showNetworkError(id);
    return;
  }
  if (!data || !data.product) { showNotFound(); return; }
  product = data.product;
  initSelections();
  renderProduct();
}

function initSelections() {
  selectedByGroup = (product.optionGroups || []).map((group) => {
    const opts = group.options || [];
    const def = opts.find((o) => o.isDefault) || opts[0];
    return def ? def.id : null;
  });
  qty = 1;
}

// The "size-like" group is the first group whose deltas differ between
// options; it gets absolute prices (base + delta). Other groups show "+ kr X".
function findSizeGroupIndex() {
  const groups = product.optionGroups || [];
  for (let i = 0; i < groups.length; i++) {
    const opts = groups[i].options || [];
    if (opts.length > 1 && opts.some((o) => o.priceDeltaCents !== opts[0].priceDeltaCents)) {
      return i;
    }
  }
  return -1;
}

function optionPriceLabel(opt, isSizeLike) {
  if (isSizeLike) return formatKr(product.basePriceCents + opt.priceDeltaCents);
  if (!opt.priceDeltaCents) return "";
  if (opt.priceDeltaCents > 0) return "+ " + formatKr(opt.priceDeltaCents);
  return "− " + formatKr(Math.abs(opt.priceDeltaCents));
}

function leadTimeNote(days) {
  if (!days) return "Bakes fersk og kan hentes samme dag.";
  if (days === 1) return "Bestilles senest 1 dag før henting.";
  return "Bestilles senest " + days + " dager før henting.";
}

// --- Rendering ---

function renderProduct() {
  document.title = product.name + " - " + bakeryNameEl.textContent;
  pageEl.textContent = "";

  const spread = el("div", "spread");

  // Left column: the photograph.
  const media = el("div", "spread-media");
  const figure = el("figure", "figure");
  const img = el("img", "figure-img");
  img.src = product.imageUrl;
  img.alt = product.name;
  figure.appendChild(img);
  figure.appendChild(el("figcaption", "figure-cap muted", "Fra ovnen hos " + bakeryNameEl.textContent));
  media.appendChild(figure);
  spread.appendChild(media);

  // Right column: headline and configuration.
  const body = el("div", "spread-body");
  body.appendChild(el("span", "kicker", product.category || ""));
  body.appendChild(el("h1", null, product.name));
  if (product.description) body.appendChild(el("p", "lede", product.description));
  body.appendChild(el("p", "lead-time", leadTimeNote(product.leadTimeDays)));

  const form = el("form", "config");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    addToCart();
  });

  let secNo = 0;
  const sizeGroupIndex = findSizeGroupIndex();
  (product.optionGroups || []).forEach((group, gi) => {
    secNo += 1;
    form.appendChild(renderGroup(group, gi, secNo, gi === sizeGroupIndex));
  });
  if (product.canHaveCakeText) {
    secNo += 1;
    form.appendChild(renderCakeTextSection(secNo));
  }
  secNo += 1;
  form.appendChild(renderQtySection(secNo));
  form.appendChild(renderSummary());

  body.appendChild(form);
  spread.appendChild(body);
  pageEl.appendChild(spread);
  updateTotal();
}

function renderGroup(group, gi, secNo, isSizeLike) {
  const fs = el("fieldset", "sec");
  const legend = el("legend", "sec-head");
  legend.appendChild(el("span", "sec-num", padNo(secNo)));
  legend.appendChild(el("span", "sec-title", group.name));
  fs.appendChild(legend);

  const list = el("div", "opt-list");
  (group.options || []).forEach((opt) => {
    const row = el("label", "opt-row");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "group-" + gi;
    input.value = String(opt.id);
    input.checked = selectedByGroup[gi] === opt.id;
    input.addEventListener("change", () => {
      selectedByGroup[gi] = opt.id;
      updateTotal();
    });
    row.appendChild(input);
    row.appendChild(el("span", "opt-name", opt.value));
    const priceStr = optionPriceLabel(opt, isSizeLike);
    if (priceStr) {
      row.appendChild(el("span", "opt-leader"));
      row.appendChild(el("span", "opt-price", priceStr));
    }
    list.appendChild(row);
  });
  fs.appendChild(list);
  return fs;
}

function renderCakeTextSection(secNo) {
  const sec = el("div", "sec");
  const head = el("div", "sec-head");
  head.appendChild(el("span", "sec-num", padNo(secNo)));
  const title = el("label", "sec-title");
  title.setAttribute("for", "cakeText");
  title.textContent = "Tekst på kaken";
  head.appendChild(title);
  head.appendChild(el("span", "opt-leader"));
  head.appendChild(el("span", "opt-price",
    product.cakeTextPriceCents > 0 ? "+ " + formatKr(product.cakeTextPriceCents) : "Inkludert"));
  sec.appendChild(head);

  const input = document.createElement("input");
  input.type = "text";
  input.id = "cakeText";
  input.maxLength = MAX_CAKE_TEXT;
  input.autocomplete = "off";
  input.placeholder = "Gratulerer med dagen, Nora";
  input.addEventListener("input", () => {
    updateCakeCounter();
    updateTotal();
  });
  sec.appendChild(input);

  const meta = el("div", "cake-meta");
  const hint = product.cakeTextPriceCents > 0
    ? "Hilsenen skrives for hånd. Prisen legges bare til når feltet er fylt ut."
    : "Hilsenen skrives for hånd av konditoren.";
  meta.appendChild(el("span", "muted cake-hint", hint));
  const counter = el("span", "muted cake-counter", "0/" + MAX_CAKE_TEXT + " tegn");
  counter.id = "cakeCounter";
  meta.appendChild(counter);
  sec.appendChild(meta);
  return sec;
}

function updateCakeCounter() {
  const input = document.getElementById("cakeText");
  const counter = document.getElementById("cakeCounter");
  if (input && counter) {
    counter.textContent = input.value.length + "/" + MAX_CAKE_TEXT + " tegn";
  }
}

function renderQtySection(secNo) {
  const sec = el("div", "sec");
  const head = el("div", "sec-head");
  head.appendChild(el("span", "sec-num", padNo(secNo)));
  const title = el("label", "sec-title");
  title.setAttribute("for", "qtyInput");
  title.textContent = "Antall";
  head.appendChild(title);
  sec.appendChild(head);

  const stepper = el("div", "qty-stepper");
  const minus = el("button", "qty-btn", "−");
  minus.type = "button";
  minus.setAttribute("aria-label", "Færre");
  minus.addEventListener("click", () => setQty(qty - 1));
  stepper.appendChild(minus);

  const input = document.createElement("input");
  input.type = "number";
  input.id = "qtyInput";
  input.className = "qty-input";
  input.min = "1";
  input.max = String(MAX_QTY);
  input.step = "1";
  input.inputMode = "numeric";
  input.value = String(qty);
  input.addEventListener("input", () => {
    const v = parseInt(input.value, 10);
    if (Number.isInteger(v) && v >= 1 && v <= MAX_QTY) {
      qty = v;
      updateTotal();
    }
  });
  input.addEventListener("change", () => setQty(parseInt(input.value, 10)));
  stepper.appendChild(input);

  const plus = el("button", "qty-btn", "+");
  plus.type = "button";
  plus.setAttribute("aria-label", "Flere");
  plus.addEventListener("click", () => setQty(qty + 1));
  stepper.appendChild(plus);

  sec.appendChild(stepper);
  sec.appendChild(el("p", "muted qty-hint", "Mellom 1 og " + MAX_QTY + " per bestilling."));
  return sec;
}

function setQty(v) {
  if (!Number.isInteger(v)) v = 1;
  qty = Math.min(MAX_QTY, Math.max(1, v));
  const input = document.getElementById("qtyInput");
  if (input) input.value = String(qty);
  updateTotal();
}

function renderSummary() {
  const wrap = el("div", "summary");

  const row = el("div", "total-row");
  const label = el("div", "total-label");
  label.appendChild(el("span", "sec-title", "Totalt"));
  label.appendChild(el("span", "muted total-note", "inkl. mva"));
  row.appendChild(label);

  const right = el("div", "total-right");
  const breakdown = el("div", "muted total-breakdown");
  breakdown.id = "totalBreakdown";
  right.appendChild(breakdown);
  const amount = el("div", "total-amount");
  amount.id = "totalAmount";
  amount.setAttribute("aria-live", "polite");
  right.appendChild(amount);
  row.appendChild(right);
  wrap.appendChild(row);

  const submit = el("button", "btn btn-primary add-btn", "Legg i handlekurv");
  submit.type = "submit";
  wrap.appendChild(submit);

  const feedback = el("div", "feedback");
  feedback.id = "feedback";
  feedback.setAttribute("aria-live", "polite");
  wrap.appendChild(feedback);
  return wrap;
}

// --- Price math ---

function currentCakeText() {
  const input = document.getElementById("cakeText");
  return input ? input.value.trim().slice(0, MAX_CAKE_TEXT) : "";
}

function unitPriceCents() {
  let cents = product.basePriceCents;
  (product.optionGroups || []).forEach((group, gi) => {
    const opt = (group.options || []).find((o) => o.id === selectedByGroup[gi]);
    if (opt) cents += opt.priceDeltaCents;
  });
  if (product.canHaveCakeText && currentCakeText()) cents += product.cakeTextPriceCents;
  return cents;
}

function updateTotal() {
  const unit = unitPriceCents();
  const amount = document.getElementById("totalAmount");
  const breakdown = document.getElementById("totalBreakdown");
  if (amount) amount.textContent = formatKr(unit * qty);
  if (breakdown) breakdown.textContent = qty + " × " + formatKr(unit);
}

// --- Cart (merge rule from docs/contract.md) ---

function selectedOptionIds() {
  return (product.optionGroups || [])
    .map((group, gi) => selectedByGroup[gi])
    .filter((id) => Number.isInteger(id))
    .sort((a, b) => a - b);
}

function sameIdSets(a, sortedB) {
  const list = Array.isArray(a) ? a.slice().sort((x, y) => x - y) : [];
  if (list.length !== sortedB.length) return false;
  return list.every((v, i) => v === sortedB[i]);
}

function addToCart() {
  const cart = loadCart();
  if (!Array.isArray(cart.lines)) cart.lines = [];
  const optionIds = selectedOptionIds();
  const text = product.canHaveCakeText ? currentCakeText() : "";

  const existing = cart.lines.find((l) => l && l.productId === product.id
    && sameIdSets(l.optionIds, optionIds)
    && (typeof l.cakeText === "string" ? l.cakeText : "") === text);

  if (existing) {
    existing.qty = Math.min(MAX_QTY, (existing.qty || 0) + qty);
  } else {
    if (cart.lines.length >= MAX_LINES) {
      showFeedback("Handlekurven er full. En bestilling kan ha maks " + MAX_LINES + " ulike varer.", true);
      return;
    }
    const line = { productId: product.id, qty: qty, optionIds: optionIds };
    if (text) line.cakeText = text;
    cart.lines.push(line);
  }
  saveCart(cart);
  renderBadge();
  showFeedback(null, false);
}

function showFeedback(message, isError) {
  const box = document.getElementById("feedback");
  if (!box) return;
  box.textContent = "";
  box.className = "feedback " + (isError ? "feedback-warn" : "feedback-ok");
  if (isError) {
    box.appendChild(el("p", "feedback-text", message));
    return;
  }
  box.appendChild(el("p", "feedback-text", "«" + product.name + "» er lagt i handlekurven."));
  const links = el("p", "feedback-links");
  const toCart = el("a", "btn feedback-btn", "Til handlekurven");
  toCart.href = "./cart.html";
  links.appendChild(toCart);
  const cont = el("a", "feedback-continue", "Fortsett å handle");
  cont.href = "./index.html";
  links.appendChild(cont);
  box.appendChild(links);
}

// --- Boot ---

function init() {
  renderBadge();
  fetchShop();
  window.addEventListener("storage", (e) => {
    if (e.key === CART_KEY) renderBadge();
  });
  const id = (new URLSearchParams(location.search).get("id") || "").trim();
  if (!id || !/^\d+$/.test(id)) {
    showNotFound();
    return;
  }
  loadProduct(id);
}

init();
