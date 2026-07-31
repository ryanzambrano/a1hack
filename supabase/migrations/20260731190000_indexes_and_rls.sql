-- Additive hardening for the schema already provisioned in the Supabase project
-- "Sweetleads" (asbadexzjsradvzmzahl) — see supabase/schema.sql for the base tables.
--
-- Everything here is idempotent and safe to run against the live database: it
-- only adds indexes and turns on RLS, and never recreates an existing object.

-- Leads are listed newest-first by /api/state and /api/leads.
create index if not exists leads_created_at_idx on public.leads (created_at desc);

-- Transcripts are always read for one lead, ordered by the identity column, so
-- appends during a live call never need a read-modify-write to get a sequence.
create index if not exists transcript_messages_lead_idx
  on public.transcript_messages (lead_id, id);

-- All access is server-side through the service-role client
-- (src/lib/supabase/admin.ts), so RLS is enabled with no policies at all:
-- service_role bypasses it, and anon/authenticated are denied everything.
alter table public.bakeries enable row level security;
alter table public.campaigns enable row level security;
alter table public.leads enable row level security;
alter table public.transcript_messages enable row level security;
alter table public.call_sessions enable row level security;

-- resetAll() in src/lib/server/db.ts deletes straight from `leads` and
-- `bakeries` and lets the children go with them. The base schema declares these
-- foreign keys without a delete action, so /api/reset would fail with a
-- foreign-key violation until they are recreated as ON DELETE CASCADE.
-- The names below are the Postgres defaults for the inline `references` clauses
-- in schema.sql (<table>_<column>_fkey).
alter table public.transcript_messages
  drop constraint if exists transcript_messages_lead_id_fkey;
alter table public.transcript_messages
  add constraint transcript_messages_lead_id_fkey
  foreign key (lead_id) references public.leads (id) on delete cascade;

alter table public.call_sessions
  drop constraint if exists call_sessions_lead_id_fkey;
alter table public.call_sessions
  add constraint call_sessions_lead_id_fkey
  foreign key (lead_id) references public.leads (id) on delete cascade;

alter table public.campaigns
  drop constraint if exists campaigns_bakery_id_fkey;
alter table public.campaigns
  add constraint campaigns_bakery_id_fkey
  foreign key (bakery_id) references public.bakeries (id) on delete cascade;
