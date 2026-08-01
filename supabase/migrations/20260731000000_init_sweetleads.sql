-- Sweetleads schema.
--
-- All access is server-side through the service-role client (src/lib/supabase/admin.ts),
-- so RLS is enabled with no policies: service_role bypasses it, anon is denied everything.

create type public.fulfillment as enum ('pickup', 'delivery');
create type public.lead_status as enum ('new', 'calling', 'qualified', 'follow_up', 'closed');
create type public.campaign_status as enum ('draft', 'active');
create type public.transcript_speaker as enum ('agent', 'customer');

-- The single bakery profile the voice agent represents. One row, keyed 'default'.
create table public.bakeries (
  id text primary key default 'default',
  name text not null,
  location text not null,
  cake_types text[] not null default '{}',
  price_min integer not null,
  price_max integer not null,
  fulfillment public.fulfillment[] not null default '{}',
  phone text not null,
  hours text not null,
  monthly_budget integer not null,
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id text primary key,
  bakery_id text not null references public.bakeries (id) on delete cascade,
  headline text not null,
  body text not null,
  cta text not null,
  audience text not null,
  daily_budget integer not null,
  status public.campaign_status not null default 'draft',
  launched_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.leads (
  id text primary key,
  name text not null,
  phone text not null,
  source text not null,
  status public.lead_status not null default 'new',
  call_outcome text,
  next_action text,
  -- CakeOrder, null until the call qualifies the lead. Named cake_order because
  -- PostgREST reserves `order` as a query parameter.
  cake_order jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_created_at_idx on public.leads (created_at desc);

-- One row per spoken line. Ordered by the identity column, so appends during a
-- live call never need a read-modify-write to compute a sequence number.
create table public.transcript_messages (
  id bigint generated always as identity primary key,
  lead_id text not null references public.leads (id) on delete cascade,
  speaker public.transcript_speaker not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index transcript_messages_lead_idx on public.transcript_messages (lead_id, id);

create table public.call_sessions (
  call_sid text primary key,
  lead_id text not null references public.leads (id) on delete cascade,
  from_number text not null,
  done boolean not null default false,
  started_at timestamptz not null default now()
);

alter table public.bakeries enable row level security;
alter table public.campaigns enable row level security;
alter table public.leads enable row level security;
alter table public.transcript_messages enable row level security;
alter table public.call_sessions enable row level security;
