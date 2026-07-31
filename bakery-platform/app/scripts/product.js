// Product detail / configuration page for the canonical app ("Daymaker System").
// Reads ?id= from the URL, fetches the product, renders option groups,
// cake text, quantity and a live total, and adds lines to the shared cart.
// Logic and API/cart behavior follow docs/contract.md.

// --- Shared helpers (from docs/contract.md) ---

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

// --- Page constants and state ---

const MAX_QTY = 50;
const MAX_CART_LINES = 30;

const root = document.getElementById("page-root");
let bakeryName = "Bakeriet på Hjørnet";

// --- Small DOM helper (all user text goes through textContent) ---

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// --- Header and footer ---

function updateCartBadge() {
  const count = cartCount(loadCart());
  const badge = document.getElementById("cart-badge");
  const link = document.getElementById("cart-link");
  if (badge) {
    badge.textContent = String(count);
    badge.classList.toggle("badge-accent", count > 0);
    badge.hidden = count === 0;
  }
  if (link) {
    if (count === 0) {
      link.setAttribute("aria-label", "Kurv, tom");
    } else if (count === 1) {
      link.setAttribute("aria-label", "Kurv, 1 vare");
    } else {
      link.setAttribute("aria-label", "Kurv, " + count + " varer");
    }
  }
}

// Footer contact line from /api/shop (shared pattern; the mva line is static).
function fillFooter(bakery) {
  const target = document.getElementById("footer-contact");
  if (!target || !bakery) return;
  target.textContent = bakery.address + " · " + bakery.phone + " · " + bakery.email;
}

async function loadShopHeader() {
  try {
    const res = await fetch("/api/shop");
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.bakery) {
      if (data.bakery.name) {
        bakeryName = data.bakery.name;
        const brand = document.getElementById("brand-link");
        if (brand) brand.textContent = bakeryName;
      }
      fillFooter(data.bakery);
    }
  } catch {
    // The footer contact stays empty; the mva line is static markup.
  }
}

// --- Copy helpers ---

function leadTimeNote(days) {
  if (!days || days <= 0) return "Kan hentes samme dag";
  if (days === 1) return "Bestilles minst 1 dag før henting";
  return "Bestilles minst " + days + " dager før henting";
}

// --- Error and empty states ---

function stateCard(title, message) {
  root.textContent = "";
  const card = el("section", "card state-card");
  card.append(el("h1", "", title));
  card.append(el("p", "muted", message));
  const actions = el("div", "state-actions");
  card.append(actions);
  root.append(card);
  return actions;
}

function showNotFound() {
  document.title = "Fant ikke produktet - " + bakeryName;
  const actions = stateCard(
    "Fant ikke produktet",
    "Produktet finnes ikke eller er ikke lenger tilgjengelig."
  );
  const back = el("a", "btn", "Tilbake til butikken");
  back.href = "./index.html";
  actions.append(back);
}

