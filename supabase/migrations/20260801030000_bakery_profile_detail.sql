-- The setup questionnaire grew from eight questions to a real intake form.
--
-- The answers the storefront and the order engine read (address, hours,
-- cutoff, closed days, price band, fulfillment) already have real columns.
-- Everything else — flavors, dietary capability, deposit policy, the phone
-- agent's brief — is only ever read as a whole profile, so it rides in one
-- jsonb column rather than forty columns that would each need a migration.
--
-- Shape and defaults live in src/lib/bakery-profile.ts; missing keys fall back
-- to PROFILE_DEFAULTS on read, so an existing row needs no backfill.
--
-- Idempotent, like the rest of supabase/migrations.

alter table public.bakeries
  add column if not exists profile jsonb not null default '{}'::jsonb;
