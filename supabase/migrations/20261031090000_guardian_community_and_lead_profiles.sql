-- Complete Guardian community foundation plus CRM context for signed-in members.
-- This migration is intentionally self-contained because some environments received
-- the UI before the earlier community migrations were applied.

create table if not exists public.guide_community_channels (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references public.guide_offers(id) on delete cascade,
  guide_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (guide_id, slug)
);

alter table public.guide_community_channels alter column offer_id drop not null;
alter table public.guide_community_channels add column if not exists sort_order integer not null default 0;
create unique index if not exists guide_community_channels_guide_slug_unique on public.guide_community_channels(guide_id, slug);

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

create table if not exists public.guide_community_questions (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid references public.guide_community_channels(id) on delete set null,
  question text not null check (char_length(question) between 3 and 500),
  answer text not null check (char_length(answer) between 1 and 8000),
  exact_quote text check (exact_quote is null or char_length(exact_quote) <= 1200),
  source_title text,
  source_url text,
  status text not null default 'draft' check (status in ('draft','published')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guide_leads add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists guide_leads_guide_user_unique on public.guide_leads(guide_id, user_id) where user_id is not null;

create table if not exists public.guide_lead_comments (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.guide_leads(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists guide_lead_comments_lead_created_idx on public.guide_lead_comments(lead_id, created_at);

create or replace function public.is_guide_community_member(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.guide_community_members where channel_id = p_channel_id and user_id = auth.uid()) $$;

create or replace function public.link_community_member_to_guide_lead()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare
  v_guide_id uuid;
  v_email text;
  v_name text;
begin
  select guide_id into v_guide_id from public.guide_community_channels where id = new.channel_id;
  select email, coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1))
    into v_email, v_name from auth.users where id = new.user_id;
  if v_guide_id is null or v_email is null or v_guide_id = new.user_id then return new; end if;

  update public.guide_leads
    set user_id = new.user_id, name = coalesce(nullif(name, ''), v_name), updated_at = now()
    where guide_id = v_guide_id and lower(email) = lower(v_email) and user_id is null;
  if not found then
    insert into public.guide_leads(guide_id, user_id, name, email, goal, stage)
    values (v_guide_id, new.user_id, v_name, v_email, 'Joined the Guardian community', 'new')
    on conflict (guide_id, user_id) where user_id is not null do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists guide_community_member_to_lead on public.guide_community_members;
create trigger guide_community_member_to_lead after insert on public.guide_community_members
for each row execute function public.link_community_member_to_guide_lead();

update public.guide_leads l set user_id = u.id
from auth.users u where l.user_id is null and lower(l.email) = lower(u.email);

alter table public.guide_community_channels enable row level security;
alter table public.guide_community_members enable row level security;
alter table public.guide_community_messages enable row level security;
alter table public.guide_community_questions enable row level security;
alter table public.guide_lead_comments enable row level security;

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

drop policy if exists "people read published guardian questions" on public.guide_community_questions;
create policy "people read published guardian questions" on public.guide_community_questions for select using (status = 'published' or guide_id = auth.uid());
drop policy if exists "guardians manage their questions" on public.guide_community_questions;
create policy "guardians manage their questions" on public.guide_community_questions for all to authenticated using (guide_id = auth.uid()) with check (guide_id = auth.uid());

drop policy if exists "guardians manage lead comments" on public.guide_lead_comments;
create policy "guardians manage lead comments" on public.guide_lead_comments for all to authenticated using (guide_id = auth.uid() and author_id = auth.uid()) with check (guide_id = auth.uid() and author_id = auth.uid());

grant execute on function public.is_guide_community_member(uuid) to authenticated;
grant select, insert, update, delete on public.guide_community_channels to authenticated;
grant select, insert, delete on public.guide_community_members to authenticated;
grant select, insert, delete on public.guide_community_messages to authenticated;
grant select on public.guide_community_questions to anon, authenticated;
grant insert, update, delete on public.guide_community_questions to authenticated;
grant select, insert, update, delete on public.guide_lead_comments to authenticated;

insert into public.guide_community_channels(guide_id, name, slug, description, sort_order)
select p.user_id, d.name, d.slug, d.description, d.sort_order from public.guide_profiles p
cross join (values
  ('General','general','Introductions, updates and conversations for the whole community.',10),
  ('Protocols','protocols','Questions and discussion about published protocols.',20),
  ('Daily details','daily-details','Practical details, progress notes and everyday implementation.',30),
  ('Questions & answers','questions-answers','Questions and sourced answers from the Guardian.',40)
) as d(name,slug,description,sort_order)
on conflict (guide_id,slug) do nothing;
