-- An offer, product, event or retreat can sit on more than one of a Guardian's brand pages (a cleanse routine on both the
-- Barbara O'Neill page and the Misty Mountain page). `brand_ids` lists the extra brands; the existing `brand_id` stays the
-- first/primary brand and the one shown on the card, so nothing that exists today changes.
alter table public.guide_offers add column if not exists brand_ids uuid[] not null default '{}';
alter table public.guide_products add column if not exists brand_ids uuid[] not null default '{}';
alter table public.guide_events add column if not exists brand_ids uuid[] not null default '{}';
alter table public.guide_retreats add column if not exists brand_ids uuid[] not null default '{}';
