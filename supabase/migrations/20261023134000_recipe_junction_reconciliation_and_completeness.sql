-- Catalog-wide recipe reconciliation and strict completeness reporting.
-- Only exact normalized matches and reviewed aliases are linked automatically.

with aliases(recipe_name,ingredient_id) as (values
 ('dried split fava beans','plant_legume_bean_fava'),('fava beans','plant_legume_bean_fava'),('cooked fava beans','plant_legume_bean_fava'),
 ('red lentils','ing_red_lentils'),('brown lentils','plant_legume_lentil'),('cooked brown lentils','plant_legume_lentil'),
 ('brown basmati rice','plant_grain_rice'),('brown jasmine rice','plant_grain_rice'),('short-grain brown rice','plant_grain_rice'),
 ('yellow onion','plant_vegetable_root_onion'),('yellow onions','plant_vegetable_root_onion'),('red onion','plant_vegetable_root_onion_red'),
 ('cooked chickpeas','ingredient_chickpeas'),('chickpea flour','ingredient_chickpeas'),('roasted chickpea flour','ingredient_chickpeas'),
 ('cooked white beans','ingredient_white_beans'),('white beans','ingredient_white_beans'),('cooked cannellini beans','ingredient_white_beans'),
 ('firm tofu','ing_firm_tofu'),('shelled edamame','plant_legume_bean_soy_edamame_pods'),('tempeh','plant_legume_bean_soy_fermented_tempeh'),
 ('red bell pepper','ingredient_red-bell-pepper'),('bell pepper','plant_vegetable_bell_pepper'),('bell peppers','plant_vegetable_bell_pepper'),
 ('lemon juice','7eb168f5-cacb-4ac1-b880-b5d251d25e6a'),('lime juice','c05cb14a-9d28-43a3-8a9a-31b23143d32e'),
 ('olive oil','plant_fruit_olive_oil'),('olive or rapeseed oil','ing_rapeseed_oil'),('rapeseed oil','ing_rapeseed_oil'),
 ('eggplant','ingredient_eggplant'),('tomato','plant_vegetable_tomato'),('large tomatoes','plant_vegetable_tomato'),
 ('crushed tomato','plant_vegetable_tomato'),('cherry tomatoes','d005ab8c-34f6-44b3-8eb1-5903dbed7556'),
 ('spinach','plant_vegetable_leaf_lettuce_spinach'),('green peas','plant_legume_pea_green'),('peas','plant_legume_pea_green'),
 ('whole-wheat pasta','plant_grain_pasta'),('whole-wheat ditalini','plant_grain_pasta'),
 ('whole-wheat flour','ingredient_whole_wheat_flour'),('wholegrain sourdough','plant_grain_sourdough_bread'),
 ('wholegrain pita','plant_grains_cereals_pita_bread'),('wholegrain flatbread','plant_grains_cereals_pita_bread'),
 ('wholegrain pav','d21afc6a-cfcf-4b5e-bac6-291b705768ed'),('whole-wheat roti','d21afc6a-cfcf-4b5e-bac6-291b705768ed'),
 ('berbere spice','plant_spice_blend_berbere'),('blue fenugreek or fenugreek','plant_vegetable_fenugreek'),
 ('flat-leaf parsley','ingredient_parsley'),('fresh coriander','plant_herb_coriander_fresh'),('ground coriander','plant_spice_coriander'),
 ('ground cumin','plant_spice_cumin'),('fresh ginger','plant_vegetable_root_ginger'),('fresh mint','plant_herb_mint'),
 ('fresh basil','plant_herb_basil'),('fresh rosemary','plant_herb_rosemary'),('harissa','condiment_paste_harissa'),
 ('harissa paste','condiment_paste_harissa'),('greek yogurt','animal_cow_dairy_yogurt_greek'),
 ('greek yogurt, 2%','animal_cow_dairy_yogurt_greek'),('green olives','plant_fruit_olive_green'),
 ('paneer','animal_cow_dairy_cheese_paneer'),('pomegranate arils','plant_fruit_pomegranate_seed'),
 ('pomegranate molasses','plant_pomegranate_fruit_molasses'),('rice vinegar','condiment_vinegar_rice'),
 ('red wine vinegar','condiment_vinegar_wine_red'),('tamari','condiment_sauce_tamari'),('wakame','ing_wakame_seaweed'),
 ('fine bulgur','plant_grain_bulgur_wheat'),('dosa rice','plant_grain_rice_generic'),('water','ingredient_water'),
 ('water or unsalted stock','ingredient_water'),('broad wheat noodles','ing_durum_wheat_semolina'),
 ('currants','ingredient_raisins'),('thick poha','plant_grain_rice_generic'),('toor dal','plant_legume_lentil'),
 ('pepper paste','condiment_sauce_hot'),('phanaeng curry paste','ing_green_curry_paste'),
 ('black vinegar','372dd19c-39aa-4e6d-bcd6-b4b05cc8997d'),('fresh herbs','ing_group_herbs'),
 ('vegetable crudités','plant_vegetable_root_carrot'),
 ('sea salt','ingredient_sea_salt'),('sesame seeds','plant_sesame_seed'),('walnuts','ingredient_walnut'),
 ('peanuts','plant_nut_peanut'),('cashews','plant_nut_cashew'),('pine nuts','plant_nut_pine')
), source as (
 select r.id recipe_id,x.item,x.ordinality,lower(trim(x.item->>'name')) raw_name,
  regexp_replace(lower(trim(x.item->>'name')),'^(cooked|fresh|dried|ground|crushed|roasted|firm|shelled|large|light)\s+','','g') clean_name,
  coalesce(x.item->>'ingredient_id',x.item->>'id') declared_id
 from public.catalog_recipes r cross join lateral jsonb_array_elements(coalesce(r.ingredients,'[]'::jsonb)) with ordinality x(item,ordinality)
), resolved as (
 select distinct on(s.recipe_id,s.ordinality) s.*,coalesce(di.id,ai.id,ci.id) ingredient_id
 from source s left join public.catalog_ingredients di on di.id=s.declared_id
 left join aliases a on a.recipe_name=s.raw_name left join public.catalog_ingredients ai on ai.id=a.ingredient_id
 left join lateral(select c.id from public.catalog_ingredients c
  where regexp_replace(lower(trim(c.name_common)),'^(cooked|fresh|dried|ground|crushed|roasted|firm|shelled|large|light)\s+','','g') in(s.raw_name,s.clean_name)
  order by(c.nutrition_per_100g is not null and c.nutrition_per_100g<>'{}'::jsonb) desc,c.id limit 1) ci on true
 order by s.recipe_id,s.ordinality
), inserted as (
 insert into public.catalog_recipe_ingredients(recipe_id,ingredient_id,amount_g,unit,sort_order,notes)
 select recipe_id,ingredient_id,(item->>'amount_g')::numeric,coalesce(item->>'unit','g'),ordinality::int,'Reconciled from declared gram formulation'
 from resolved where ingredient_id is not null and item->>'amount_g' is not null and(item->>'amount_g')::numeric>0
 on conflict(recipe_id,ingredient_id) do update set amount_g=excluded.amount_g,unit=excluded.unit,sort_order=excluded.sort_order,notes=excluded.notes returning recipe_id
), rebuilt as (
 select recipe_id,jsonb_agg(case when ingredient_id is null then item else(item-'id'-'ingredient_id')||jsonb_build_object('ingredient_id',ingredient_id) end order by ordinality) ingredients
 from resolved group by recipe_id
)
update public.catalog_recipes r set ingredients=b.ingredients,linked_ingredients=b.ingredients,updated_at=now() from rebuilt b where b.recipe_id=r.id;

