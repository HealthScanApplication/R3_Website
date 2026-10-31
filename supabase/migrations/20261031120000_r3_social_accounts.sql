-- Routine³ (R³) brand social accounts, managed from the admin "Social Accounts" tab.
-- Tracks status/handle/owner per platform. Never store passwords or tokens here.
create table if not exists public.r3_social_accounts (
  platform text primary key check (platform in ('instagram','tiktok','facebook','x','youtube')),
  handle text not null default 'routine3',
  profile_url text not null default '',
  status text not null default 'not_created' check (status in ('not_created','created','verified','needs_attention')),
  login_email text not null default '',
  two_factor_enabled boolean not null default false,
  bio_set boolean not null default false,
  avatar_set boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.r3_social_accounts enable row level security;
drop policy if exists "admins manage r3 social accounts" on public.r3_social_accounts;
create policy "admins manage r3 social accounts" on public.r3_social_accounts
  for all to authenticated
  using (public.is_healthscan_admin())
  with check (public.is_healthscan_admin());
revoke all on public.r3_social_accounts from anon;
grant select, insert, update, delete on public.r3_social_accounts to authenticated;

insert into public.r3_social_accounts (platform, profile_url) values
  ('instagram', 'https://www.instagram.com/routine3/'),
  ('tiktok',    'https://www.tiktok.com/@routine3'),
  ('facebook',  'https://www.facebook.com/routine3'),
  ('x',         'https://x.com/routine3'),
  ('youtube',   'https://www.youtube.com/@routine3')
on conflict (platform) do nothing;
