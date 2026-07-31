// Database bootstrap: opens (and on first run creates + seeds) the SQLite
// file using Node's built-in node:sqlite. No ORM, no native deps.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSeed } from "./seed.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Open a database. With no path (production use) opens data/bakery.sqlite;
 * tests pass ":memory:" to get an isolated seeded instance.
 */
export function openDb(path) {
  let file = path;
  if (!file) {
    const dataDir = join(here, "..", "data");
    mkdirSync(dataDir, { recursive: true });
    file = join(dataDir, "bakery.sqlite");
  }
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(readFileSync(join(here, "schema.sql"), "utf8"));

  // Defensive migration for DBs created before assignment_state existed.
  try {
    db.exec("ALTER TABLE orders ADD COLUMN assignment_state TEXT NOT NULL DEFAULT '{}'");
  } catch {
    // column already present
  }

  const row = db.prepare("SELECT COUNT(*) AS n FROM bakeries").get();
  if (Number(row.n) === 0) runSeed(db);
  return db;
}

/** Drop all tables and reseed. Used by `npm run seed`. */
export function resetDb(db) {
  db.exec(`
    DROP TABLE IF EXISTS order_lines;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS product_options;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS bakeries;
  `);
  db.exec(readFileSync(join(here, "schema.sql"), "utf8"));
  runSeed(db);
}
