-- Guardian post backgrounds from an image model (supabase/functions/guardian-images). NOT APPLIED: staging first.
-- A Guardian may connect their own OpenAI API key; the Edge Function AES-GCM encrypts it
-- (GUARDIAN_IMAGES_ENCRYPTION_KEY) before it is stored, and only that function (service role) reads it.

create table if not exists public.guardian_openai_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  key_hint text not null,                 -- "sk-…abcd", for "Connected · sk-…abcd"
  credentials_ciphertext text not null,   -- base64 AES-GCM ciphertext of the key
  credentials_iv text not null,           -- base64 12-byte IV
  connected_at timestamptz not null default now()
);
alter table public.guardian_openai_connections enable row level security;
drop policy if exists "guardians read own openai connection" on public.guardian_openai_connections;
create policy "guardians read own openai connection" on public.guardian_openai_connections
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "guardians delete own openai connection" on public.guardian_openai_connections;
create policy "guardians delete own openai connection" on public.guardian_openai_connections
  for delete to authenticated using (user_id = auth.uid());
revoke all on public.guardian_openai_connections from anon, authenticated;
grant select (user_id, key_hint, connected_at) on public.guardian_openai_connections to authenticated;
grant delete on public.guardian_openai_connections to authenticated;

-- One small row per generation: the house daily cap counts these, and spend can be reviewed. No image bytes.
create table if not exists public.guardian_image_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('house', 'own')),
  model text not null,
  aspect_ratio text not null check (aspect_ratio in ('9:16', '4:5', '1:1', '16:9')),
  quality text not null check (quality in ('low', 'medium', 'high')),
  usd numeric(8, 3) not null default 0,
  prompt text not null,
  mock boolean not null default true,
  status text not null check (status in ('completed', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists guardian_image_jobs_user_day on public.guardian_image_jobs (user_id, created_at desc);
alter table public.guardian_image_jobs enable row level security;
drop policy if exists "guardians read own image jobs" on public.guardian_image_jobs;
create policy "guardians read own image jobs" on public.guardian_image_jobs
  for select to authenticated using (user_id = auth.uid());
revoke all on public.guardian_image_jobs from anon, authenticated;
grant select on public.guardian_image_jobs to authenticated;
