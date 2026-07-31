// Product admin, styled on the bakery dashboard's design system.
// Orders now live in the dashboard (/app/bakery); this surface only manages
// the catalog: list, create/edit, and activate/deactivate products. It talks
// to /api/admin/products (unauthenticated in the MVP).

export function formatKr(cents) {
  const kr = cents / 100;
  return "kr " + (Number.isInteger(kr) ? kr : kr.toFixed(2).replace(".", ","));
}

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
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, data };
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

// ---------- products view ----------

let products = [];
const productErrors = new Map();

async function loadProducts() {
  const statusEl = $("#products-status");
  $("#error-card").hidden = true;
  statusEl.replaceChildren(el("p", { class: "pa-loading", text: "Laster produkter ..." }));
  $("#products-list").replaceChildren();
  try {
    const res = await api("/api/admin/products");
    if (!res.ok || !res.data || !Array.isArray(res.data.products)) throw new Error("bad response");
    products = res.data.products;
    statusEl.replaceChildren();
    renderProducts();
  } catch {
    statusEl.replaceChildren();
    $("#error-msg").textContent = "Sjekk tilkoblingen og prøv igjen.";
    $("#error-card").hidden = false;
  }
}

function renderProducts() {
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
  $("#category-list").replaceChildren(...categories.map((c) => el("option", { value: c })));

  const listEl = $("#products-list");
  if (!products.length) {
    listEl.replaceChildren(el("p", { class: "pa-empty", text: "Ingen produkter ennå. Legg til det første." }));
    return;
  }
  const thead = el("thead", {}, el("tr", {}, [
    el("th", { scope: "col", text: "Produkt" }),
    el("th", { scope: "col", text: "Kategori" }),
    el("th", { scope: "col", class: "num", text: "Pris fra" }),
    el("th", { scope: "col", text: "Ledetid" }),
    el("th", { scope: "col", text: "Status" }),
    el("th", { scope: "col", class: "pa-col-act" }, [el("span", { class: "sr-only", text: "Handlinger" })]),
  ]));
  const tbody = el("tbody");
  for (const product of products) tbody.append(...productRows(product));
  listEl.replaceChildren(el("table", { class: "pa-table" }, [thead, tbody]));
}

function leadLabel(days) {
  if (days === 0) return "Samme dag";
  return days === 1 ? "1 dag" : `${days} dager`;
}

function productRows(product) {
  const row = el("tr", { class: "pa-row" + (product.active ? "" : " is-inactive") }, [
    el("td", {}, [
      el("span", { class: "pa-ident" }, [
        product.imageUrl
          ? el("img", { class: "pa-thumb", src: product.imageUrl, alt: product.name })
          : el("span", { class: "pa-thumb pa-thumb--empty", "aria-hidden": "true" }),
        el("span", { class: "pa-name", text: product.name }),
      ]),
    ]),
    el("td", { class: "pa-muted", text: product.category || "Uten kategori" }),
    el("td", { class: "num pa-price", text: `fra ${formatKr(product.basePriceCents)}` }),
    el("td", { class: "pa-muted", text: leadLabel(product.leadTimeDays) }),
    el("td", {}, [
      product.active
        ? el("span", { class: "chip chip--good", text: "Aktiv" })
        : el("span", { class: "chip chip--neutral", text: "Inaktiv" }),
    ]),
    el("td", { class: "pa-col-act" }, [
      el("span", { class: "pa-actions" }, [
        el("button", { class: "bk-btn bk-btn--ghost bk-btn--sm", type: "button", onclick: () => openForm(product), text: "Rediger" }),
        el("button", {
          class: "bk-btn bk-btn--ghost bk-btn--sm",
          type: "button",
          onclick: () => toggleActive(product),
          text: product.active ? "Deaktiver" : "Aktiver",
        }),
      ]),
    ]),
  ]);
  const rows = [row];
  if (productErrors.has(product.id)) {
    rows.push(el("tr", { class: "pa-row-err" }, [
      el("td", { colspan: "6" }, [el("div", { class: "pa-error", role: "alert", text: productErrors.get(product.id) })]),
    ]));
  }
  return rows;
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
let editingId = null;

function syncRadioNames() {
  const rows = [...optionRowsEl.querySelectorAll(".opt-row")];
  rows.forEach((row, i) => {
    const group = row.querySelector(".opt-group").value.trim().toLowerCase();
    row.querySelector(".opt-radio").name = group ? `optdef-${group}` : `optdef-row-${i}`;
  });
}

function addOptionRow(data = {}) {
  const groupInput = el("input", {
    class: "bk-in opt-text opt-group", type: "text", autocomplete: "off",
    placeholder: "Gruppe, f.eks. Størrelse", "aria-label": "Gruppenavn",
    value: data.groupName || "", oninput: syncRadioNames,
  });
  const valueInput = el("input", {
    class: "bk-in opt-text opt-value", type: "text", autocomplete: "off",
    placeholder: "Valg, f.eks. 12 biter", "aria-label": "Valgnavn",
    value: data.valueName || "",
  });
  const priceInput = el("input", {
    class: "bk-in bk-in--num opt-price", type: "text", inputmode: "decimal", autocomplete: "off",
    placeholder: "Tillegg kr", "aria-label": "Pristillegg i kroner",
    value: data.priceDeltaCents ? krString(data.priceDeltaCents) : "",
  });
  const radio = el("input", { class: "opt-radio", type: "radio", "aria-label": "Standardvalg i gruppen" });
  radio.checked = !!data.isDefault;
  const row = el("div", { class: "opt-row" }, [
    groupInput,
    valueInput,
    priceInput,
    el("label", { class: "opt-default" }, [radio, el("span", { text: "Standard" })]),
    el("button", {
      class: "bk-btn bk-btn--ghost bk-btn--sm", type: "button", text: "Fjern",
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
        addOptionRow({ groupName: group.name, valueName: opt.value, priceDeltaCents: opt.priceDeltaCents, isDefault: opt.isDefault });
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
  if (basePriceCents === null || basePriceCents <= 0) return { error: "Skriv inn en gyldig grunnpris i kroner." };

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
    if (!groupName || !valueName) return { error: `Rad ${i + 1} under valggrupper mangler gruppenavn eller valgnavn.` };
    const deltaRaw = rows[i].querySelector(".opt-price").value.trim();
    const priceDeltaCents = deltaRaw === "" ? 0 : parseKrToCents(deltaRaw);
    if (priceDeltaCents === null) return { error: `Ugyldig pristillegg i rad ${i + 1} under valggrupper.` };
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

// ---------- init ----------

$("#refresh-products").addEventListener("click", loadProducts);
$("#new-product").addEventListener("click", () => openForm(null));
$("#add-option-row").addEventListener("click", () => addOptionRow());
$("#cancel-form").addEventListener("click", closeForm);
$("#product-form").addEventListener("submit", submitForm);
$("#retry-btn").addEventListener("click", loadProducts);
$("#f-caketext").addEventListener("change", () => {
  $("#f-caketext-price").disabled = !$("#f-caketext").checked;
});

loadProducts();
