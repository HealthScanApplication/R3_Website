-- Which brand pages show a Guardian's published protocols. One protocol record can sit on several pages (Barbara O'Neill and
-- Misty Mountain, or Tre Lune); it is the same protocol, only listed more than once. A protocol with no rows here shows on the
-- Guardian's own (personal) page only. Kept in its own table so the shared `protocols` table is not touched.
create table if not exists public.guide_protocol_brands (
  protocol_id uuid not null references public.protocols(id) on delete cascade,
  brand_id uuid not null references public.guide_brands(id) on delete cascade,
  guide_id uuid not null references public.guide_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (protocol_id, brand_id)
);
create index if not exists guide_protocol_brands_guide_idx on public.guide_protocol_brands(guide_id);
alter table public.guide_protocol_brands enable row level security;

-- Which page lists which protocol is not private: the protocol itself is only visible when it is public.
drop policy if exists "anyone reads guide_protocol_brands" on public.guide_protocol_brands;
create policy "anyone reads guide_protocol_brands" on public.guide_protocol_brands for select to anon, authenticated using (true);
drop policy if exists "guides manage own guide_protocol_brands" on public.guide_protocol_brands;
create policy "guides manage own guide_protocol_brands" on public.guide_protocol_brands
  for all to authenticated using (guide_id = auth.uid()) with check (guide_id = auth.uid());
