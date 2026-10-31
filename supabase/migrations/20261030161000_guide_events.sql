create table if not exists public.guide_events (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  timezone text,
  venue text,
  location text,
  format text not null default 'in_person' check (format in ('in_person', 'virtual', 'hybrid')),
  image_url text,
  info_url text,
  source_url text not null,
  source_name text,
  source_external_id text not null,
  status text not null default 'published' check (status in ('draft', 'published', 'cancelled')),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guide_id, source_external_id)
);

create table if not exists public.guide_event_sources (
  guide_id uuid primary key references auth.users(id) on delete cascade,
  source_url text not null check (source_url ~ '^https://'),
  source_name text,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.guide_event_sources enable row level security;
drop policy if exists "Event sources are public" on public.guide_event_sources;
create policy "Event sources are public" on public.guide_event_sources for select using (true);
drop policy if exists "Guides manage their event source" on public.guide_event_sources;
create policy "Guides manage their event source" on public.guide_event_sources for all
  using (auth.uid() = guide_id) with check (auth.uid() = guide_id);

create index if not exists guide_events_guide_start_idx on public.guide_events (guide_id, start_at);
alter table public.guide_events enable row level security;

drop policy if exists "Published guide events are public" on public.guide_events;
create policy "Published guide events are public" on public.guide_events for select
  using (status = 'published' or auth.uid() = guide_id);

drop policy if exists "Guides manage their events" on public.guide_events;
create policy "Guides manage their events" on public.guide_events for all
  using (auth.uid() = guide_id) with check (auth.uid() = guide_id);

-- Seed the currently published official calendar so Barbara's profile is useful
-- immediately; future runs of Pull new events update these rows by external id.
insert into public.guide_events
  (guide_id, title, start_at, end_at, timezone, venue, location, image_url, info_url, source_url, source_name, source_external_id)
select p.user_id, e.title, e.start_at::timestamptz, e.end_at::timestamptz, 'America/Chicago', e.venue, e.venue, e.image_url, e.info_url,
  'https://www.barbaraoneill.com/pages/events', 'Barbara O''Neill official events calendar', e.external_id
from public.guide_profiles p
cross join (values
  ('North Carolina, USA', '2026-10-28T04:30:00.000Z', '2026-11-01T04:30:00.000Z', 'VanHoy Family Campground', 'https://mahina.b-cdn.net/media/Sovereign%20_1767713923951.png', 'https://www.sovereignhealthsummit.com', 'mahina:67661'),
  ('Dubai', '2026-11-04T06:52:00.000Z', '2026-11-08T06:52:00.000Z', 'Arjaan by Rotana, Dubai', 'https://mahina.b-cdn.net/media/1_1793295847208.png', 'https://ticketspotapp.com/e/barbaradubaireset', 'mahina:67663'),
  ('Abu Dhabi', '2026-11-11T06:52:00.000Z', '2026-11-13T06:52:00.000Z', 'Beach Rotana, Abu Dhabi', 'https://mahina.b-cdn.net/media/3_1793295855240.png', 'https://ticketspotapp.com/e/restoreabudhabi', 'mahina:92297'),
  ('Cape Town, South Africa', '2026-11-24T15:56:00.000Z', '2026-11-28T15:56:00.000Z', 'Rots Church, 25 Lelie Street, Protea Hoogte', 'https://mahina.b-cdn.net/media/PHOTO-2026_1784156490265.jpg', 'https://www.barbaraoneill.com/pages/events', 'mahina:85480')
) as e(title, start_at, end_at, venue, image_url, info_url, external_id)
where p.slug = 'barbara-oneill'
on conflict (guide_id, source_external_id) do nothing;

insert into public.guide_event_sources (guide_id, source_url, source_name)
select user_id, 'https://www.barbaraoneill.com/pages/events', 'Barbara O''Neill official events calendar'
from public.guide_profiles where slug = 'barbara-oneill'
on conflict (guide_id) do update set source_url = excluded.source_url, source_name = excluded.source_name;
