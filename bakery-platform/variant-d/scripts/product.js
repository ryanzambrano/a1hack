// Product detail page for variant D "Lekent".
// Reads ?id= from the URL, fetches the product, renders option groups,
// cake text, a quantity stepper and a live total, and adds configured
// lines to the shared localStorage cart per docs/contract.md.

const CART_KEY = "bakeri_cart_v1";

// Shared helpers copied from docs/contract.md
function formatKr(cents) {
  const kr = cents / 100;
  return "kr " + (Number.isInteger(kr) ? kr : kr.toFixed(2).replace(".", ","));
}
function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || { lines: [] }; }
  catch { return { lines: [] }; }
}
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
function cartCount(cart) { return cart.lines.reduce((n, l) => n + l.qty, 0); }

const MAX_QTY = 50;
const MAX_LINES = 30;
const MAX_CAKE_TEXT = 60;

const statusEl = document.getElementById("status");
const viewEl = document.getElementById("product-view");
const brandEl = document.getElementById("brand-name");
const cartLinkEl = document.getElementById("cart-link");
const badgeEl = document.getElementById("cart-badge");

let bakeryName = "Bakeriet";
let product = null;
let selectedByGroup = []; // group index -> selected option id
let cakeInput = null;
let cakeCountEl = null;
let qtyInput = null;
let minusBtn = null;
let plusBtn = null;
let totalEl = null;
let feedbackEl = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeCount() {
  const cart = loadCart();
  return Array.isArray(cart.lines) ? cartCount(cart) : 0;
}

function updateBadge() {
  const n = safeCount();
  badgeEl.hidden = n === 0;
  badgeEl.textContent = String(n);
  cartLinkEl.setAttribute("aria-label", "Handlekurv, " + n + (n === 1 ? " vare" : " varer"));
}

function setTitle() {
  document.title = (product ? product.name + " | " : "Produkt | ") + bakeryName;
}

function renderFooter(b) {
  const card = document.getElementById("footer-card");
  if (!card || !b) return;
  card.textContent = "";
  card.appendChild(el("h2", "footer-title", "Kom innom oss!"));
  const contact = el("ul", "contact-list");
  if (b.address) {
    const li = el("li");
    li.appendChild(el("span", "contact-label", "Adresse"));
    li.appendChild(el("span", "", b.address));
    contact.appendChild(li);
  }
  if (b.phone) {
    const li = el("li");
    li.appendChild(el("span", "contact-label", "Telefon"));
    const a = el("a", "", b.phone);
    a.href = "tel:" + String(b.phone).replace(/\s+/g, "");
    li.appendChild(a);
    contact.appendChild(li);
  }
  if (b.email) {
    const li = el("li");
    li.appendChild(el("span", "contact-label", "E-post"));
    const a = el("a", "", b.email);
    a.href = "mailto:" + b.email;
    li.appendChild(a);
    contact.appendChild(li);
  }
  card.appendChild(contact);
  card.appendChild(el("p", "muted footer-note", "Alle priser er inkl. mva."));
  card.hidden = false;
}

async function fetchShop() {
  try {
    const res = await fetch("/api/shop");
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.bakery && data.bakery.name) {
      bakeryName = data.bakery.name;
      brandEl.textContent = bakeryName;
      setTitle();
      renderFooter(data.bakery);
    }
  } catch {
    // Keep the static fallback name.
  }
}

function leadTimeNote(days) {
  if (!days || days <= 0) return "Kan vanligvis hentes samme dag";
  if (days === 1) return "Bestilles senest 1 dag før henting";
  return "Bestilles senest " + days + " dager før henting";
}

function showLoading() {
  viewEl.hidden = true;
  statusEl.hidden = false;
  statusEl.textContent = "Henter produktet...";
}

function showNotFound() {
  viewEl.hidden = true;
  statusEl.hidden = false;
  statusEl.textContent = "";
  statusEl.appendChild(el("h2", "", "Oi, denne fant vi ikke!"));
  statusEl.appendChild(el("p", "muted",
    "Produktet finnes ikke lenger, eller så har lenken smuldret litt opp. Ta en titt i butikken i stedet!"));
  const back = el("a", "btn btn-primary", "Tilbake til butikken");
  back.href = "./index.html";
  statusEl.appendChild(back);
}

