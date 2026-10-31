create table if not exists public.guide_retreats (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  image_url text,
  booking_url text,
  source_url text not null,
  source_external_id text not null,
  status text not null default 'published' check (status in ('draft','published','cancelled')),
  updated_at timestamptz not null default now(),
  unique (guide_id, source_external_id)
);

alter table public.guide_retreats enable row level security;
create policy "Published guide retreats are public" on public.guide_retreats for select
  using (status = 'published' or auth.uid() = guide_id);
create policy "Guides manage their retreats" on public.guide_retreats for all
  using (auth.uid() = guide_id) with check (auth.uid() = guide_id);

update public.guide_profiles
set headline = 'Self Heal by Design'
where slug = 'barbara-oneill';

insert into public.guide_retreats
  (guide_id, title, description, location, image_url, booking_url, source_url, source_external_id)
select user_id, 'Misty Mountain Retreat', 'Barbara & Michael''s home retreat', 'Misty Mountain, Australia',
  'https://www.barbaraoneill.com/cdn/shop/files/misty_e7b4b9d2-e0f7-49a7-a2c4-87216637b0b3.png?v=1739412618',
  'https://www.mmh.com.au', 'https://www.barbaraoneill.com/pages/retreats', 'official:misty-mountain'
from public.guide_profiles where slug = 'barbara-oneill'
on conflict (guide_id, source_external_id) do update set
  title = excluded.title, description = excluded.description, location = excluded.location,
  image_url = excluded.image_url, booking_url = excluded.booking_url, updated_at = now();