function showNetworkError() {
  const actions = stateCard(
    "Noe gikk galt",
    "Vi klarte ikke å laste produktet. Prøv igjen om et øyeblikk."
  );
  const retry = el("button", "btn", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", init);
  const back = el("a", "btn btn-ghost", "Tilbake til butikken");
  back.href = "./index.html";
  actions.append(retry, back);
}

// --- Cart merge rule (contract): same productId + same optionIds set
// + same cakeText increments qty on the existing line. ---

function sameIdSet(a, b) {
  const as = [...a].sort((x, y) => x - y);
  const bs = [...b].sort((x, y) => x - y);
  return as.length === bs.length && as.every((v, i) => v === bs[i]);
}

function addToCart(product, optionIds, cakeText, qty) {
  const cart = loadCart();
  const existing = cart.lines.find((l) =>
    l.productId === product.id &&
    sameIdSet(l.optionIds || [], optionIds) &&
    (l.cakeText || "") === cakeText
  );
  let clamped = false;
  if (existing) {
    const merged = existing.qty + qty;
    clamped = merged > MAX_QTY;
    existing.qty = Math.min(MAX_QTY, merged);
  } else {
    if (cart.lines.length >= MAX_CART_LINES) return { ok: false, full: true };
    const line = { productId: product.id, qty };
    if (optionIds.length) line.optionIds = optionIds;
    if (cakeText) line.cakeText = cakeText;
    cart.lines.push(line);
  }
  saveCart(cart);
  updateCartBadge();
  return { ok: true, clamped };
}

// --- Product rendering ---

function renderProduct(product) {
  document.title = product.name + " - " + bakeryName;
  root.textContent = "";

  const layout = el("div", "product-layout");

  // Image column
  const media = el("div", "card product-media");
  const img = el("img", "product-img");
  img.src = product.imageUrl;
  img.alt = product.name;
  media.append(img);
  layout.append(media);

  // Configuration column
  const config = el("section", "card product-config");
  config.setAttribute("aria-label", product.name);

  config.append(el("h1", "", product.name));
  const metaRow = el("div", "meta-row");
  if (product.category) metaRow.append(el("span", "badge", product.category));
  metaRow.append(el("span", "muted lead-note", leadTimeNote(product.leadTimeDays)));
  config.append(metaRow);
  if (product.description) {
    config.append(el("p", "product-desc", product.description));
  }

  // Option groups: single-select radio rows, defaults preselected.
  const groups = product.optionGroups || [];
  const selected = new Map(); // group name -> option id
  const deltaById = new Map();
  groups.forEach((g) => g.options.forEach((o) => deltaById.set(o.id, o.priceDeltaCents)));

  groups.forEach((group, groupIndex) => {
    const fs = document.createElement("fieldset");
    fs.className = "option-group";
    const legend = el("legend", "label option-legend", group.name);
    fs.append(legend);
    const list = el("div", "option-list");

    // Any group with a price effect shows absolute prices (base + delta),
    // the Norwegian shop convention; all-zero groups show no price label.
    const hasPriceEffect = group.options.some((o) => o.priceDeltaCents !== 0);
    const hasExplicitDefault = group.options.some((o) => o.isDefault);
    const rows = [];

    group.options.forEach((opt, i) => {
      const label = el("label", "option-row");
      const input = document.createElement("input");
      input.type = "radio";
      input.className = "option-radio";
      input.name = "group-" + groupIndex;
      input.value = String(opt.id);
      const isDefault = hasExplicitDefault ? opt.isDefault : i === 0;
      if (isDefault) {
        input.checked = true;
        label.classList.add("selected");
        selected.set(group.name, opt.id);
      }
      input.addEventListener("change", () => {
        selected.set(group.name, opt.id);
        rows.forEach((r) => r.classList.remove("selected"));
        label.classList.add("selected");
        updateTotals();
      });

      const text = el("span", "option-text", opt.value);
      const price = el("span", "price option-price");
      if (hasPriceEffect) {
        price.textContent = formatKr(product.basePriceCents + opt.priceDeltaCents);
      }

      label.append(input, text, price);
      rows.push(label);
      list.append(label);
    });

    fs.append(list);
    config.append(fs);
  });

  // Cake text (only when the product allows it)
  let cakeInput = null;
  if (product.canHaveCakeText) {
    const block = el("div", "cake-text-block");
    const labelRow = el("div", "label-row");
    const lbl = el("label", "label", "Tekst på kaken");
    lbl.htmlFor = "cake-text";
    const priceNote = el(
      "span",
      "muted cake-text-price",
      product.cakeTextPriceCents > 0 ? "+ " + formatKr(product.cakeTextPriceCents) : "Inkludert"
    );
    labelRow.append(lbl, priceNote);

    cakeInput = document.createElement("input");
    cakeInput.type = "text";
    cakeInput.id = "cake-text";
    cakeInput.maxLength = 60;
    cakeInput.placeholder = "For eksempel: Gratulerer med dagen";
    cakeInput.setAttribute("aria-describedby", "cake-text-counter");

    const counter = el("p", "muted char-counter", "0 av 60 tegn");
    counter.id = "cake-text-counter";

    cakeInput.addEventListener("input", () => {
      counter.textContent = cakeInput.value.length + " av 60 tegn";
      updateTotals();
    });

    block.append(labelRow, cakeInput, counter);
    config.append(block);
  }

  // Quantity stepper (1-50)
  const qtyBlock = el("div", "qty-block");
  const qtyLabel = el("label", "label", "Antall");
  qtyLabel.htmlFor = "qty";
  const stepper = el("div", "stepper");

  const minusBtn = el("button", "step-btn", "−");
  minusBtn.type = "button";
  minusBtn.setAttribute("aria-label", "Reduser antall");

  const qtyInput = document.createElement("input");
  qtyInput.type = "number";
  qtyInput.id = "qty";
  qtyInput.className = "qty-input";
  qtyInput.min = "1";
  qtyInput.max = String(MAX_QTY);
  qtyInput.step = "1";
  qtyInput.value = "1";
  qtyInput.inputMode = "numeric";

  const plusBtn = el("button", "step-btn", "+");
  plusBtn.type = "button";
  plusBtn.setAttribute("aria-label", "Øk antall");

  function readQty() {
    const v = parseInt(qtyInput.value, 10);
    if (!Number.isFinite(v)) return 1;
    return Math.min(MAX_QTY, Math.max(1, v));
  }

  minusBtn.addEventListener("click", () => {
    qtyInput.value = String(Math.max(1, readQty() - 1));
    updateTotals();
  });
  plusBtn.addEventListener("click", () => {
    qtyInput.value = String(Math.min(MAX_QTY, readQty() + 1));
    updateTotals();
  });
  qtyInput.addEventListener("input", updateTotals);
  qtyInput.addEventListener("change", () => {
    qtyInput.value = String(readQty());
    updateTotals();
  });

  stepper.append(minusBtn, qtyInput, plusBtn);
  qtyBlock.append(qtyLabel, stepper);
  config.append(qtyBlock);

  // Live totals
  const totals = el("div", "totals");
  totals.setAttribute("aria-live", "polite");
  const unitRow = el("div", "total-row");
  const unitValue = el("span", "price");
  unitRow.append(el("span", "muted", "Pris per stk"), unitValue);
  const totalRow = el("div", "total-row total-final");
  const totalValue = el("span", "price price-lg");
  totalRow.append(el("span", "total-label", "Totalt"), totalValue);
  totals.append(unitRow, totalRow, el("p", "muted vat-note", "inkl. mva"));
  config.append(totals);

  function unitPriceCents() {
    let unit = product.basePriceCents;
    for (const id of selected.values()) unit += deltaById.get(id) || 0;
    const text = cakeInput ? cakeInput.value.trim() : "";
    if (product.canHaveCakeText && text) unit += product.cakeTextPriceCents;
    return unit;
  }

  function updateTotals() {
    const qty = readQty();
    unitValue.textContent = formatKr(unitPriceCents());
    totalValue.textContent = formatKr(unitPriceCents() * qty);
    minusBtn.disabled = qty <= 1;
    plusBtn.disabled = qty >= MAX_QTY;
  }

  // Add to cart + feedback. This button is the page's single .btn-primary.
  const addBtn = el("button", "btn btn-primary add-btn", "Legg i kurven");
  addBtn.type = "button";
  const feedback = el("div", "feedback");
  feedback.setAttribute("role", "status");

  addBtn.addEventListener("click", () => {
    const qty = readQty();
    qtyInput.value = String(qty);
    const optionIds = [...selected.values()].sort((a, b) => a - b);
    const cakeText = product.canHaveCakeText && cakeInput ? cakeInput.value.trim() : "";
    const result = addToCart(product, optionIds, cakeText, qty);

    feedback.textContent = "";
    if (!result.ok) {
      const panel = el("div", "feedback-panel feedback-warn");
      panel.append(el("p", "feedback-text",
        "Kurven er full. En bestilling kan ha maks " + MAX_CART_LINES + " ulike varer."));
      feedback.append(panel);
      return;
    }

    const panel = el("div", "feedback-panel feedback-ok");
    panel.append(el("h2", "label feedback-title", "Lagt i kurven"));
    let desc;
    if (result.clamped) {
      desc = "Maks " + MAX_QTY + " stk per vare, antallet i kurven ble justert til " + MAX_QTY + ".";
    } else if (qty === 1) {
      desc = product.name + " er lagt i kurven.";
    } else {
      desc = qty + " stk " + product.name + " er lagt i kurven.";
    }
    panel.append(el("p", "feedback-text", desc));
    const actions = el("div", "feedback-actions");
    const toCart = el("a", "btn", "Gå til kurven");
    toCart.href = "./cart.html";
    const keepShopping = el("a", "btn btn-ghost", "Fortsett å handle");
    keepShopping.href = "./index.html";
    actions.append(toCart, keepShopping);
    panel.append(actions);
    feedback.append(panel);
  });

  config.append(addBtn, feedback);
  layout.append(config);
  root.append(layout);
  updateTotals();
}

// --- Init ---

async function init() {
  updateCartBadge();
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id || !/^\d+$/.test(id.trim())) {
    showNotFound();
    return;
  }

  root.textContent = "";
  root.append(el("p", "muted loading", "Laster produktet..."));

  let res;
  try {
    res = await fetch("/api/products/" + encodeURIComponent(id.trim()));
  } catch {
    showNetworkError();
    return;
  }
  if (res.status === 404) {
    showNotFound();
    return;
  }
  if (!res.ok) {
    showNetworkError();
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    showNetworkError();
    return;
  }
  if (!data || !data.product) {
    showNotFound();
    return;
  }
  if (data.product.active === false) {
    showNotFound();
    return;
  }
  renderProduct(data.product);
}

window.addEventListener("storage", updateCartBadge);
loadShopHeader();
init();
