-- Stop "Reset demo" from destroying the cake archive.
--
-- resetAll() in src/lib/server/db.ts deletes every row in `bakeries`, and
-- archive_cakes.bakery_id cascaded from it — so one click on a demo button
-- wiped the entire archive. That is survivable for leads and campaigns, which
-- are demo state and cheap to recreate. It is not survivable for the archive:
-- in production it holds a bakery's imported photo library (Even Dough has
-- roughly 2,000 photographs) along with the price and labour history that
-- every comps-based quote is computed from. Rebuilding it means re-importing
-- and re-captioning everything.
--
-- The app is single-bakery and keys everything to the row id 'default', so the
-- archive can be attached by that convention instead of by a constraint that
-- makes it deletable. The column stays, and a multi-tenant version can
-- reintroduce a foreign key together with a real archival policy.
--
-- Proposals deliberately keep their cascade: they are per-call artefacts and
-- clearing them on reset is correct.

alter table public.archive_cakes
  drop constraint if exists archive_cakes_bakery_id_fkey;

comment on column public.archive_cakes.bakery_id is
  'Owning bakery. Intentionally not a foreign key: the archive must outlive a demo reset that clears the bakeries table. See migration 20260731234500.';
