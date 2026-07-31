// Variant A "Håndverk" - product detail / configuration page.
// Reads ?id= from the URL, fetches the product, renders option groups,
// cake text, a quantity stepper and a live total, and adds configured
// lines to the shared localStorage cart (see docs/contract.md).

// --- shared helpers (copied from contract.md) ---
const CART_KEY = "bakeri_cart_v1";
function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || { lines: [] }; }
  catch { return { lines: [] }; }
}
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
function cartCount(cart) { return cart.lines.reduce((n, l) => n + l.qty, 0); }
function formatKr(cents) {
  const kr = cents / 100;
  return "kr " + (Number.isInteger(kr) ? kr : kr.toFixed(2).replace(".", ","));
}

// --- limits mirrored from the server (contract.md) ---
const MAX_QTY = 50;
const MAX_CART_LINES = 30;
const CAKE_TEXT_MAX = 60;

const els = {
  bakeryName: document.getElementById("bakery-name"),
  cartLink: document.getElementById("cart-link"),
  cartBadge: document.getElementById("cart-badge"),
  loading: document.getElementById("loading"),
  error: document.getElementById("error"),
  errorMessage: document.getElementById("error-message"),
  retryBtn: document.getElementById("retry-btn"),
  product: document.getElementById("product"),
  media: document.getElementById("product-media"),
  image: document.getElementById("product-image"),
  category: document.getElementById("product-category"),
  leadNote: document.getElementById("lead-note"),
  name: document.getElementById("product-name"),
  desc: document.getElementById("product-desc"),
  form: document.getElementById("config-form"),
  optionGroups: document.getElementById("option-groups"),
  cakeTextBlock: document.getElementById("cake-text-block"),
  cakeTextPrice: document.getElementById("cake-text-price"),
  cakeText: document.getElementById("cake-text"),
  charCounter: document.getElementById("char-counter"),
  qtyInput: document.getElementById("qty-input"),
  qtyMinus: document.getElementById("qty-minus"),
  qtyPlus: document.getElementById("qty-plus"),
  totalPrice: document.getElementById("total-price"),
  unitNote: document.getElementById("unit-note"),
  feedback: document.getElementById("feedback"),
  feedbackTitle: document.getElementById("feedback-title"),
  feedbackSub: document.getElementById("feedback-sub"),
  footerName: document.getElementById("footer-name"),
  footerAddress: document.getElementById("footer-address"),
  footerPhone: document.getElementById("footer-phone"),
  footerEmail: document.getElementById("footer-email"),
};

let product = null;
let shopName = "Bakeriet på Hjørnet";
const optionById = new Map();
const productId = new URLSearchParams(location.search).get("id");

init();

function init() {
  updateCartBadge();
  window.addEventListener("storage", updateCartBadge);
  loadShopInfo();

  els.retryBtn.addEventListener("click", () => loadProduct());
  els.form.addEventListener("submit", addToCart);
  els.form.addEventListener("change", () => { hideFeedback(); updateTotal(); });
  els.cakeText.addEventListener("input", () => { hideFeedback(); updateCounter(); updateTotal(); });
  els.qtyMinus.addEventListener("click", () => setQty(getQty() - 1));
  els.qtyPlus.addEventListener("click", () => setQty(getQty() + 1));
  els.qtyInput.addEventListener("input", () => { hideFeedback(); updateTotal(); });
  els.qtyInput.addEventListener("change", () => setQty(getQty()));

  if (!productId) {
    showError("Vi fant ikke noe produkt å vise. Ta en titt i utvalget vårt i stedet.", false);
    return;
  }
  loadProduct();
}

async function loadShopInfo() {
  try {
    const res = await fetch("/api/shop");
    if (!res.ok) return;
    const data = await res.json();
    const b = data.bakery;
    if (!b || !b.name) return;
    shopName = b.name;
    els.bakeryName.textContent = b.name;
    els.footerName.textContent = b.name;
    els.footerAddress.textContent = b.address || "";
    if (b.phone) {
      els.footerPhone.textContent = b.phone;
      els.footerPhone.href = "tel:" + b.phone.replace(/\s+/g, "");
    }
    if (b.email) {
      els.footerEmail.textContent = b.email;
      els.footerEmail.href = "mailto:" + b.email;
    }
    document.title = product ? product.name + " - " + shopName : shopName;
  } catch {
    // keep the static fallback header
  }
}

