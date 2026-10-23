#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const configSource = await readFile(new URL('../src/utils/supabase/environments.ts', import.meta.url), 'utf8');
const block = configSource.match(/staging:\s*\{([\s\S]*?)\n\s*\},/i)?.[1] ?? '';
const projectId = block.match(/projectId:\s*'([^']+)'/)?.[1];
const anonKey = block.match(/publicAnonKey:\s*'([^']+)'/)?.[1];

if (!projectId || !anonKey) throw new Error('Staging Supabase configuration was not found.');

const base = `https://${projectId}.supabase.co/rest/v1`;
const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

async function fetchAll(table, select, order = 'id.asc') {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const url = new URL(`${base}/${table}`);
    url.searchParams.set('select', select);
    url.searchParams.set('order', order);
    url.searchParams.set('limit', '1000');
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const [recipes, links, ingredients, elementLinks] = await Promise.all([
  fetchAll('catalog_recipes', 'id,name_common,category,category_sub,meal_slot,cuisine,origin,language,difficulty,prep_time,cook_time,servings,serving_size,description,description_simple,description_technical,ingredients,linked_ingredients,instructions,nutrition_per_serving,health_score,taste_profile,dietary_info,allergens,tags,image_url,image_primary_url'),
  fetchAll('catalog_recipe_ingredients', 'id,recipe_id,ingredient_id,amount_g,unit,sort_order,notes', 'recipe_id.asc'),
  fetchAll('catalog_ingredients', 'id,name_common,nutrition_per_100g', 'id.asc'),
  fetchAll('catalog_ingredient_elements', 'ingredient_id,element_id,amount_per_100g,unit_per_100g', 'ingredient_id.asc'),
]);

const ingredientById = new Map(ingredients.map((row) => [row.id, row]));
const elementsByIngredient = new Map();
for (const row of elementLinks) {
  if (!elementsByIngredient.has(row.ingredient_id)) elementsByIngredient.set(row.ingredient_id, []);
  elementsByIngredient.get(row.ingredient_id).push(row);
}
const linksByRecipe = new Map();
for (const link of links) {
  if (!linksByRecipe.has(link.recipe_id)) linksByRecipe.set(link.recipe_id, []);
  linksByRecipe.get(link.recipe_id).push(link);
}

const nonempty = (value) => typeof value === 'string' ? value.trim().length > 0 : value != null;
const populatedObject = (value) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
const arrayValue = (value) => Array.isArray(value) ? value : [];
const declaredId = (item) => item?.ingredient_id ?? item?.id ?? null;

const audit = recipes.map((recipe) => {
  const declared = arrayValue(recipe.ingredients);
  const recipeLinks = linksByRecipe.get(recipe.id) ?? [];
  const linkedIds = new Set(recipeLinks.map((link) => link.ingredient_id));
  const gaps = [];

  const requiredText = ['name_common', 'category', 'meal_slot', 'cuisine', 'origin', 'language', 'difficulty', 'serving_size', 'description', 'description_simple', 'description_technical', 'image_url'];
  for (const field of requiredText) if (!nonempty(recipe[field])) gaps.push(`missing_${field}`);
  if (!(Number(recipe.servings) > 0)) gaps.push('missing_servings');
  if (!nonempty(recipe.prep_time)) gaps.push('missing_prep_time');
  if (!nonempty(recipe.cook_time)) gaps.push('missing_cook_time');
  if (declared.length < 2) gaps.push('fewer_than_2_declared_ingredients');
  if (arrayValue(recipe.instructions).length < 2) gaps.push('fewer_than_2_steps');
  if (!populatedObject(recipe.taste_profile)) gaps.push('missing_taste_profile');
  if (!populatedObject(recipe.dietary_info)) gaps.push('missing_dietary_info');
  if (!Array.isArray(recipe.tags) || recipe.tags.length === 0) gaps.push('missing_tags');
  if (!(Number(recipe.health_score) > 0)) gaps.push('missing_health_score');
  if (!populatedObject(recipe.nutrition_per_serving)) gaps.push('missing_nutrition_per_serving');

  const declaredWithoutId = declared.filter((item) => !declaredId(item));
  if (declaredWithoutId.length) gaps.push(`declared_without_ingredient_id:${declaredWithoutId.length}`);
  const unresolvedDeclared = declared.filter((item) => declaredId(item) && !linkedIds.has(declaredId(item)));
  if (unresolvedDeclared.length) gaps.push(`declared_without_junction:${unresolvedDeclared.length}`);
  const linksWithoutAmount = recipeLinks.filter((link) => !(Number(link.amount_g) > 0));
  if (linksWithoutAmount.length) gaps.push(`junction_without_grams:${linksWithoutAmount.length}`);
  const missingCatalogIngredient = recipeLinks.filter((link) => !ingredientById.has(link.ingredient_id));
  if (missingCatalogIngredient.length) gaps.push(`junction_missing_catalog_ingredient:${missingCatalogIngredient.length}`);
  const missingMacros = recipeLinks.filter((link) => !populatedObject(ingredientById.get(link.ingredient_id)?.nutrition_per_100g));
  if (missingMacros.length) gaps.push(`junction_missing_macros:${missingMacros.length}`);
  const missingElements = recipeLinks.filter((link) => (elementsByIngredient.get(link.ingredient_id) ?? []).length === 0);
  if (missingElements.length) gaps.push(`junction_missing_micronutrients:${missingElements.length}`);

  return {
    id: recipe.id,
    name: recipe.name_common,
    declared_ingredients: declared.length,
    junction_ingredients: recipeLinks.length,
    gaps,
  };
});

const incomplete = audit.filter((row) => row.gaps.length > 0);
const collection = audit.filter((row) => /^(recipe_world_|recipe_award_|recipe_book_)/.test(row.id));
const outside = audit.filter((row) => !/^(recipe_world_|recipe_award_|recipe_book_)/.test(row.id));
const summarize = (rows) => ({ total: rows.length, complete: rows.filter((r) => r.gaps.length === 0).length, incomplete: rows.filter((r) => r.gaps.length > 0).length });

process.stdout.write(JSON.stringify({
  generated_at: new Date().toISOString(),
  standard: 'full recipe metadata + >=2 steps + every declared ingredient junctioned in grams + ingredient macros + ingredient micronutrient links',
  summary: { all: summarize(audit), collection: summarize(collection), outside: summarize(outside) },
  incomplete,
}, null, 2));
