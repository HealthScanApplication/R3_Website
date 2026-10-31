-- Barbara O'Neill's verified brand network and a secure, provider-agnostic social publishing queue.
do $$
declare
  barbara_id uuid;
begin
  select user_id into barbara_id from public.guide_profiles where slug = 'barbara-oneill' limit 1;
  if barbara_id is null then return; end if;

  update public.guide_profiles
  set social_links = coalesce(social_links, '{}'::jsonb) || jsonb_build_object(
    'website', 'https://www.barbaraoneill.com/',
    'instagram', 'https://www.instagram.com/realbarbaraoneill/',
    'facebook', 'https://www.facebook.com/realbarbaraoneill',
    'tiktok', 'https://www.tiktok.com/@realbarbaraoneill',
    'youtube', 'https://www.youtube.com/@realbarbaraoneillvideos'
  )
  where user_id = barbara_id;

  insert into public.guide_brands (guide_id, name, kind, contact_email, website_url, social_links, language, pricing_region, currency, is_primary)
  values
    (barbara_id, 'Barbara O''Neill', 'personal', '', 'https://www.barbaraoneill.com/', '{"instagram":"https://www.instagram.com/realbarbaraoneill/","facebook":"https://www.facebook.com/realbarbaraoneill","tiktok":"https://www.tiktok.com/@realbarbaraoneill","youtube":"https://www.youtube.com/@realbarbaraoneillvideos"}'::jsonb, 'English', 'United States', 'USD', true),
    (barbara_id, 'Tre Lune', 'business', '', 'https://www.trelune.com.au/', '{"facebook":"https://www.facebook.com/trelune.au/","instagram":"https://www.instagram.com/trelune_/","tiktok":"https://www.tiktok.com/@trelune_"}'::jsonb, 'English', 'Australia', 'USD', false),
    (barbara_id, 'Misty Mountain Lifestyle Retreat', 'business', '', 'https://www.mmh.com.au/', '{"shop":"https://shop.mmh.com.au","facebook":"https://www.facebook.com/mistymountainlifestyleretreat/","instagram":"https://www.instagram.com/mistymountainlifestyleretreat/"}'::jsonb, 'English', 'Australia', 'USD', false)
  on conflict (guide_id, name) do update set
    website_url = excluded.website_url,
    social_links = excluded.social_links,
    is_primary = excluded.is_primary,
    updated_at = now();
end $$;

create table if not exists public.guide_social_connections (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guide_profiles(user_id) on delete cascade,
  brand_id uuid references public.guide_brands(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook','tiktok','youtube')),
  account_label text not null default '',
  account_handle text not null default '',
  status text not null default 'pending' check (status in ('disconnected','pending','connected','error')),
  provider_account_id text,
  token_ciphertext text,
  token_iv text,
  connected_at timestamptz,
  expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists guide_social_connection_unique on public.guide_social_connections (guide_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), platform);
alter table public.guide_social_connections enable row level security;
drop policy if exists "guardians read own social connections" on public.guide_social_connections;
create policy "guardians read own social connections" on public.guide_social_connections for select to authenticated using (guide_id = auth.uid());
drop policy if exists "guardians delete own social connections" on public.guide_social_connections;
create policy "guardians delete own social connections" on public.guide_social_connections for delete to authenticated using (guide_id = auth.uid());
revoke all on public.guide_social_connections from anon, authenticated;
grant select (id, guide_id, brand_id, platform, account_label, account_handle, status, connected_at, last_error) on public.guide_social_connections to authenticated;
grant delete on public.guide_social_connections to authenticated;

create table if not exists public.guide_social_posts (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guide_profiles(user_id) on delete cascade,
  brand_id uuid references public.guide_brands(id) on delete set null,
  title text not null default '',
  caption text not null default '',
  media_url text not null,
  media_type text not null check (media_type in ('still','video')),
  platforms text[] not null default '{}',
  scheduled_at timestamptz not null,
  timezone text not null default 'UTC',
  status text not null default 'draft' check (status in ('draft','scheduled','publishing','published','failed','cancelled')),
  platform_results jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists guide_social_posts_due_idx on public.guide_social_posts (status, scheduled_at);
alter table public.guide_social_posts enable row level security;
drop policy if exists "guardians manage own social posts" on public.guide_social_posts;
create policy "guardians manage own social posts" on public.guide_social_posts for all to authenticated using (guide_id = auth.uid()) with check (guide_id = auth.uid());
grant select, insert, update, delete on public.guide_social_posts to authenticated;
