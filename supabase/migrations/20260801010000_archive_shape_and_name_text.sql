-- Two things the real photographs turned out to need.
--
-- `shape`: the archive is full of rectangular sheet cakes, and "tiers" does
-- not describe them. A sheet cake and a round single-tier cake are both one
-- tier and are not the same product, so shape has to be its own field for
-- retrieval and for serving-count reasoning.
--
-- `has_name_text`: most of these cakes have a child's name piped across them
-- ("HAPPY BIRTHDAY SARAH"). They are another customer's photographs. Showing
-- them is normal — every bakery gallery does it, and Even Dough already runs
-- one — but the agent should say the name gets changed rather than let a
-- caller think they are being offered someone else's cake. Recording the flag
-- is what makes that possible.

alter table public.archive_cakes
  add column if not exists shape         text,
  add column if not exists has_name_text boolean not null default false;

comment on column public.archive_cakes.shape is
  'round | rectangular | sheet | novelty. Distinguishes a sheet cake from a round one, which tiers alone cannot.';
comment on column public.archive_cakes.has_name_text is
  'A previous customer''s name is piped on this cake. The proposal page notes that it would be changed.';