async function loadProduct() {
  els.loading.hidden = false;
  els.error.hidden = true;
  els.product.hidden = true;
  try {
    const res = await fetch("/api/products/" + encodeURIComponent(productId));
    if (res.status === 404) {
      showError("Dette produktet finnes dessverre ikke i utvalget vårt lenger.", false);
      return;
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    product = data.product;
    renderProduct();
  } catch {
    showError("Vi fikk ikke kontakt med bakeriet akkurat nå. Prøv igjen om et lite øyeblikk.", true);
  }
}

function showError(message, canRetry) {
  els.loading.hidden = true;
  els.product.hidden = true;
  els.error.hidden = false;
  els.errorMessage.textContent = message;
  els.retryBtn.hidden = !canRetry;
}

function renderProduct() {
  document.title = product.name + " - " + shopName;
  els.name.textContent = product.name;
  els.desc.textContent = product.description || "";
  els.category.textContent = product.category || "";
  els.category.hidden = !product.category;
  els.leadNote.textContent = leadTimeText(product.leadTimeDays);

  if (product.imageUrl) {
    els.image.src = product.imageUrl;
    els.image.alt = product.name;
    els.media.hidden = false;
  } else {
    els.media.hidden = true;
  }

  renderOptionGroups();
  renderCakeText();
  setQty(1);
  updateCounter();
  updateTotal();

  els.loading.hidden = true;
  els.error.hidden = true;
  els.product.hidden = false;
}

function leadTimeText(days) {
  if (!days) return "Kan hentes i dag";
  if (days === 1) return "Bestilles 1 dag i forveien";
  return "Bestilles " + days + " dager i forveien";
}

function renderOptionGroups() {
  els.optionGroups.textContent = "";
  optionById.clear();
  (product.optionGroups || []).forEach((group, idx) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "opt-group";
    const legend = document.createElement("legend");
    legend.textContent = group.name;
    fieldset.appendChild(legend);

    const wrap = document.createElement("div");
    wrap.className = "opts";

    // Contract: an option's display price is basePriceCents + priceDeltaCents,
    // shown as an absolute amount. Groups where every delta is zero show no
    // price (choosing between them never changes the price).
    const showPrices = group.options.some((o) => o.priceDeltaCents !== 0);
    const hasDefault = group.options.some((o) => o.isDefault);

    group.options.forEach((opt, optIdx) => {
      optionById.set(opt.id, opt);
      const label = document.createElement("label");
      label.className = "opt";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "opt-group-" + idx;
      input.value = String(opt.id);
      input.checked = hasDefault ? !!opt.isDefault : optIdx === 0;

      const body = document.createElement("span");
      body.className = "opt-body";
      const value = document.createElement("span");
      value.className = "opt-value";
      value.textContent = opt.value;
      body.appendChild(value);

      if (showPrices) {
        const price = document.createElement("span");
        price.className = "opt-price price";
        price.textContent = formatKr(product.basePriceCents + opt.priceDeltaCents);
        body.appendChild(price);
      }

      label.appendChild(input);
      label.appendChild(body);
      wrap.appendChild(label);
    });

    fieldset.appendChild(wrap);
    els.optionGroups.appendChild(fieldset);
  });
}

function renderCakeText() {
  if (product.canHaveCakeText) {
    els.cakeTextBlock.hidden = false;
    els.cakeText.value = "";
    els.cakeTextPrice.textContent =
      product.cakeTextPriceCents > 0 ? "+ " + formatKr(product.cakeTextPriceCents) : "Inkludert";
  } else {
    els.cakeTextBlock.hidden = true;
    els.cakeText.value = "";
  }
}