function showError(id) {
  viewEl.hidden = true;
  statusEl.hidden = false;
  statusEl.textContent = "";
  statusEl.appendChild(el("h2", "", "Oi, noe gikk galt"));
  statusEl.appendChild(el("p", "muted",
    "Vi klarte ikke å hente produktet akkurat nå. Sjekk nettet og prøv igjen!"));
  const retry = el("button", "btn btn-primary", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", () => loadProduct(id));
  statusEl.appendChild(retry);
  const backRow = el("p", "back-row");
  const back = el("a", "", "Tilbake til butikken");
  back.href = "./index.html";
  backRow.appendChild(back);
  statusEl.appendChild(backRow);
}

async function loadProduct(id) {
  showLoading();
  let res;
  try {
    res = await fetch("/api/products/" + encodeURIComponent(id));
  } catch {
    showError(id);
    return;
  }
  if (res.status === 404) { showNotFound(); return; }
  if (!res.ok) { showError(id); return; }
  let data;
  try { data = await res.json(); } catch { showError(id); return; }
  if (!data || !data.product) { showError(id); return; }
  product = data.product;
  renderProduct();
}

function renderProduct() {
  setTitle();
  statusEl.hidden = true;
  viewEl.hidden = false;
  viewEl.textContent = "";
  selectedByGroup = [];

  // Image card
  const media = el("div", "card media-card");
  const img = document.createElement("img");
  img.src = product.imageUrl;
  img.alt = product.name;
  media.appendChild(img);
  viewEl.appendChild(media);

  // Configuration card
  const cfg = el("section", "card config-card");
  viewEl.appendChild(cfg);

  cfg.appendChild(el("h1", "", product.name));

  const meta = el("div", "meta-row");
  if (product.category) meta.appendChild(el("span", "badge", product.category));
  meta.appendChild(el("span", "badge badge-mint", leadTimeNote(product.leadTimeDays)));
  cfg.appendChild(meta);

  if (product.description) {
    cfg.appendChild(el("p", "muted product-desc", product.description));
  }

  const form = document.createElement("form");
  form.addEventListener("submit", (e) => { e.preventDefault(); addToCart(); });
  cfg.appendChild(form);

  // Option groups. Per the contract, the display price for an option is
  // basePriceCents + priceDeltaCents shown as an absolute. Groups where all
  // deltas are zero show no per-option price (the base price applies).
  const groups = Array.isArray(product.optionGroups) ? product.optionGroups : [];

  groups.forEach((group, gi) => {
    const options = Array.isArray(group.options) ? group.options : [];
    if (!options.length) return;
    const hasDelta = options.some((o) => o.priceDeltaCents !== 0);
    const fs = el("fieldset", "opt-group");
    fs.appendChild(el("legend", "", group.name));
    const list = el("div", "opt-list");
    const def = options.find((o) => o.isDefault) || options[0];
    selectedByGroup[gi] = def.id;
    options.forEach((opt) => {
      const label = el("label", "opt-pill");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "group-" + gi;
      input.value = String(opt.id);
      input.checked = opt.id === def.id;
      input.addEventListener("change", () => {
        selectedByGroup[gi] = opt.id;
        updateTotal();
      });
      const face = el("span", "opt-face");
      face.appendChild(el("span", "opt-name", opt.value));
      if (hasDelta) {
        face.appendChild(el("span", "opt-price",
          formatKr(product.basePriceCents + opt.priceDeltaCents)));
      }
      label.appendChild(input);
      label.appendChild(face);
      list.appendChild(label);
    });
    fs.appendChild(list);
    form.appendChild(fs);
  });

  // Cake text (only when the product allows it)
  cakeInput = null;
  cakeCountEl = null;
  if (product.canHaveCakeText) {
    const block = el("div", "cake-text-block");
    const row = el("div", "cake-label-row");
    const lab = el("label", "", "Tekst på kaken");
    lab.htmlFor = "cake-text";
    row.appendChild(lab);
    if (product.cakeTextPriceCents > 0) {
      row.appendChild(el("span", "badge", "+ " + formatKr(product.cakeTextPriceCents)));
    } else {
      row.appendChild(el("span", "badge badge-mint", "Inkludert"));
    }
    block.appendChild(row);
    cakeInput = document.createElement("input");
    cakeInput.type = "text";
    cakeInput.id = "cake-text";
    cakeInput.maxLength = MAX_CAKE_TEXT;
    cakeInput.placeholder = "F.eks. Gratulerer med dagen!";
    cakeInput.addEventListener("input", () => { updateCakeCount(); updateTotal(); });
    block.appendChild(cakeInput);
    cakeCountEl = el("span", "cake-count muted", "0/" + MAX_CAKE_TEXT + " tegn");
    block.appendChild(cakeCountEl);
    form.appendChild(block);
  }

  // Quantity stepper
  const qtyBlock = el("div", "qty-block");
  const qtyLab = el("label", "", "Antall");
  qtyLab.htmlFor = "qty";
  qtyBlock.appendChild(qtyLab);
  const qtyRow = el("div", "qty-row");
  minusBtn = el("button", "qty-btn", "-");
  minusBtn.type = "button";
  minusBtn.setAttribute("aria-label", "Færre");
  minusBtn.addEventListener("click", () => setQty(currentQty() - 1));
  qtyInput = document.createElement("input");
  qtyInput.type = "number";
  qtyInput.id = "qty";
  qtyInput.className = "qty-input";
  qtyInput.min = "1";
  qtyInput.max = String(MAX_QTY);
  qtyInput.step = "1";
  qtyInput.inputMode = "numeric";
  qtyInput.value = "1";
  qtyInput.addEventListener("change", () => setQty(currentQty()));
  qtyInput.addEventListener("input", updateTotal);
  plusBtn = el("button", "qty-btn", "+");
  plusBtn.type = "button";
  plusBtn.setAttribute("aria-label", "Flere");
  plusBtn.addEventListener("click", () => setQty(currentQty() + 1));
  qtyRow.appendChild(minusBtn);
  qtyRow.appendChild(qtyInput);
  qtyRow.appendChild(plusBtn);
  qtyBlock.appendChild(qtyRow);
  form.appendChild(qtyBlock);

  // Live total
  const totalRow = el("div", "total-row");
  const left = el("div", "");
  left.appendChild(el("div", "total-label", "Totalt"));
  left.appendChild(el("div", "total-note muted", "inkl. mva"));
  totalRow.appendChild(left);
  totalEl = el("div", "total-price price");
  totalEl.setAttribute("aria-live", "polite");
  totalRow.appendChild(totalEl);
  form.appendChild(totalRow);

  const addBtn = el("button", "btn btn-primary add-btn", "Legg i handlekurv");
  addBtn.type = "submit";
  form.appendChild(addBtn);

  feedbackEl = el("div", "feedback");
  feedbackEl.setAttribute("aria-live", "polite");
  form.appendChild(feedbackEl);

  setQty(1);
}

function currentQty() {
  const n = Math.round(Number(qtyInput.value));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > MAX_QTY) return MAX_QTY;
  return n;
}

