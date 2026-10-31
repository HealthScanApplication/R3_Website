-- Structured commerce fields for event and retreat cards. Prices come from the linked booking pages.
alter table public.guide_events add column if not exists price_from_cents integer;
alter table public.guide_events add column if not exists currency text;
alter table public.guide_events add column if not exists price_label text;

alter table public.guide_retreats add column if not exists duration_days integer;
alter table public.guide_retreats add column if not exists price_from_cents integer;
alter table public.guide_retreats add column if not exists currency text;
alter table public.guide_retreats add column if not exists price_label text;

update public.guide_events set price_from_cents = 9900, currency = 'USD', price_label = 'From US$99' where source_external_id = 'mahina:67661';
update public.guide_events set price_from_cents = 650000, currency = 'AED', price_label = 'AED 6,500 · 5-day VIP' where source_external_id = 'mahina:67663';
update public.guide_events set price_from_cents = 450000, currency = 'AED', price_label = 'AED 4,500 · 3-day VIP' where source_external_id = 'mahina:92297';
update public.guide_events set price_from_cents = 260000, currency = 'ZAR', price_label = 'R2,600 per person' where source_external_id = 'mahina:85480';

update public.guide_retreats set title = 'Misty Mountain · 8 Day Program', duration_days = 8, price_from_cents = 365000, currency = 'AUD', price_label = 'From A$3,650 · 1 person', booking_url = 'https://www.mmh.com.au/packages', source_url = 'https://www.mmh.com.au/packages' where source_external_id = 'official:misty-mountain';

insert into public.guide_retreats (guide_id, title, description, location, image_url, booking_url, source_url, source_external_id, duration_days, price_from_cents, currency, price_label)
select user_id, 'Misty Mountain · 15 Day Program', 'A longer residential program with vegan gluten-free meals, juices, herbal teas, lifestyle education, guided exercise, interviews and included treatments.', 'Bellbrook, New South Wales, Australia',
  'https://www.barbaraoneill.com/cdn/shop/files/misty_e7b4b9d2-e0f7-49a7-a2c4-87216637b0b3.png?v=1739412618',
  'https://www.mmh.com.au/packages', 'https://www.mmh.com.au/packages', 'official:misty-mountain-15-day', 15, 670000, 'AUD', 'From A$6,700 · 1 person'
from public.guide_profiles where slug = 'barbara-oneill'
on conflict (guide_id, source_external_id) do update set title = excluded.title, description = excluded.description, location = excluded.location, booking_url = excluded.booking_url, duration_days = excluded.duration_days, price_from_cents = excluded.price_from_cents, currency = excluded.currency, price_label = excluded.price_label, updated_at = now();
