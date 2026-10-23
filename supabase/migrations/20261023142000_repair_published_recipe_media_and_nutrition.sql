-- Repair display and provenance fields exposed by the Guardians recipe audit.

-- The files are deployed with the ROUTINE³ site; the former host has an
-- expired TLS certificate, so browsers correctly refuse those image requests.
update public.catalog_recipes
set image_url = replace(image_url, 'https://healthscan.live', 'https://routine3.com'),
    image_primary_url = replace(image_primary_url, 'https://healthscan.live', 'https://routine3.com'),
    updated_at = now()
where image_url like 'https://healthscan.live/%'
   or image_primary_url like 'https://healthscan.live/%';

-- Keep junction rows self-describing for the REST surface used by Guardians.
update public.catalog_recipe_ingredients ri
set ingredient_name = ci.name_common
from public.catalog_ingredients ci
where ci.id = ri.ingredient_id
  and nullif(trim(ri.ingredient_name), '') is null;

-- Complete the ten junction-derived recipes now that all linked ingredients
-- have macro sources. Values remain traceable to the canonical junction view.
update public.catalog_recipes r
set nutrition_per_serving = jsonb_build_object(
      'energy_kcal', m.energy_kcal_per_serving,
      'protein_g', m.protein_g_per_serving,
      'carbohydrates_g', m.carbohydrates_g_per_serving,
      'fiber_g', m.fiber_g_per_serving,
      'fats_g', m.fats_g_per_serving,
      '_derivation', jsonb_build_object(
        'method', 'catalog ingredient junction calculation',
        'source_chain', 'catalog_recipe_ingredients -> catalog_ingredients.nutrition_per_100g',
        'calculated_at', now(),
        'needs_curation', false)),
    health_score_basis = 'per_serving',
    updated_at = now()
from public.catalog_recipe_macro_totals m
where m.recipe_id = r.id
  and r.id like 'recipe_book_%'
  and m.ingredients_missing_macros = 0;

notify pgrst, 'reload schema';
