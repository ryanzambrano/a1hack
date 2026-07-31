// Product detail / configuration page - variant B "Stram".
// Reads ?id=, fetches the product, renders option groups, cake text,
// quantity and a live total, and adds the configuration to the cart.

// ---- shared helpers (copied from docs/contract.md) ----

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

// ---- limits mirrored from the contract ----

const QTY_MIN = 1;
const QTY_MAX = 50;
const MAX_CART_LINES = 30;
const CAKE_TEXT_MAX = 60;

// ---- tiny DOM helper (attributes + children, text via textContent) ----

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child !== null && child !== undefined) node.append(child);
  }
  return node;
}

// ---- page state ----

const SHOP_NAME = "Bakeriet på Hjørnet";

const main = document.getElementById("main");
const cartBadgeEl = document.getElementById("cart-badge");

let product = null;
const selected = new Map(); // group index -> selected option object
let qtyInput = null;
let cakeInput = null;
let cakeCounterEl = null;
let totalEl = null;
let feedbackEl = null;

// ---- header ----

function updateCartBadge() {
  const count = cartCount(loadCart());
  cartBadgeEl.textContent = String(count);
  cartBadgeEl.classList.toggle("has-items", count > 0);
}

// ---- views ----

function renderLoading() {
  main.replaceChildren(el("p", { class: "page-status", text: "Laster produktet ..." }));
}

function renderNotFound() {
  document.title = "Fant ikke produktet - " + SHOP_NAME;
  main.replaceChildren(
    el("section", { class: "error-box" }, [
      el("h1", { text: "Fant ikke produktet" }),
      el("p", { class: "muted", text: "Produktet finnes ikke eller er ikke tilgjengelig lenger." }),
      el("a", { class: "btn", href: "./index.html", text: "Tilbake til butikken" }),
    ])
  );
}

function renderNetworkError() {
  main.replaceChildren(
    el("section", { class: "error-box" }, [
      el("h1", { text: "Noe gikk galt" }),
      el("p", { class: "muted", text: "Kunne ikke laste produktet. Sjekk tilkoblingen og prøv igjen." }),
      el("div", { class: "error-actions" }, [
        el("button", { class: "btn", type: "button", text: "Prøv igjen", onclick: init }),
        el("a", { href: "./index.html", text: "Tilbake til butikken" }),
      ]),
    ])
  );
}

function leadTimeText(days) {
  if (days <= 0) return "Kan hentes samme dag.";
  if (days === 1) return "Bestilles senest 1 dag før henting.";
  return "Bestilles senest " + days + " dager før henting.";
}

// Per the contract, an option's display price is basePriceCents + priceDeltaCents
// shown as an absolute. Any group whose deltas differ shows absolute prices;
// groups where every option costs the same show no per-option price.
function groupShowsAbsolutePrices(group) {
  const deltas = group.options.map((o) => o.priceDeltaCents);
  return deltas.some((d) => d !== deltas[0]);
}

function buildOptionGroup(group, groupIndex) {
  const absolute = groupShowsAbsolutePrices(group);
  const fieldset = el("fieldset", { class: "opt-group" }, [
    el("legend", { class: "label", text: group.name }),
  ]);
  const list = el("div", { class: "opt-list" });

  let defaultOpt = group.options.find((o) => o.isDefault) || group.options[0];
  selected.set(groupIndex, defaultOpt);

  for (const opt of group.options) {
    const input = el("input", {
      type: "radio",
      name: "group-" + groupIndex,
      value: String(opt.id),
      class: "opt-input",
      onchange: () => {
        selected.set(groupIndex, opt);
        updateTotal();
      },
    });
    if (opt === defaultOpt) input.checked = true;

    let priceText = "";
    let priceClass = "opt-price";
    if (absolute) {
      priceText = formatKr(product.basePriceCents + opt.priceDeltaCents);
      priceClass += " opt-price-abs";
    } else if (opt.priceDeltaCents !== 0) {
      priceText = "+ " + formatKr(opt.priceDeltaCents);
      priceClass += " muted";
    }

    list.append(
      el("label", { class: "opt" }, [
        input,
        el("span", { class: "opt-mark", "aria-hidden": "true" }),
        el("span", { class: "opt-value", text: opt.value }),
        priceText ? el("span", { class: priceClass, text: priceText }) : null,
      ])
    );
  }

  fieldset.append(list);
  return fieldset;
}

