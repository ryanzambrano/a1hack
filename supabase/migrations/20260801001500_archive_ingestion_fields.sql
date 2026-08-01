-- Fields the photo-import pipeline needs.
--
-- A real bakery archive arrives as a folder of images with no price, no size
-- and no metadata — just pictures. Importing a few thousand of them is a long
-- job that will be interrupted, re-run, and pointed at overlapping folders, so
-- the pipeline has to be resumable and idempotent. The content hash is what
-- makes that possible: an image already ingested is skipped rather than
-- captioned again, which matters because captioning is the expensive step.
--
-- `price_cents` and `labor_hours` stay null for imported photos. They are
-- filled in later for a small calibration subset, which is what the cost model
-- is fitted from. See src/lib/archive/calibration.ts.

alter table public.archive_cakes
  add column if not exists source_hash text,
  add column if not exists source_path text;

-- Dedupe within a bakery, not globally: two bakeries may legitimately hold the
-- same stock photo, and each needs its own row.
create unique index if not exists archive_cakes_source_hash_idx
  on public.archive_cakes (bakery_id, source_hash)
  where source_hash is not null;

comment on column public.archive_cakes.source_hash is
  'Content hash of the imported image. Makes re-running the importer a no-op for photos already captioned.';
comment on column public.archive_cakes.source_path is
  'Where the image came from, for tracing a bad caption back to the original file.';