function setQty(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n) || n < 1) n = 1;
  if (n > MAX_QTY) n = MAX_QTY;
  qtyInput.value = String(n);
  minusBtn.disabled = n <= 1;
  plusBtn.disabled = n >= MAX_QTY;
  updateTotal();
}

function unitPriceCents() {
  let cents = product.basePriceCents;
  (product.optionGroups || []).forEach((g, gi) => {
    const opt = (g.options || []).find((o) => o.id === selectedByGroup[gi]);
    if (opt) cents += opt.priceDeltaCents;
  });
  if (product.canHaveCakeText && cakeInput && cakeInput.value.trim()) {
    cents += product.cakeTextPriceCents;
  }
  return cents;
}

function updateTotal() {
  if (!totalEl) return;
  totalEl.textContent = formatKr(unitPriceCents() * currentQty());
}

function updateCakeCount() {
  if (cakeCountEl && cakeInput) {
    cakeCountEl.textContent = cakeInput.value.length + "/" + MAX_CAKE_TEXT + " tegn";
  }
}

function sameIdSet(a, b) {
  const x = Array.isArray(a) ? a.slice().sort((m, n) => m - n) : [];
  const y = Array.isArray(b) ? b.slice().sort((m, n) => m - n) : [];
  if (x.length !== y.length) return false;
  return x.every((v, i) => v === y[i]);
}

function addToCart() {
  const qty = currentQty();
  const optionIds = selectedByGroup
    .filter((id) => Number.isInteger(id))
    .slice()
    .sort((a, b) => a - b);
  const text = (product.canHaveCakeText && cakeInput)
    ? cakeInput.value.trim().slice(0, MAX_CAKE_TEXT)
    : "";

  const cart = loadCart();
  if (!Array.isArray(cart.lines)) cart.lines = [];

  // Merge rule: same product + same option set + same cake text -> bump qty.
  const existing = cart.lines.find((l) =>
    l.productId === product.id &&
    sameIdSet(l.optionIds, optionIds) &&
    (l.cakeText || "") === text
  );

  let capped = false;
  if (existing) {
    const next = (existing.qty || 0) + qty;
    existing.qty = Math.min(MAX_QTY, next);
    capped = next > MAX_QTY;
  } else {
    if (cart.lines.length >= MAX_LINES) {
      showFeedback("warn",
        "Handlekurven er helt full (maks " + MAX_LINES + " ulike varer). Rydd litt plass i kurven først!");
      return;
    }
    const line = { productId: product.id, qty };
    if (optionIds.length) line.optionIds = optionIds;
    if (text) line.cakeText = text;
    cart.lines.push(line);
  }

  saveCart(cart);
  updateBadge();
  if (capped) {
    showFeedback("ok",
      "Du kan ha maks " + MAX_QTY + " av samme vare, så vi stoppet på " + MAX_QTY + ". " +
      product.name + " ligger i handlekurven.");
  } else {
    showFeedback("ok", "Mmm, godt valg! " + product.name + " ligger i handlekurven.");
  }
}

function showFeedback(kind, message) {
  if (!feedbackEl) return;
  feedbackEl.textContent = "";
  const note = el("div", "added-note" + (kind === "warn" ? " warn-note" : ""));
  note.appendChild(el("p", "added-msg", message));
  const links = el("div", "added-links");
  const toCart = el("a", "", "Til handlekurven");
  toCart.href = "./cart.html";
  links.appendChild(toCart);
  const keep = el("a", "", "Fortsett å handle");
  keep.href = "./index.html";
  links.appendChild(keep);
  note.appendChild(links);
  feedbackEl.appendChild(note);
}

function init() {
  updateBadge();
  window.addEventListener("storage", (e) => {
    if (e.key === CART_KEY) updateBadge();
  });
  fetchShop();
  const id = (new URLSearchParams(location.search).get("id") || "").trim();
  if (!/^\d+$/.test(id)) {
    showNotFound();
    return;
  }
  loadProduct(id);
}

init();
