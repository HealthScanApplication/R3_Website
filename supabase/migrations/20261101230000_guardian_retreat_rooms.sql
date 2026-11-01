-- A retreat programme can offer several rooms, each with a price for one, two, three or four guests. The public page shows
-- them as a Room and Guests choice on the one programme, like the variants of a product, instead of one card per room.
-- Shape: [{ "label": "Lodge Room", "note": "...", "currency": "AUD", "prices": [{ "guests": 1, "cents": 365000 }] }]
alter table public.guide_retreats add column if not exists options jsonb not null default '[]'::jsonb;
alter table public.guide_retreats drop constraint if exists guide_retreats_options_check;
alter table public.guide_retreats add constraint guide_retreats_options_check check (jsonb_typeof(options) = 'array');
