-- bakery-platform schema (SQLite). Money is integer øre. Timestamps are ISO
-- strings in local time. Every product/order row carries bakery_id so a
-- multi-bakery future is additive, even though the MVP seeds exactly one.

CREATE TABLE IF NOT EXISTS bakeries (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  slug               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  address            TEXT NOT NULL DEFAULT '',
  phone              TEXT NOT NULL DEFAULT '',
  email              TEXT NOT NULL DEFAULT '',
  currency           TEXT NOT NULL DEFAULT 'NOK',
  -- Fulfillment rules (see docs/research.md: day-granular lead time + cutoff)
  order_cutoff_hour  INTEGER NOT NULL DEFAULT 12,  -- order after this local hour: +1 day
  open_hour          INTEGER NOT NULL DEFAULT 8,   -- pickup windows start
  close_hour         INTEGER NOT NULL DEFAULT 16,  -- pickup windows end
  closed_weekdays    TEXT NOT NULL DEFAULT '[0]',  -- JSON array, JS getDay() (0 = Sunday)
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  bakery_id             INTEGER NOT NULL REFERENCES bakeries(id),
  name                  TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  category              TEXT NOT NULL DEFAULT 'Annet',
  image_url             TEXT NOT NULL DEFAULT '',
  base_price_cents      INTEGER NOT NULL,             -- price of default selection, øre
  lead_time_days        INTEGER NOT NULL DEFAULT 1,   -- min days notice (0 = same day)
  can_have_cake_text    INTEGER NOT NULL DEFAULT 0,   -- boolean
  cake_text_price_cents INTEGER NOT NULL DEFAULT 0,   -- surcharge when cake text used
  active                INTEGER NOT NULL DEFAULT 1,   -- boolean; deactivate, never delete
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per selectable value. group_name groups rows into a single-select
-- option group ("Størrelse", "Fyll"); exactly one value per group is chosen.
-- Sizes are just another group; the UI shows base + delta as absolute prices.
CREATE TABLE IF NOT EXISTS product_options (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  group_name        TEXT NOT NULL,
  value_name        TEXT NOT NULL,
  price_delta_cents INTEGER NOT NULL DEFAULT 0,
  is_default        INTEGER NOT NULL DEFAULT 0,
  position          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  bakery_id          INTEGER NOT NULL REFERENCES bakeries(id),
  order_number       TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'new',   -- new|confirmed|ready|picked_up|cancelled
  customer_name      TEXT NOT NULL,
  customer_phone     TEXT NOT NULL,
  customer_email     TEXT NOT NULL,
  pickup_date        TEXT NOT NULL,                 -- YYYY-MM-DD
  pickup_slot        TEXT NOT NULL,                 -- e.g. "10:00-11:00"
  note               TEXT NOT NULL DEFAULT '',
  total_cents        INTEGER NOT NULL,
  payment_provider   TEXT NOT NULL,
  payment_status     TEXT NOT NULL,                 -- 'demo_paid' from the mock provider
  payment_reference  TEXT NOT NULL,
  -- Mutable state owned by the vendored Daymaker bakery dashboard adapter
  -- (see lib/daymaker-adapter.js): scheduled-date override, uploaded
  -- production/delivery photos (data URLs), and a "delivered" mark. Kept in
  -- one JSON blob so the platform's core order model stays untouched.
  assignment_state   TEXT NOT NULL DEFAULT '{}',
  created_at         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Frozen snapshot of what was ordered: names, prices and chosen options are
-- copied at order time so later catalog edits never rewrite history.
CREATE TABLE IF NOT EXISTS order_lines (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders(id),
  product_id       INTEGER NOT NULL,
  product_name     TEXT NOT NULL,
  qty              INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL,
  options_json     TEXT NOT NULL DEFAULT '[]',  -- [{group, value, priceDeltaCents}]
  cake_text        TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_products_bakery ON products(bakery_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_options_product ON product_options(product_id, group_name, position);
CREATE INDEX IF NOT EXISTS idx_orders_bakery ON orders(bakery_id, status, pickup_date);
CREATE INDEX IF NOT EXISTS idx_lines_order ON order_lines(order_id);
