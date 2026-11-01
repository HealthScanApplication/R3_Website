-- Each brand of a Guardian gets its own public page (/guardians/<guardian>/<brand-slug>) with its own products, offers,
-- events and retreats. Content with no brand belongs to the Guardian's own (personal) page, so nothing existing moves.

alter table public.guide_brands add column if not exists slug text;
-- Brands whose names read the same once punctuation is dropped ("Tre Lune", "Tre-Lune") get -2, -3: the index below needs unique addresses.
with named as (
  select id, guide_id, created_at,
         trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) as base
  from public.guide_brands where slug is null and kind = 'business'
), numbered as (
  select id, base, row_number() over (partition by guide_id, base order by created_at, id) as n from named
)
update public.guide_brands b
  set slug = (case when numbered.base in ('', 'community', 'value-ramp', 'workspace') then 'brand' else numbered.base end)
             || (case when numbered.n > 1 then '-' || numbered.n else '' end)
  from numbered where b.id = numbered.id;
create unique index if not exists guide_brands_slug_idx on public.guide_brands (guide_id, lower(slug)) where slug is not null;

alter table public.guide_products add column if not exists brand_id uuid references public.guide_brands(id) on delete set null;
alter table public.guide_offers   add column if not exists brand_id uuid references public.guide_brands(id) on delete set null;
alter table public.guide_events   add column if not exists brand_id uuid references public.guide_brands(id) on delete set null;
alter table public.guide_retreats add column if not exists brand_id uuid references public.guide_brands(id) on delete set null;
create index if not exists guide_products_brand_idx on public.guide_products (brand_id) where brand_id is not null;
create index if not exists guide_offers_brand_idx   on public.guide_offers (brand_id)   where brand_id is not null;
create index if not exists guide_events_brand_idx   on public.guide_events (brand_id)   where brand_id is not null;
create index if not exists guide_retreats_brand_idx on public.guide_retreats (brand_id) where brand_id is not null;

-- Visitors may read the public face of a published Guardian's brands (not their contact details or settings).
create or replace function public.public_guide_brands(p_guide_id uuid)
returns table (id uuid, name text, kind text, slug text, logo_url text, website_url text, social_links jsonb, is_primary boolean)
language sql stable security definer set search_path = public
as $$
  select b.id, b.name, b.kind, b.slug, b.logo_url, b.website_url,
         coalesce(b.social_links, '{}'::jsonb) - 'photos' || jsonb_build_object('photos', coalesce(b.social_links -> 'photos', '[]'::jsonb)),
         b.is_primary
  from public.guide_brands b
  join public.guide_profiles p on p.user_id = b.guide_id
  where b.guide_id = p_guide_id and p.status = 'approved'
$$;
grant execute on function public.public_guide_brands(uuid) to anon, authenticated;
