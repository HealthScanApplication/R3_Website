import { mealDrinks, mealPickKey, MEAL_SLOTS, selectedServings, toMealNutrition, WEEK, type DietConfig, type MealPick, type PlanIngredient } from './protocolBuilders';
import { canonicalMicros, ingredientHazards, NUTRIENTS, nutrientByKey, recipeHazards, type RecipeHazard } from './recipeNutrients';
import type { GuideRecipe } from './guidePortal';
import { projectId, publicAnonKey } from './supabase/info';
import { combinePral, fetchWithPralFallback, sumPral, trustedPral, type PralTotal } from './pral';

export type DietAnalysis = Record<string, MealPick>;
export function dietSelections(cfg: DietConfig, day?: number): Array<MealPick | string> {
  return WEEK.filter((w) => day == null || w.day === day).flatMap((w) => MEAL_SLOTS.filter((s) => cfg.slots.includes(s.id)).flatMap((s) => {
    const key = `${w.day}:${s.id}`; const meal = cfg.plan[key];
    return meal || cfg.drinkPlan?.[key]?.length ? [...(meal ? [meal] : []), ...mealDrinks(cfg, key)] : [];
  }));
}
const number = (v: unknown) => v !== null && v !== '' && (typeof v === 'string' || typeof v === 'number') && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
function canonicalValues(values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [raw, value] of Object.entries(values)) {
    if (number(value) == null) continue;
    const k = raw === 'fat_g' ? 'fats_g' : raw === 'carbs_g' ? 'carbohydrates_g' : raw === 'sugar_g' ? 'sugars_g' : raw;
    const def = nutrientByKey(k);
    const key = def?.key || k;
    // Prefer the canonical spelling to a duplicate alias. Do not sum the same
    // stored nutrient twice (e.g. folate_ug alongside folate_mcg).
    if (out[key] == null || key === raw) out[key] = value * (def?.scale?.[raw] ?? 1);
  }
  return out;
}
function knownNutrients(p: MealPick) {
  const raw: Record<string, number> = { ...(p.nutrition?.nutrients || {}) };
  for (const k of p.nutrition?.recorded || ['energy_kcal','protein_g','carbohydrates_g','fats_g','fiber_g']) {
    const v = (p.nutrition as any)?.[k]; if (number(v) != null) raw[k] = v;
  }
  return { ...canonicalValues(p.micros || {}), ...canonicalValues(raw) };
}
function recordedMicros(row: any) {
  const out = canonicalMicros(row);
  const values = { ...(row?.nutrition_per_100g || {}) };
  for (const [group,data] of Object.entries(row?.elements_beneficial?.per_100g || {})) if (group !== 'macronutrients' && data && typeof data === 'object') Object.assign(values,data);
  for (const [key,v] of Object.entries(values)) if (number(v) === 0 && !/^(energy|calories|protein|carbohydrates|carbs|fats?|fiber|sugars?|saturated_fat|water|salt|alcohol|ash|trans_fat)(_|$)/.test(key)) {
    for (const [k,zero] of Object.entries(canonicalValues({ [key]: 0 }))) if (out[k] == null) out[k] = zero;
  }
  return out;
}
export interface DietTotals {
  count: number; unlinked: number; unassessed: number;
  nutrients: Record<string, { amount: number | null; known: number; partial?: boolean }>;
  hazards: Array<RecipeHazard & { amount: number | null; unknown: number; occurrences: number }>;
  /** Ingredients across the selections; grams = portion in this plan (servings applied), null if unknown. */
  ingredients: PlanIngredient[];
  /** PRAL (acid/base load) in mEq: a total only when every weighed item has a value. */
  pral: PralTotal;
  pralMeals: Array<{ name: string; pral: PralTotal | null }>;
}
const LEVELS = ['trace','low','moderate','high'];
function totals(items: Array<MealPick | string>, analysis: DietAnalysis): DietTotals {
  const result: DietTotals = { count: items.length, unlinked: 0, unassessed: 0, nutrients: {}, hazards: [], ingredients: [], pral: combinePral([]), pralMeals: [] };
  const pralParts: Array<{ pral?: PralTotal; servings: number } | null> = [];
  const ingredients = new Map<string, PlanIngredient>();
  for (const k of ['energy_kcal','protein_g','carbohydrates_g','fats_g','fiber_g', ...NUTRIENTS.map((d) => d.key)]) result.nutrients[k] = { amount: null, known: 0 };
  const hazards = new Map<string, DietTotals['hazards'][number]>();
  for (const item of items) {
    if (typeof item === 'string') { result.unlinked++; result.unassessed++; pralParts.push(null); result.pralMeals.push({ name: item, pral: null }); continue; }
    const p = { ...item, ...analysis[mealPickKey(item)], servings: item.servings };
    const servings = selectedServings(p);
    if (!p.analysisComplete) result.unassessed++;
    pralParts.push({ pral: p.pral, servings });
    result.pralMeals.push({ name: p.name, pral: p.pral ? { ...p.pral, total: p.pral.total == null ? null : p.pral.total * servings } : null });
    for (const i of p.ingredients || []) {
      const cur = ingredients.get(i.name) || { ...i, grams: 0 };
      cur.grams = cur.grams == null || i.grams == null ? null : cur.grams + i.grams * servings;
      ingredients.set(i.name, cur);
    }
    for (const [k, v] of Object.entries(knownNutrients(p))) {
      const cell = result.nutrients[k] ||= { amount: null, known: 0 };
      cell.amount = (cell.amount ?? 0) + v * servings; cell.known++;
      if (p.partialNutrients?.includes(k) && canonicalValues(p.nutrition?.nutrients || {})[k] == null) cell.partial = true;
    }
    for (const h of p.hazards || []) {
      const cur = hazards.get(h.key) || { ...h, sources: [], reasons: [], amount: null, unknown: 0, occurrences: 0 };
      cur.occurrences++;
      const additive = /_(g|mg|mcg|ug)$/.test(h.key);
      if (h.perServing == null || p.unknownHazards?.includes(h.key) || !additive) cur.unknown++;
      if (h.perServing != null && additive) cur.amount = (cur.amount ?? 0) + h.perServing * servings;
      if (LEVELS.indexOf(h.level) > LEVELS.indexOf(cur.level)) cur.level = h.level;
      cur.sources = [...new Set([...cur.sources, ...h.sources, p.name])];
      cur.reasons = [...new Set([...cur.reasons, ...h.reasons])];
      cur.assessed = cur.assessed && h.assessed;
      hazards.set(h.key, cur);
    }
  }
  result.pral = combinePral(pralParts);
  result.hazards = [...hazards.values()].sort((a,b) => LEVELS.indexOf(b.level)-LEVELS.indexOf(a.level) || a.label.localeCompare(b.label));
  result.ingredients = [...ingredients.values()].sort((a,b) => (b.grams ?? 0)-(a.grams ?? 0));
  return result;
}
export function aggregateDiet(cfg: DietConfig, analysis: DietAnalysis = {}) {
  return { week: totals(dietSelections(cfg), analysis), days: WEEK.map((w) => totals(dietSelections(cfg, w.day), analysis)) };
}

