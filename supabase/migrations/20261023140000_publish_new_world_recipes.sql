-- Publish the researched plant-forward collection in the same catalog used by
-- Guardians > Diet planning > Recipes. Keep the full catalog visible; this
-- only makes the new rows eligible for the existing published-recipes query.
update public.catalog_recipes
set
  is_published = true,
  is_primary = true,
  scannable = true,
  updated_at = now()
where id like 'recipe_world_%'
   or id like 'recipe_award_%'
   or id like 'recipe_book_%';

notify pgrst, 'reload schema';
