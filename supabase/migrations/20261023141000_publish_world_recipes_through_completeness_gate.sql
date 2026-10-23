-- Normalize the researched collection to the production completeness contract,
-- add exact ingredient junctions where a formulation name matches the catalog,
-- then publish through (not around) the standard completeness trigger.
with source as (
  select r.id recipe_id, x.item, x.ordinality,
    regexp_replace(lower(trim(x.item->>'name')),
      '^(cooked|fresh|dried|ground|crushed|roasted|firm|shelled|large|light)\s+', '', 'g') clean_name
  from public.catalog_recipes r
  cross join lateral jsonb_array_elements(r.ingredients) with ordinality x(item, ordinality)
  where (r.id like 'recipe_world_%' or r.id like 'recipe_award_%' or r.id like 'recipe_book_%')
    and jsonb_typeof(r.ingredients) = 'array'
), resolved as (
  select distinct on (s.recipe_id, ci.id)
    s.recipe_id, s.item, s.ordinality, ci.id ingredient_id
  from source s
  join lateral (
    select c.id
    from public.catalog_ingredients c
    where regexp_replace(lower(trim(c.name_common)),
      '^(cooked|fresh|dried|ground|crushed|roasted|firm|shelled|large|light)\s+', '', 'g') = s.clean_name
    order by (c.nutrition_per_100g is not null and c.nutrition_per_100g <> '{}'::jsonb) desc, c.id
    limit 1
  ) ci on true
  order by s.recipe_id, ci.id, s.ordinality
)
insert into public.catalog_recipe_ingredients
  (recipe_id, ingredient_id, amount_g, unit, sort_order, notes)
select recipe_id, ingredient_id, (item->>'amount_g')::numeric,
  coalesce(item->>'unit', 'g'), ordinality::int,
  'Exact normalized catalog match from researched gram formulation'
from resolved
where item->>'amount_g' is not null and (item->>'amount_g')::numeric > 0
on conflict (recipe_id, ingredient_id) do update set
  amount_g = excluded.amount_g,
  unit = excluded.unit,
  sort_order = excluded.sort_order,
  notes = excluded.notes;

update public.catalog_recipes
set
  category = 'Meal',
  health_score_basis = 'per_serving',
  is_primary = true,
  scannable = true,
  updated_at = now()
where id like 'recipe_world_%'
   or id like 'recipe_award_%'
   or id like 'recipe_book_%';

update public.catalog_recipes
set is_published = true, updated_at = now()
where id like 'recipe_world_%'
   or id like 'recipe_award_%'
   or id like 'recipe_book_%';

notify pgrst, 'reload schema';
