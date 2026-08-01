-- Delivery, on the order.
--
-- The bakery draws a delivery zone in /setup (radius in miles, plus a rate per
-- mile) and the phone agent quotes against it with the `quote_delivery` tool.
-- The fee lands on total_cents like any other money, but the board also has to
-- know where the van is going and how far — a driver cannot read a total.
--
-- pickup_date / pickup_slot are deliberately reused rather than duplicated: on
-- a delivery order they are the day and the window the van is aiming for, and
-- `fulfillment` is what says which kind of order it is.
--
-- Existing rows are all collection, which is exactly what the defaults say.
-- Idempotent, like the rest of supabase/migrations.

alter table public.orders
  add column if not exists fulfillment         text    not null default 'pickup',
  add column if not exists delivery_address    text    not null default '',
  -- Straight-line miles from the shop, as measured against the zone radius.
  add column if not exists delivery_miles      numeric,
  add column if not exists delivery_fee_cents  integer not null default 0;

do $$ begin
  alter table public.orders
    add constraint orders_fulfillment_check check (fulfillment in ('pickup', 'delivery'));
exception when duplicate_object then null; end $$;

-- The delivery board is "everything going out on a given day", so it is read
-- by date within the bakery, filtered to the driven ones.
create index if not exists orders_delivery_idx
  on public.orders (bakery_id, fulfillment, pickup_date);