function buildCakeTextField() {
  const priceNote = product.cakeTextPriceCents > 0
    ? "+ " + formatKr(product.cakeTextPriceCents)
    : "Inkludert";

  cakeCounterEl = el("p", { class: "char-count muted", id: "cake-count", text: "0/" + CAKE_TEXT_MAX });
  cakeInput = el("input", {
    type: "text",
    id: "cake-text",
    maxlength: String(CAKE_TEXT_MAX),
    autocomplete: "off",
    "aria-describedby": "cake-count",
    oninput: () => {
      cakeCounterEl.textContent = cakeInput.value.length + "/" + CAKE_TEXT_MAX;
      updateTotal();
    },
  });

  return el("div", { class: "cake-text-block" }, [
    el("div", { class: "cake-text-head" }, [
      el("label", { class: "label cake-text-label", for: "cake-text", text: "Tekst på kaken" }),
      el("span", { class: "cake-text-price muted", text: priceNote }),
    ]),
    cakeInput,
    cakeCounterEl,
  ]);
}

function clampQty(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return QTY_MIN;
  return Math.min(QTY_MAX, Math.max(QTY_MIN, n));
}

function currentQty() {
  return clampQty(qtyInput.value);
}

function buildQtyStepper() {
  qtyInput = el("input", {
    type: "number",
    id: "qty",
    class: "qty-input",
    min: String(QTY_MIN),
    max: String(QTY_MAX),
    step: "1",
    value: "1",
    inputmode: "numeric",
    oninput: updateTotal,
    onchange: () => {
      qtyInput.value = String(currentQty());
      updateTotal();
    },
  });

  const step = (delta) => {
    qtyInput.value = String(clampQty(currentQty() + delta));
    updateTotal();
  };

  return el("div", { class: "qty-block" }, [
    el("label", { class: "label", for: "qty", text: "Antall" }),
    el("div", { class: "qty-stepper" }, [
      el("button", { class: "qty-btn", type: "button", "aria-label": "Reduser antall", onclick: () => step(-1), text: "−" }),
      qtyInput,
      el("button", { class: "qty-btn", type: "button", "aria-label": "Øk antall", onclick: () => step(1), text: "+" }),
    ]),
  ]);
}

function unitPriceCents() {
  let sum = product.basePriceCents;
  for (const opt of selected.values()) sum += opt.priceDeltaCents;
  if (product.canHaveCakeText && cakeInput && cakeInput.value.trim().length > 0) {
    sum += product.cakeTextPriceCents;
  }
  return sum;
}

function updateTotal() {
  if (totalEl) totalEl.textContent = formatKr(unitPriceCents() * currentQty());
}

// ---- add to cart (merge rule from the contract) ----

function lineKey(productId, optionIds, cakeText) {
  const ids = (optionIds || []).slice().sort((a, b) => a - b).join(",");
  return productId + "|" + ids + "|" + (cakeText || "");
}

function showFeedback(nodes, isError) {
  feedbackEl.className = "feedback " + (isError ? "feedback-error" : "feedback-ok");
  feedbackEl.replaceChildren(...nodes);
}