/** Refresh exact selected IDs, not a framework-limited or top-600 search cache.
 * Owner-private recipes remain behind the caller's token/RLS; nothing is published. */
/** includePral: read the pral_* columns too (default). The planner passes PRAL_DISPLAY, so a dark launch makes no PRAL request. */
export async function loadDietAnalysis(token: string, picks: MealPick[], recipes: GuideRecipe[], signal?: AbortSignal, includePral = true): Promise<DietAnalysis> {
  const result: DietAnalysis = {};
  const read = async (table: string, select: string, field: string, ids: string[], pral = false) => {
    const rows: any[] = [];
    for (let start = 0; start < ids.length; start += 40) {
      const values = ids.slice(start,start+40).map((id) => `"${id.replace(/["\\]/g,'')}"`).join(',');
      for (let offset = 0; ; offset += 1000) {
        const url = (sel: string) => `https://${projectId}.supabase.co/rest/v1/${table}?${new URLSearchParams({ select: sel, [field]: `in.(${values})`, limit: '1000', offset: String(offset), order: 'id.asc' })}`;
        const init = { signal, headers: { apikey: publicAnonKey, Authorization: `Bearer ${token}` } };
        // A database without the pral_* columns must never empty the planner: retry once without them.
        const response = pral ? await fetchWithPralFallback(url, select, init) : await fetch(url(select), init);
        if (!response.ok) throw Error('Could not refresh meal nutrients and hazards.');
        const page = await response.json(); rows.push(...page); if (page.length < 1000) break;
      }
    }
    return rows;
  };
  const ids = [...new Set(picks.filter((p) => p.source === 'catalog').map((p) => p.id))];
  const rows = await read('catalog_recipes','id,nutrition_per_serving,servings','id',ids);
  const links = await read('catalog_recipe_ingredients','id,recipe_id,ingredient_id,amount_g,retention_factor','recipe_id',rows.map((r) => r.id));
  const ingredients = new Map((await read('catalog_ingredients','id,name_common,nutrition_per_100g,elements_beneficial,elements_hazardous','id',[...new Set(links.map((j) => j.ingredient_id).filter(Boolean))] as string[],includePral)).map((r) => [r.id,r]));
  for (const pick of picks) {
    if (result[mealPickKey(pick)]) continue;
    const row = pick.source === 'guide' ? recipes.find((r) => r.id === pick.id) : rows.find((r) => r.id === pick.id);
    if (!row) { result[mealPickKey(pick)] = { ...pick, micros: undefined, hazards: undefined, analysisComplete: false }; continue; }
    const divisor = Number(row.servings) > 0 ? Number(row.servings) : 1;
    const micros: Record<string, number> = {};
    let complete = true;
    const items = pick.source === 'guide' ? ((row as GuideRecipe).ingredients || []).map((i: any) => {
      if (!i?.per100 || number(i.grams) == null) complete = false;
      return { name: i?.catalog_name || i?.name || 'Ingredient', grams: number(i?.grams) ?? 0, known: number(i?.grams) != null, per100: i?.per100?.micros || {}, micros: number(i?.grams) == null ? {} : i?.per100?.micros || {}, hazards: i?.per100?.hazards || [], pral: trustedPral(i?.per100), pralRule: i?.per100?.pral_status === 'rule' };
    }) : links.filter((j) => j.recipe_id === pick.id).map((j) => {
      const ing = ingredients.get(j.ingredient_id);
      const retention = j.retention_factor == null ? 1 : number(j.retention_factor);
      if (!ing || number(j.amount_g) == null || retention == null) complete = false;
      return { name: ing?.name_common || 'Ingredient', grams: (number(j.amount_g) ?? 0) * (retention ?? 0), known: number(j.amount_g) != null && retention != null, per100: ing ? { ...canonicalValues(ing.nutrition_per_100g || {}), ...recordedMicros(ing) } : {}, micros: number(j.amount_g) == null || retention == null ? {} : recordedMicros(ing), hazards: ingredientHazards(ing), pral: trustedPral(ing), pralRule: ing?.pral_status === 'rule' };
    });
    if (!items.length) complete = false;
    for (const i of items) for (const [k,v] of Object.entries(i.micros)) if (number(v) != null) micros[k] = (micros[k] || 0) + Number(v) * i.grams / 100 / divisor;
    const hazards = recipeHazards(items,divisor).map((h) => {
      // Preserve trace quantities: the recipe-card helper rounds to three decimals.
      const measured = items.flatMap((i) => i.hazards.filter((hz) => hz.key === h.key && hz.per100 != null).map((hz) => Number(hz.per100) * i.grams / 100));
      const total = measured.length ? measured.reduce((a,b) => a+b,0) : null;
      return { ...h, total, perServing: total == null ? null : total / divisor, assessed: complete && items.flatMap((i) => i.hazards).filter((hz) => hz.key === h.key).every((hz) => hz.assessed) };
    });
    const unknownHazards = hazards.filter((h) => !complete || items.some((i) => i.hazards.some((hz) => hz.key === h.key && hz.per100 == null))).map((h) => h.key);
    // Same basis as micros: grams already carry retention; per serving via the same divisor.
    const pral = sumPral(items.map((i) => ({ name: i.name, grams: i.known ? i.grams : null, pral: i.pral, rule: i.pralRule })), divisor);
    result[mealPickKey(pick)] = { ...pick, nutrition: toMealNutrition(row.nutrition_per_serving), micros, hazards, analysisComplete: complete, pral,
      partialNutrients: Object.keys(micros).filter((key) => !complete || items.some((i) => i.micros[key] == null)), unknownHazards,
      ingredients: items.map((i) => ({ name: i.name, grams: i.known ? i.grams / divisor : null, per100: i.per100, hazards: i.hazards, pral: i.pral, pralRule: i.pralRule })) };
  }
  return result;
}