-- Derive missing ingredient-element junctions from existing structured nutrition.
do $$ declare rec record; begin
 if to_regprocedure('public.sync_ingredient_elements(text)') is not null then
  for rec in select distinct ci.id from public.catalog_recipe_ingredients ri join public.catalog_ingredients ci on ci.id=ri.ingredient_id
   where ci.nutrition_per_100g is not null and ci.nutrition_per_100g<>'{}'::jsonb
    and not exists(select 1 from public.catalog_ingredient_elements cie where cie.ingredient_id=ci.id)
  loop perform public.sync_ingredient_elements(rec.id); end loop;
 end if;
end $$;

create or replace view public.catalog_recipe_macro_totals as
select cr.id recipe_id,cr.servings,
 round(sum(cri.amount_g/100.0*coalesce((ci.nutrition_per_100g->>'energy_kcal')::numeric,(ci.nutrition_per_100g->>'calories')::numeric,0))/nullif(cr.servings,0),1) energy_kcal_per_serving,
 round(sum(cri.amount_g/100.0*coalesce((ci.nutrition_per_100g->>'protein_g')::numeric,0))/nullif(cr.servings,0),1) protein_g_per_serving,
 round(sum(cri.amount_g/100.0*coalesce((ci.nutrition_per_100g->>'carbohydrates_g')::numeric,(ci.nutrition_per_100g->>'carbs_g')::numeric,0))/nullif(cr.servings,0),1) carbohydrates_g_per_serving,
 round(sum(cri.amount_g/100.0*coalesce((ci.nutrition_per_100g->>'fiber_g')::numeric,(ci.nutrition_per_100g->>'fibre_g')::numeric,0))/nullif(cr.servings,0),1) fiber_g_per_serving,
 round(sum(cri.amount_g/100.0*coalesce((ci.nutrition_per_100g->>'fats_g')::numeric,(ci.nutrition_per_100g->>'fat_g')::numeric,0))/nullif(cr.servings,0),1) fats_g_per_serving,
 count(*) ingredient_links,count(*) filter(where ci.nutrition_per_100g is null or ci.nutrition_per_100g='{}'::jsonb) ingredients_missing_macros
