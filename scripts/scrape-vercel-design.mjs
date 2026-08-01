#!/usr/bin/env node
/**
 * Scrapes the live Vercel / Geist design system into a machine-readable spec.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node scripts/scrape-vercel-design.mjs
 *
 * Outputs:
 *   docs/design/vercel-tokens.json   every --ds-* / --geist-* custom property, resolved, light + dark
 *   docs/design/vercel-components.json  computed styles of real buttons, inputs, cards, tables
 *   docs/design/shots/*.png          full-page screenshots for visual reference
 *
 * Only public marketing + Geist documentation pages are visited. No auth, no dashboard.
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("docs/design");
const SHOTS = path.join(OUT, "shots");

/** Pages worth reading: the Geist docs render every variant of every primitive. */
const PAGES = [
  { slug: "home", url: "https://vercel.com" },
  { slug: "geist-button", url: "https://vercel.com/geist/button" },
  { slug: "geist-input", url: "https://vercel.com/geist/input" },
  { slug: "geist-colors", url: "https://vercel.com/geist/colors" },
  { slug: "geist-badge", url: "https://vercel.com/geist/badge" },
  { slug: "geist-table", url: "https://vercel.com/geist/table" },
  { slug: "geist-tabs", url: "https://vercel.com/geist/tabs" },
  { slug: "geist-note", url: "https://vercel.com/geist/note" },
];

/* ------------------------------------------------------------------ */
/* In-page collectors (serialized into the browser, so keep them self-contained) */
/* ------------------------------------------------------------------ */

/** Walks every stylesheet, harvests custom property *names*, then resolves each
 *  against :root so we get the value actually in effect for the current theme. */
function collectTokens() {
  const names = new Set();
  const visit = (rules) => {
    for (const rule of rules) {
      if (rule.style) for (const prop of rule.style) if (prop.startsWith("--")) names.add(prop);
      if (rule.cssRules) visit(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visit(sheet.cssRules);
    } catch {
      /* cross-origin sheet, skip */
    }
  }
  const root = getComputedStyle(document.documentElement);
  const tokens = {};
  for (const name of [...names].sort()) {
    const value = root.getPropertyValue(name).trim();
    if (value) tokens[name] = value;
  }
  return tokens;
}

/** One computed-style fingerprint per *visually distinct* element of a kind.
 *  Dedupes on the properties we care about so 40 demo buttons collapse to ~8 variants. */
function collectComponents() {
  const read = (el) => {
    const s = getComputedStyle(el);
    return {
      label: (el.innerText || el.getAttribute("placeholder") || "").trim().slice(0, 28),
      tag: el.tagName.toLowerCase(),
      background: s.backgroundColor,
      color: s.color,
      boxShadow: s.boxShadow,
      border: `${s.borderWidth} ${s.borderStyle} ${s.borderColor}`,
      borderRadius: s.borderRadius,
      height: s.height,
      padding: s.padding,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      fontFamily: s.fontFamily,
      transition: s.transition,
    };
  };

  const kinds = {
    button: "button, a[class*='button'], [role='button']",
    input: "input:not([type='hidden']), textarea, select",
    card: "[class*='card']:not(:has([class*='card']))",
    badge: "[class*='badge'], [class*='chip'], [class*='pill']",
    table: "table, thead th, tbody td",
    heading: "h1, h2, h3, h4",
    code: "code, pre, [class*='mono']",
  };

  const out = {};
  for (const [kind, selector] of Object.entries(kinds)) {
    const seen = new Map();
    let nodes = [];
    try {
      nodes = [...document.querySelectorAll(selector)];
    } catch {
      continue;
    }
    for (const el of nodes) {
      if (!el.offsetHeight) continue;
      const style = read(el);
      // Fingerprint on appearance only — label/height vary between demo instances.
      const key = [
        style.tag,
        style.background,
        style.color,
        style.boxShadow,
        style.border,
        style.borderRadius,
        style.fontSize,
        style.fontWeight,
      ].join("|");
      if (!seen.has(key)) seen.set(key, style);
      if (seen.size > 40) break;
    }
    out[kind] = [...seen.values()];
  }

  // Body/root baseline — the canvas everything else sits on.
  out.root = read(document.body);
  return out;
}

/* ------------------------------------------------------------------ */

async function scrapePage(browser, { slug, url }, theme) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    // Geist docs hydrate their variant grids client-side; give them a beat.
    await page.waitForTimeout(2_000);
    // Kill the cookie banner so it doesn't sit on top of every screenshot.
    await page
      .getByRole("button", { name: /accept|reject|deny|decline/i })
      .first()
      .click({ timeout: 2_000 })
      .catch(() => {});

    const tokens = await page.evaluate(collectTokens);
    const components = await page.evaluate(collectComponents);

    await page.screenshot({
      path: path.join(SHOTS, `${slug}.${theme}.png`),
      fullPage: true,
    });

    return { slug, url, theme, tokens, components };
  } catch (error) {
    console.warn(`  ! ${slug} (${theme}) failed: ${error.message.split("\n")[0]}`);
    return { slug, url, theme, error: String(error.message).split("\n")[0] };
  } finally {
    await context.close();
  }
}

/** Merge per-page token maps into one, keeping the first non-empty value seen
 *  and recording where each token came from. */
function mergeTokens(results) {
  const merged = {};
  for (const result of results) {
    for (const [name, value] of Object.entries(result.tokens ?? {})) {
      if (!(name in merged)) merged[name] = { value, source: result.slug };
    }
  }
  return merged;
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  const byTheme = {};
  for (const theme of ["dark", "light"]) {
    console.log(`\n▲ scraping ${theme} theme`);
    const results = [];
    for (const target of PAGES) {
      console.log(`  · ${target.slug}`);
      results.push(await scrapePage(browser, target, theme));
    }
    byTheme[theme] = {
      tokens: mergeTokens(results),
      components: Object.fromEntries(
        results.filter((r) => r.components).map((r) => [r.slug, r.components]),
      ),
    };
  }

  await browser.close();

  await writeFile(
    path.join(OUT, "vercel-tokens.json"),
    JSON.stringify(
      { scrapedAt: new Date().toISOString(), dark: byTheme.dark.tokens, light: byTheme.light.tokens },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(OUT, "vercel-components.json"),
    JSON.stringify(
      { scrapedAt: new Date().toISOString(), dark: byTheme.dark.components, light: byTheme.light.components },
      null,
      2,
    ),
  );

  const count = Object.keys(byTheme.dark.tokens).length;
  console.log(`\n✓ ${count} tokens → docs/design/vercel-tokens.json`);
  console.log(`✓ component specs → docs/design/vercel-components.json`);
  console.log(`✓ screenshots → docs/design/shots/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
