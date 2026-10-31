create table if not exists public.guide_community_channels (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references public.guide_offers(id) on delete cascade,
  guide_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  created_at timestamptz not null default now(),
  unique (guide_id, slug)
);

create table if not exists public.guide_community_members (
  channel_id uuid not null references public.guide_community_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table if not exists public.guide_community_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.guide_community_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists guide_community_messages_channel_created_idx on public.guide_community_messages(channel_id, created_at);

alter table public.guide_community_channels enable row level security;
alter table public.guide_community_members enable row level security;
alter table public.guide_community_messages enable row level security;

create or replace function public.is_guide_community_member(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.guide_community_members where channel_id = p_channel_id and user_id = auth.uid()) $$;

revoke all on function public.is_guide_community_member(uuid) from public;
grant execute on function public.is_guide_community_member(uuid) to authenticated;

drop policy if exists "authenticated view community channels" on public.guide_community_channels;
create policy "authenticated view community channels" on public.guide_community_channels for select to authenticated using (true);
drop policy if exists "guardians manage community channels" on public.guide_community_channels;
create policy "guardians manage community channels" on public.guide_community_channels for all to authenticated using (guide_id = auth.uid()) with check (guide_id = auth.uid());

drop policy if exists "members view their membership" on public.guide_community_members;
create policy "members view their membership" on public.guide_community_members for select to authenticated using (user_id = auth.uid() or exists(select 1 from public.guide_community_channels c where c.id = channel_id and c.guide_id = auth.uid()));
drop policy if exists "people join communities" on public.guide_community_members;
create policy "people join communities" on public.guide_community_members for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "people leave communities" on public.guide_community_members;
create policy "people leave communities" on public.guide_community_members for delete to authenticated using (user_id = auth.uid());

drop policy if exists "community members read messages" on public.guide_community_messages;
create policy "community members read messages" on public.guide_community_messages for select to authenticated using (public.is_guide_community_member(channel_id) or exists(select 1 from public.guide_community_channels c where c.id = channel_id and c.guide_id = auth.uid()));
drop policy if exists "community members post messages" on public.guide_community_messages;
create policy "community members post messages" on public.guide_community_messages for insert to authenticated with check (user_id = auth.uid() and public.is_guide_community_member(channel_id));
drop policy if exists "authors delete messages" on public.guide_community_messages;
create policy "authors delete messages" on public.guide_community_messages for delete to authenticated using (user_id = auth.uid() or exists(select 1 from public.guide_community_channels c where c.id = channel_id and c.guide_id = auth.uid()));

grant select, insert, update, delete on public.guide_community_channels to authenticated;
grant select, insert, delete on public.guide_community_members to authenticated;
grant select, insert, delete on public.guide_community_messages to authenticated;
