-- Catalogue cleanup: supplements and cooking techniques were filed as activities.
--  1. Supplement "activities" become take-supplement items linked to a supplement product: an existing generic
--     product where one matches, otherwise a new generic one (barcode GENERIC-<NAME>, the catalogue's convention).
--  2. Protocol items that used them (all in the catalogue Protocol "5-Phase Life Reset") point at the product.
--  3. Those activities and the cooking-technique activities (which duplicate catalog_cooking_methods) are retired
--     with is_active = false, never deleted, so history and links stay intact.
-- Idempotent, and checks itself: aborts if a mapping is ambiguous or a retired activity is still in use.
begin;

create temporary table supp_map (activity_name text primary key, product_name text not null, create_generic boolean not null) on commit drop;
insert into supp_map values
  ('Berberine HCl', 'Berberine', false),
  ('Chlorella', 'Chlorella', false),
  ('Digestive Enzymes (DigestGold)', 'Digestive Enzymes', false),
  ('Iodine (Kelp or Liquid)', 'Iodine', false),
  ('Milk Thistle / TUDCA', 'Milk Thistle (silymarin)', false),
  ('Oregano Oil', 'Oregano Oil', false),
  ('Probiotics — Primal Defense / Bravo Yogurt', 'Probiotics', false),
  ('Quercetin + Vitamin C', 'Quercetin', false),
  ('Spirulina', 'Spirulina', false),
  ('Ubiquinol (CoQ10)', 'CoQ10 (ubiquinol)', false),
  ('Wormwood (artemisia absinthium)', 'Wormwood (artemisia)', false),
  ('Black Walnut Hull', 'Black Walnut Hull', false),
  ('Artemisinin', 'Artemisinin', true),
  ('B-Complex', 'B-Complex', true),
  ('Cilantro Tincture', 'Cilantro Tincture', true),
  ('Colostrum', 'Colostrum', true),
  ('Enterosgel', 'Enterosgel', true),
  ('Evening Calming Stack', 'Evening Calming Stack', true),
  ('Fulvic Acid / Shilajit', 'Fulvic Acid / Shilajit', true),
  ('Liposomal Glutathione', 'Liposomal Glutathione', true),
  ('Liposomal Vitamin C', 'Liposomal Vitamin C', true),
  ('Magnesium Oil', 'Magnesium Oil', true),
  ('Molybdenum (low dose)', 'Molybdenum', true),
  ('Oxy Powder (magnesium oxide + citric acid)', 'Oxy Powder (magnesium oxide + citric acid)', true),
  ('Trace Minerals & Electrolytes', 'Trace Minerals & Electrolytes', true);

-- 1. Generic products where none exists yet.
insert into public.catalog_products (id, barcode, name, category, product_kind, is_published, verified)
select gen_random_uuid()::text, 'GENERIC-' || upper(regexp_replace(regexp_replace(m.product_name, '[^A-Za-z0-9]+', '_', 'g'), '^_|_$', '', 'g')), m.product_name, 'Supplements', 'supplement', true, false
from supp_map m
where m.create_generic
  and not exists (select 1 from public.catalog_products p where p.product_kind = 'supplement' and lower(p.name) = lower(m.product_name));

-- Every mapping must resolve to exactly one supplement product.
do $$
declare bad text;
begin
  select string_agg(m.product_name || ' (' || coalesce(c.n, 0) || ')', ', ') into bad
  from supp_map m left join (select lower(name) k, count(*) n from public.catalog_products where product_kind = 'supplement' group by 1) c on c.k = lower(m.product_name)
  where coalesce(c.n, 0) <> 1;
  if bad is not null then raise exception 'Supplement product not unique or missing: %', bad; end if;
end $$;

-- 2. Protocol items: take-supplement items linked to the product, no longer to the activity.
update public.protocol_items pi
set catalog_product_id = p.id, catalog_activity_id = null, item_type = 'supplement', category = 'supplement'
from public.catalog_activities a
join supp_map m on m.activity_name = a.name
join public.catalog_products p on p.product_kind = 'supplement' and lower(p.name) = lower(m.product_name)
where pi.catalog_activity_id = a.id and a.category = 'Supplement';

-- 3. Retire the supplement activities and the cooking-technique activities.
create temporary table retire (id text primary key) on commit drop;
insert into retire
select id from public.catalog_activities
where coalesce(is_group, false) = false and (
  (category = 'Supplement' and name in (select activity_name from supp_map))
  or (category = 'Nutrition' and name in ('Blending','Katsuobushi','Lacto Fermentation','Pan Frying','Pastirma','Schmaltz Frying','Sun Drying','Vinegar Pickling','Yakitori','Cold Smoking','Ember Roasting','Freeze Drying','Lechon','Mincing'))
);
do $$
declare n int;
begin
  select count(*) into n from public.protocol_items where catalog_activity_id in (select id from retire);
  if n > 0 then raise exception '% protocol items still use an activity being retired', n; end if;
end $$;
update public.catalog_activities set is_active = false where id in (select id from retire) and is_active is distinct from false;

commit;