function updateCounter() {
  els.charCounter.textContent = els.cakeText.value.length + "/" + CAKE_TEXT_MAX + " tegn";
}

function selectedOptionIds() {
  const ids = [];
  (product.optionGroups || []).forEach((group, idx) => {
    const checked = els.form.querySelector('input[name="opt-group-' + idx + '"]:checked');
    if (checked) ids.push(Number(checked.value));
  });
  return ids;
}

function unitPriceCents() {
  let cents = product.basePriceCents;
  for (const id of selectedOptionIds()) {
    const opt = optionById.get(id);
    if (opt) cents += opt.priceDeltaCents;
  }
  if (product.canHaveCakeText && els.cakeText.value.trim() !== "") {
    cents += product.cakeTextPriceCents;
  }
  return cents;
}

function getQty() {
  const n = parseInt(els.qtyInput.value, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_QTY, Math.max(1, n));
}

function setQty(n) {
  const qty = Math.min(MAX_QTY, Math.max(1, n));
  els.qtyInput.value = String(qty);
  els.qtyMinus.disabled = qty <= 1;
  els.qtyPlus.disabled = qty >= MAX_QTY;
  hideFeedback();
  updateTotal();
}

function updateTotal() {
  if (!product) return;
  const unit = unitPriceCents();
  const qty = getQty();
  els.totalPrice.textContent = formatKr(unit * qty);
  if (qty > 1) {
    els.unitNote.textContent = qty + " stk à " + formatKr(unit);
    els.unitNote.hidden = false;
  } else {
    els.unitNote.hidden = true;
  }
}

function sameConfig(a, b) {
  const idsA = (a.optionIds || []).slice().sort((x, y) => x - y).join(",");
  const idsB = (b.optionIds || []).slice().sort((x, y) => x - y).join(",");
  return a.productId === b.productId && idsA === idsB && (a.cakeText || "") === (b.cakeText || "");
}

function addToCart(event) {
  event.preventDefault();
  if (!product) return;

  const qty = getQty();
  const line = { productId: product.id, qty };
  const ids = selectedOptionIds().sort((a, b) => a - b);
  if (ids.length) line.optionIds = ids;
  const text = product.canHaveCakeText ? els.cakeText.value.trim().slice(0, CAKE_TEXT_MAX) : "";
  if (text) line.cakeText = text;

  const cart = loadCart();
  const existing = cart.lines.find((l) => sameConfig(l, line));
  let capped = false;
  if (existing) {
    const requested = existing.qty + qty;
    capped = requested > MAX_QTY;
    existing.qty = Math.min(MAX_QTY, requested);
  } else if (cart.lines.length >= MAX_CART_LINES) {
    showFeedback(
      "Handlekurven er full",
      "En bestilling kan ha maks " + MAX_CART_LINES + " varelinjer. Gå til handlekurven og rydd litt plass først.",
      true
    );
    return;
  } else {
    cart.lines.push(line);
  }
  saveCart(cart);
  updateCartBadge();
  if (capped) {
    showFeedback(
      "Antallet ble justert",
      "En varelinje kan ha maks " + MAX_QTY + " stk, så antallet i handlekurven er satt til " + MAX_QTY + ".",
      true
    );
  } else {
    showFeedback("Lagt i handlekurven!", "Vi gleder oss til å bake for deg.", false);
  }
}

function showFeedback(title, sub, isWarn) {
  els.feedbackTitle.textContent = title;
  els.feedbackSub.textContent = sub;
  els.feedback.classList.toggle("feedback-warn", !!isWarn);
  els.feedback.hidden = false;
  els.feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideFeedback() {
  els.feedback.hidden = true;
}

function updateCartBadge() {
  const count = cartCount(loadCart());
  els.cartBadge.textContent = String(count);
  els.cartBadge.hidden = count === 0;
  const label = count === 1 ? "Handlekurv, 1 vare" : "Handlekurv, " + count + " varer";
  els.cartLink.setAttribute("aria-label", count === 0 ? "Handlekurv" : label);
}