function addToCart() {
  const qty = currentQty();
  qtyInput.value = String(qty);
  const optionIds = [...selected.values()].map((o) => o.id).sort((a, b) => a - b);
  const cakeText = product.canHaveCakeText && cakeInput ? cakeInput.value.trim() : "";

  const cart = loadCart();
  const key = lineKey(product.id, optionIds, cakeText);
  const existing = cart.lines.find((l) => lineKey(l.productId, l.optionIds, l.cakeText) === key);

  let capped = false;
  if (existing) {
    const next = existing.qty + qty;
    existing.qty = Math.min(QTY_MAX, next);
    capped = next > QTY_MAX;
  } else {
    if (cart.lines.length >= MAX_CART_LINES) {
      showFeedback([
        el("p", { class: "feedback-msg", text: "Kurven kan ha maks " + MAX_CART_LINES + " linjer. Fjern noe i kurven før du legger til mer." }),
        el("a", { href: "./cart.html", text: "Til kurven" }),
      ], true);
      return;
    }
    const line = { productId: product.id, qty, optionIds };
    if (cakeText) line.cakeText = cakeText;
    cart.lines.push(line);
  }

  saveCart(cart);
  updateCartBadge();

  const msg = capped
    ? "Lagt i kurven. Maks " + QTY_MAX + " stk per vare, antallet ble justert."
    : "Lagt i kurven.";
  showFeedback([
    el("p", { class: "feedback-msg", text: msg }),
    el("div", { class: "feedback-actions" }, [
      el("a", { class: "btn", href: "./cart.html", text: "Til kurven" }),
      el("a", { href: "./index.html", text: "Fortsett å handle" }),
    ]),
  ], false);
}

// ---- product view ----

function renderProduct() {
  document.title = product.name + " - " + SHOP_NAME;
  selected.clear();

  const media = el("div", { class: "product-media" }, [
    el("img", { src: product.imageUrl, alt: product.name }),
  ]);

  const info = el("div", { class: "product-info" }, [
    el("span", { class: "label", text: product.category }),
    el("h1", { text: product.name }),
    el("p", { class: "product-desc", text: product.description }),
    el("p", { class: "lead-time muted", text: leadTimeText(product.leadTimeDays) }),
  ]);

  const config = el("div", { class: "product-config" });
  (product.optionGroups || []).forEach((group, i) => {
    if (group.options && group.options.length > 0) config.append(buildOptionGroup(group, i));
  });
  if (product.canHaveCakeText) config.append(buildCakeTextField());
  config.append(buildQtyStepper());

  totalEl = el("span", { class: "total-price price", text: "" });
  feedbackEl = el("div", { class: "feedback", role: "status", "aria-live": "polite" });

  config.append(
    el("div", { class: "total-block" }, [
      el("span", { class: "label", text: "Totalt" }),
      el("div", { class: "total-line" }, [
        totalEl,
        el("span", { class: "muted vat-note", text: "inkl. mva" }),
      ]),
    ]),
    el("button", { class: "btn btn-primary add-btn", type: "button", text: "Legg i kurv", onclick: addToCart }),
    feedbackEl
  );

  info.append(config);

  main.replaceChildren(
    el("p", { class: "back-link" }, [el("a", { href: "./index.html", text: "Tilbake til butikken" })]),
    el("div", { class: "product-grid" }, [media, info])
  );

  updateTotal();
}

// ---- init ----

async function init() {
  renderLoading();

  const id = new URLSearchParams(location.search).get("id");
  if (!id || !/^\d+$/.test(id.trim())) {
    renderNotFound();
    return;
  }

  let res;
  try {
    res = await fetch("/api/products/" + encodeURIComponent(id.trim()));
  } catch {
    renderNetworkError();
    return;
  }

  if (res.status === 404) {
    renderNotFound();
    return;
  }
  if (!res.ok) {
    renderNetworkError();
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    renderNetworkError();
    return;
  }

  if (!data.product || data.product.active === false) {
    renderNotFound();
    return;
  }

  product = data.product;
  renderProduct();
}

updateCartBadge();
window.addEventListener("storage", (e) => {
  if (e.key === CART_KEY) updateCartBadge();
});
init();
