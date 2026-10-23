-- Repair recipe nutrition provenance without inventing missing nutrient values.
-- Baseline audit on production (2026-10-23): 3,227 recipes; 425 lacked provenance,
-- 358 lacked per-100 g nutrition, 266 lacked per-serving nutrition, 125 were
-- already flagged for curation, and 83 referenced fabricated placeholder inputs.

-- 1. Mark legacy nutrition with no derivation metadata as unverified. Keeping the
-- values visible but explicitly provisional is safer than silently treating them
-- as source-backed or deleting potentially useful historical data.
update public.catalog_recipes
set nutrition_per_100g = coalesce(nutrition_per_100g, '{}'::jsonb) || jsonb_build_object(
  '_derivation', jsonb_build_object(
    'method', 'legacy-import',
    'source', 'source not recorded',
    'review_status', 'UNVERIFIED_PROVENANCE',
    'needs_curation', true,
    'reconciled_at', '2026-10-23'
  )
), updated_at = now()
where nutrition_per_100g is not null
  and jsonb_typeof(nutrition_per_100g) = 'object'
  and not (nutrition_per_100g ? '_derivation');

-- 2. For genuinely empty nutrition objects, retain the absence and attach a
-- machine-readable curation marker. No zeroes are fabricated.
update public.catalog_recipes
set nutrition_per_100g = jsonb_build_object(
  '_derivation', jsonb_build_object(
    'method', 'not-calculated',
    'source', 'no complete source-backed ingredient rollup available',
    'review_status', 'MISSING_NUTRITION',
    'needs_curation', true,
    'reconciled_at', '2026-10-23'
  )
), updated_at = now()
where nutrition_per_100g is null
   or nutrition_per_100g = '{}'::jsonb;

-- 3. Deterministically derive per-serving macros only where the recipe declares
-- an unambiguous gram serving and the corresponding per-100 g value exists.
-- Existing per-serving values are never overwritten.
with eligible as (
  select
    id,
    nutrition_per_100g as n,
    ((regexp_match(lower(trim(serving_size)), '^([0-9]+(?:\.[0-9]+)?)\s*g$'))[1])::numeric as grams
  from public.catalog_recipes
  where (nutrition_per_serving is null or nutrition_per_serving = '{}'::jsonb)
    and serving_size is not null
    and lower(trim(serving_size)) ~ '^[0-9]+(?:\.[0-9]+)?\s*g$'
    and jsonb_typeof(nutrition_per_100g) = 'object'
)
update public.catalog_recipes r
set nutrition_per_serving = jsonb_strip_nulls(jsonb_build_object(
      'energy_kcal', case when e.n ? 'energy_kcal' then round(((e.n->>'energy_kcal')::numeric * e.grams / 100), 1) end,
      'protein_g', case when e.n ? 'protein_g' then round(((e.n->>'protein_g')::numeric * e.grams / 100), 1) end,
      'carbohydrates_g', case when e.n ? 'carbohydrates_g' then round(((e.n->>'carbohydrates_g')::numeric * e.grams / 100), 1) end,
      'fats_g', case when e.n ? 'fats_g' then round(((e.n->>'fats_g')::numeric * e.grams / 100), 1) end,
      'fiber_g', case when e.n ? 'fiber_g' then round(((e.n->>'fiber_g')::numeric * e.grams / 100), 1) end,
      'sugar_g', case when e.n ? 'sugar_g' then round(((e.n->>'sugar_g')::numeric * e.grams / 100), 1) end,
      'sodium_mg', case when e.n ? 'sodium_mg' then round(((e.n->>'sodium_mg')::numeric * e.grams / 100), 1) end,
      '_derivation', jsonb_build_object(
        'method', 'per-100g multiplied by declared serving grams',
        'source', 'catalog_recipes.nutrition_per_100g',
        'serving_g', e.grams,
        'reconciled_at', '2026-10-23',
        'inherits_source_status', coalesce(e.n#>>'{_derivation,review_status}', 'SOURCE_STATUS_NOT_RECORDED')
      )
    )),
    updated_at = now()
from eligible e
where r.id = e.id
  and e.grams > 0
  and (e.n ? 'energy_kcal' or e.n ? 'protein_g' or e.n ? 'carbohydrates_g');

-- 4. Keep the legacy scalar energy column synchronized only when absent. The
-- audit found no conflicting populated values, so this is a non-destructive fill.
update public.catalog_recipes
set calories_per_100g = (nutrition_per_100g->>'energy_kcal')::numeric,
    updated_at = now()
where calories_per_100g is null
  and nutrition_per_100g ? 'energy_kcal'
  and (nutrition_per_100g->>'energy_kcal') ~ '^[0-9]+(?:\.[0-9]+)?$';

notify pgrst, 'reload schema';
