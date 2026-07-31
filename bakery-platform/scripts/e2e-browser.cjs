// Browser e2e for all five variants. Requires playwright installed separately:
//   npm i -D playwright && npx playwright install chromium
// Run with the dev server up: node scripts/e2e-browser.js  (ONLY=b to limit variants)
// Original header: Browser e2e for all five variants: browse -> configure -> add to cart ->
// checkout with mock payment -> confirmation -> order visible in admin.
// Captures screenshots for the comparison doc along the way.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:4600";
const SHOTS = require("path").join(__dirname, "..", "docs", "shots");
const VARIANTS = (process.env.ONLY || "a,b,c,d,e").split(",");
const CUSTOMERS = {
  a: { name: "Kari Nordmann", phone: "41234567", email: "kari@example.com" },
  b: { name: "Ola Hansen", phone: "92345678", email: "ola@example.com" },
  c: { name: "Ingrid Berg", phone: "45678901", email: "ingrid@example.com" },
  d: { name: "Marte Solli", phone: "97654321", email: "marte@example.com" },
  e: { name: "Jonas Vik", phone: "48123456", email: "jonas@example.com" },
};

const log = (v, step, ok, extra = "") =>
  console.log(`[${v}] ${ok ? "OK " : "FAIL"} ${step}${extra ? " :: " + extra : ""}`);

async function shot(page, v, name) {
  const dir = path.join(SHOTS, v === "app" ? "app" : "variant-" + v);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.jpg`), type: "jpeg", quality: 75, fullPage: false });
}

async function runVariant(browser, v) {
  const folder = v === "app" ? "app" : "variant-" + v;
  const result = { variant: v, steps: {}, orderNumber: null };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror:${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console:${m.text().slice(0, 120)}`); });

  const step = async (name, fn) => {
    try { await fn(); result.steps[name] = "ok"; log(v, name, true); }
    catch (e) { result.steps[name] = e.message.slice(0, 200); log(v, name, false, e.message.slice(0, 120)); }
  };

  await step("storefront", async () => {
    await page.goto(`${BASE}/${folder}/index.html`);
    await page.waitForSelector('a[href*="product.html?id="]');
    await page.waitForTimeout(400);
    await shot(page, v, "storefront");
  });

  await step("product-configure", async () => {
    await page.goto(`${BASE}/${folder}/product.html?id=2`);
    const addBtn = page.getByRole("button", { name: /legg i (handle)?kurv/i }).first();
    await addBtn.waitFor();
    // pick the 12-biter size if clickable
    const size = page.getByText(/12 biter/, { exact: false }).first();
    if (await size.count()) await size.click({ trial: false }).catch(() => {});
    // cake text
    const cake = page.locator('input[maxlength="60"], textarea[maxlength="60"]').first();
    if (await cake.count()) await cake.fill("Gratulerer med dagen").catch(() => {});
    await page.waitForTimeout(300);
    await shot(page, v, "product");
    await addBtn.click();
    await page.waitForTimeout(500);
  });

  await step("cart", async () => {
    await page.goto(`${BASE}/${folder}/cart.html`);
    await page.waitForTimeout(800);
    const body = await page.textContent("body");
    if (!/Sjokoladekake/i.test(body)) throw new Error("cart does not show the added product");
    await shot(page, v, "cart");
  });

  await step("checkout-form", async () => {
    await page.goto(`${BASE}/${folder}/checkout.html`);
    await page.waitForSelector('input[type="date"]');
    const c = CUSTOMERS[v] || { name: "Nora Dahl", phone: "46123457", email: "nora@example.com" };
    const nameInput = page.locator('input[type="text"], input:not([type])').filter({ hasNot: page.locator('[type=date]') }).first();
    const named = page.locator('#name, input[name="name"], input[autocomplete="name"]');
    if (await named.count()) await named.first().fill(c.name); else await nameInput.fill(c.name);
    const tel = page.locator('input[type="tel"], #phone, input[name="phone"]');
    if (await tel.count()) await tel.first().fill(c.phone);
    const email = page.locator('input[type="email"], #email, input[name="email"]');
    if (await email.count()) await email.first().fill(c.email);
    const date = page.locator('input[type="date"]').first();
    const min = await date.getAttribute("min");
    if (min) await date.fill(min);
    const slot = page.locator("select").first();
    if (await slot.count()) {
      const opts = await slot.locator("option").allTextContents();
      const idx = opts.findIndex((t) => /\d{2}:\d{2}/.test(t));
      if (idx >= 0) await slot.selectOption({ index: idx });
    }
    await page.waitForTimeout(300);
    await shot(page, v, "checkout");
  });

  await step("pay-and-confirm", async () => {
    const pay = page.getByRole("button", { name: /betal/i }).first();
    await pay.click();
    await page.waitForURL(/order=\d+/, { timeout: 12000 });
    await page.waitForTimeout(800);
    const body = await page.textContent("body");
    const m = body.match(/B-\d+/);
    result.orderNumber = m ? m[0] : null;
    if (!/[Dd]emo/.test(body)) throw new Error("no demo-payment marker on confirmation");
    if (!result.orderNumber) throw new Error("no order number visible");
    await shot(page, v, "confirmation");
  });

  await ctx.close();

  // Admin on desktop viewport
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const dpage = await dctx.newPage();
  dpage.setDefaultTimeout(8000);
  await step("admin-shows-order", async () => {
    await dpage.goto(`${BASE}/${folder}/admin.html`);
    await dpage.waitForTimeout(1200);
    const body = await dpage.textContent("body");
    if (result.orderNumber && !body.includes(result.orderNumber)) {
      throw new Error(`order ${result.orderNumber} not visible in admin`);
    }
    await shot(dpage, v, "admin");
  });
  await dctx.close();

  result.jsErrors = errors.slice(0, 8);
  return result;
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const v of VARIANTS) results.push(await runVariant(browser, v));
  await browser.close();
  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    const fails = Object.entries(r.steps).filter(([, s]) => s !== "ok");
    console.log(`variant-${r.variant}: order=${r.orderNumber || "NONE"} fails=${fails.length}${fails.length ? " -> " + fails.map(([k]) => k).join(",") : ""}${r.jsErrors.length ? " jsErrors=" + r.jsErrors.length : ""}`);
    for (const [k, s] of fails) console.log(`   ${k}: ${s}`);
    for (const e of r.jsErrors) console.log(`   js: ${e}`);
  }
  fs.writeFileSync(path.join(__dirname, "e2e-results.json"), JSON.stringify(results, null, 2));
})();
