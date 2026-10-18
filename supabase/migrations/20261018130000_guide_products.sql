-- Guardian products (Phase 1 of docs/guardian-shopify-commerce.md).
-- NOT APPLIED automatically: apply to staging first, then production.
--
-- A Guardian lists products from their own Shopify store. ROUTINE³ shows them
-- on the Guardian's site and on the Protocols they are attached to. "Buy"
-- opens a cart permalink on the Guardian's own Shopify checkout, so the
-- Guardian stays merchant of record. ROUTINE³ attribution travels as
-- ref / attributes / discount code. Commission is invoiced from the
-- Guardian's order export at the agreed rate:
--   coalesce(guide_products.commission_percent, guide_profiles.commission_percent)
-- Only admins / the service role may set commission_percent (same guard as
-- guide_profiles).

create table if not exists public.guide_products (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guide_profiles(user_id) on delete cascade,
  shop_domain text not null check (shop_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  myshopify_domain text check (myshopify_domain is null or myshopify_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  product_handle text not null check (product_handle ~ '^[a-z0-9][a-z0-9_-]*$' and char_length(product_handle) <= 255),
  variant_id text check (variant_id is null or variant_id ~ '^[0-9]{1,20}$'),
  variant_title text,
  title text not null check (char_length(trim(title)) between 1 and 180),
  description text check (description is null or char_length(description) <= 600),
  image_url text check (image_url is null or image_url ~ '^https://'),
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  discount_code text check (discount_code is null or (char_length(discount_code) between 3 and 40 and position(',' in discount_code) = 0)),
  commission_percent numeric(5,2) check (commission_percent is null or commission_percent between 0 and 100),
  status text not null default 'draft' check (status in ('draft', 'published')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists guide_products_unique_variant
  on public.guide_products (guide_id, shop_domain, product_handle, coalesce(variant_id, ''));
create index if not exists guide_products_guide_idx on public.guide_products (guide_id, sort_order, created_at desc);

-- Which Protocols show a product ("Shop" block on the Protocol in the app).
create table if not exists public.guide_product_protocols (
  product_id uuid not null references public.guide_products(id) on delete cascade,
  protocol_id uuid not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_id, protocol_id)
);
create index if not exists guide_product_protocols_protocol_idx on public.guide_product_protocols (protocol_id, position);

alter table public.guide_products enable row level security;
alter table public.guide_product_protocols enable row level security;

create or replace function public.guard_guide_product_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not coalesce(public.is_healthscan_admin(), false) then
    if tg_op = 'INSERT' then
      new.commission_percent := null;
    else
      new.commission_percent := old.commission_percent;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guide_product_privilege_guard on public.guide_products;
create trigger guide_product_privilege_guard
before insert or update on public.guide_products
for each row execute function public.guard_guide_product_privileges();

drop policy if exists "guides manage own guide_products" on public.guide_products;
create policy "guides manage own guide_products" on public.guide_products
  for all to authenticated using (guide_id = auth.uid()) with check (guide_id = auth.uid());

drop policy if exists "published products of approved guardians are public" on public.guide_products;
create policy "published products of approved guardians are public" on public.guide_products
  for select using (
    status = 'published'
    and exists (select 1 from public.guide_profiles p where p.user_id = guide_products.guide_id and p.status = 'approved')
  );

drop policy if exists "admins manage guide products" on public.guide_products;
create policy "admins manage guide products" on public.guide_products
  for all to authenticated using (public.is_healthscan_admin()) with check (public.is_healthscan_admin());

-- A Guardian may attach only their own products to their own Protocols.
drop policy if exists "guides manage own product protocols" on public.guide_product_protocols;
create policy "guides manage own product protocols" on public.guide_product_protocols
  for all to authenticated
  using (exists (select 1 from public.guide_products gp where gp.id = product_id and gp.guide_id = auth.uid()))
  with check (
    exists (select 1 from public.guide_products gp where gp.id = product_id and gp.guide_id = auth.uid())
    and exists (select 1 from public.protocols pr where pr.id = protocol_id and pr.user_id = auth.uid())
  );

drop policy if exists "public product protocols follow product visibility" on public.guide_product_protocols;
create policy "public product protocols follow product visibility" on public.guide_product_protocols
  for select using (
    exists (
      select 1 from public.guide_products gp
      join public.guide_profiles p on p.user_id = gp.guide_id
      where gp.id = product_id and gp.status = 'published' and p.status = 'approved'
    )
  );

grant select, insert, update, delete on public.guide_products, public.guide_product_protocols to anon, authenticated;