from public.catalog_recipes cr join public.catalog_recipe_ingredients cri on cri.recipe_id=cr.id join public.catalog_ingredients ci on ci.id=cri.ingredient_id group by cr.id,cr.servings;

update public.catalog_recipes r set nutrition_per_serving=jsonb_build_object('energy_kcal',m.energy_kcal_per_serving,'protein_g',m.protein_g_per_serving,
 'carbohydrates_g',m.carbohydrates_g_per_serving,'fiber_g',m.fiber_g_per_serving,'fats_g',m.fats_g_per_serving,
 '_derivation',jsonb_build_object('method','catalog ingredient junction calculation','source_chain','catalog_recipe_ingredients -> catalog_ingredients.nutrition_per_100g','calculated_at',now(),'needs_curation',false)),updated_at=now()
from public.catalog_recipe_macro_totals m where m.recipe_id=r.id and m.ingredients_missing_macros=0 and r.servings>0;

create or replace view public.catalog_recipe_nutrient_totals as
select ri.recipe_id,cie.element_id,cie.unit_per_100g unit,round(sum(ri.amount_g/100.0*cie.amount_per_100g)/nullif(r.servings,0),4) amount_per_serving
from public.catalog_recipe_ingredients ri join public.catalog_recipes r on r.id=ri.recipe_id join public.catalog_ingredient_elements cie on cie.ingredient_id=ri.ingredient_id
where ri.amount_g>0 and cie.amount_per_100g is not null group by ri.recipe_id,cie.element_id,cie.unit_per_100g,r.servings;

