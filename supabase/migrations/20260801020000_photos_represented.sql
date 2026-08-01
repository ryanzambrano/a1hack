-- How many photographs a single archive row stands for.
--
-- Bakeries shoot the same cake two or three times from different angles. The
-- importer groups those bursts and keeps one representative, so the archive
-- holds designs rather than photographs. Recording the burst size keeps that
-- fact queryable — the ratio of photos to cakes is a real property of the
-- import, not a number written on a slide.
alter table public.archive_cakes
  add column if not exists photos_represented integer not null default 1;