create or replace view public.catalog_recipe_completeness as
select r.id,r.name_common,jsonb_array_length(coalesce(r.ingredients,'[]'::jsonb)) declared_ingredients,count(distinct ri.id) junction_ingredients,
 count(distinct ri.id) filter(where ci.nutrition_per_100g is not null and ci.nutrition_per_100g<>'{}'::jsonb) macro_sourced_ingredients,
 count(distinct ri.id) filter(where cie.ingredient_id is not null) nutrient_sourced_ingredients,jsonb_array_length(coalesce(r.instructions,'[]'::jsonb)) cooking_steps,
 (nullif(trim(r.description),'') is not null) has_description,(nullif(trim(r.description_simple),'') is not null) has_simple_description,
 (nullif(trim(r.description_technical),'') is not null) has_technical_description,(nullif(trim(r.meal_slot),'') is not null) has_meal_slot,
 (nullif(trim(r.cuisine),'') is not null) has_cuisine,(nullif(trim(r.origin),'') is not null) has_origin,(nullif(trim(r.difficulty),'') is not null) has_difficulty,
 (nullif(trim(r.prep_time::text),'') is not null) has_prep_time,(nullif(trim(r.cook_time::text),'') is not null) has_cook_time,
 (nullif(trim(r.serving_size),'') is not null and r.servings>0) has_serving_data,(nullif(trim(coalesce(r.image_primary_url,r.image_url)),'') is not null) has_image,
 (r.taste_profile is not null and r.taste_profile<>'{}'::jsonb) has_taste_profile,(r.dietary_info is not null and r.dietary_info<>'{}'::jsonb) has_dietary_info,
 (r.nutrition_per_serving is not null and r.nutrition_per_serving<>'{}'::jsonb) has_nutrition,
 greatest(jsonb_array_length(coalesce(r.ingredients,'[]'::jsonb))-count(distinct ri.id),0) unresolved_ingredient_count,
 count(distinct ri.id) filter(where ri.amount_g is null or ri.amount_g<=0) junctions_without_grams,
 count(distinct ri.id) filter(where ci.nutrition_per_100g is null or ci.nutrition_per_100g='{}'::jsonb) junctions_without_macros,
 count(distinct ri.id) filter(where cie.ingredient_id is null) junctions_without_nutrients,
 (jsonb_array_length(coalesce(r.ingredients,'[]'::jsonb))>=2 and count(distinct ri.id)=jsonb_array_length(coalesce(r.ingredients,'[]'::jsonb))
  and count(distinct ri.id) filter(where ri.amount_g is null or ri.amount_g<=0)=0
  and count(distinct ri.id) filter(where ci.nutrition_per_100g is null or ci.nutrition_per_100g='{}'::jsonb)=0
  and count(distinct ri.id) filter(where cie.ingredient_id is null)=0 and jsonb_array_length(coalesce(r.instructions,'[]'::jsonb))>=2
  and nullif(trim(r.description),'') is not null and nullif(trim(r.description_simple),'') is not null and nullif(trim(r.description_technical),'') is not null
  and nullif(trim(r.meal_slot),'') is not null and nullif(trim(r.cuisine),'') is not null and nullif(trim(r.origin),'') is not null
  and nullif(trim(r.difficulty),'') is not null and nullif(trim(r.prep_time::text),'') is not null and nullif(trim(r.cook_time::text),'') is not null
  and nullif(trim(r.serving_size),'') is not null and r.servings>0 and nullif(trim(coalesce(r.image_primary_url,r.image_url)),'') is not null
  and r.taste_profile is not null and r.taste_profile<>'{}'::jsonb and r.dietary_info is not null and r.dietary_info<>'{}'::jsonb
  and r.nutrition_per_serving is not null and r.nutrition_per_serving<>'{}'::jsonb) is_full_data
from public.catalog_recipes r left join public.catalog_recipe_ingredients ri on ri.recipe_id=r.id left join public.catalog_ingredients ci on ci.id=ri.ingredient_id
left join(select distinct ingredient_id from public.catalog_ingredient_elements) cie on cie.ingredient_id=ci.id group by r.id;

grant select on public.catalog_recipe_macro_totals,public.catalog_recipe_nutrient_totals,public.catalog_recipe_completeness to anon,authenticated;
notify pgrst,'reload schema';
