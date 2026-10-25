/**
 * What a day of a routine's meals adds up to.
 *
 * Only a recipe's per-serving figures can be added: figures per 100 g say nothing about how much is eaten, so a meal that
 * has only those is counted as a meal without data, never guessed at. Micronutrients are folded onto the canonical keys
 * of recipeNutrients (selenium_ug and selenium_mcg are one nutrient) and shown as a share of the daily value.
 */
import type { CatalogFood } from './protocolBuilders';
import { coverage, nutrientByKey, type Coverage } from './recipeNutrients';

/** The macro rows, each with the spellings recipes use for it. */
export const MACRO_ROWS: Array<{ key: 'energy_kcal' | 'protein_g' | 'carbohydrates_g' | 'fats_g' | 'fiber_g'; label: string; unit: string; aliases: string[] }> = [
  { key: 'energy_kcal', label: 'Energy', unit: 'kcal', aliases: ['energy_kcal', 'calories', 'kcal'] },
  { key: 'protein_g', label: 'Protein', unit: 'g', aliases: ['protein_g'] },
  { key: 'carbohydrates_g', label: 'Carbs', unit: 'g', aliases: ['carbohydrates_g', 'carbs_g', 'carbohydrate_g'] },
  { key: 'fats_g', label: 'Fat', unit: 'g', aliases: ['fats_g', 'fat_g', 'total_fat_g'] },
  { key: 'fiber_g', label: 'Fibre', unit: 'g', aliases: ['fiber_g', 'fibre_g'] },
];
const MACRO_KEYS = new Set(MACRO_ROWS.flatMap((row) => row.aliases));
const NOT_A_MICRO = /^(energy_k(cal|j)|calories|fats?_g|protein_g|carbs?_g|carbohydrates?_g|sugars?_g|fiber_g|fibre_g|water_g|saturated_fat_g|ash_g|alcohol_g|salt_g|trans_fat_g|total_fat_g)$/;

export interface DayNutrition {
  /** Meals in the day, and how many of them have per-serving figures. */
  meals: number;
  counted: number;
  macros: Record<string, number>;
  /** The core nutrients as a share of the daily value; amount null = no figure for it. */
  coverage: Coverage[];
}

/** A recipe's per-serving figures: its own, or the only figures it has when those are per serving. */
export const servingFigures = (food: CatalogFood): Record<string, number> | null => {
  const figures = food.perServing && Object.keys(food.perServing).length ? food.perServing : food.nutritionBasis === 'serving' ? food.per100 : null;
  return figures && Object.keys(figures).length ? figures : null;
};

/**
 * `microsById`: each recipe's micronutrients per serving on canonical keys, worked out from its ingredients (dietNutrition's
 * loadDietAnalysis). A recipe that has them uses them; one that has not falls back on whatever its own figures carry.
 */
export function dayNutrition(foods: CatalogFood[], microsById: Record<string, Record<string, number>> = {}): DayNutrition {
  const served = foods.map((food) => ({ food, figures: servingFigures(food) })).filter((x): x is { food: CatalogFood; figures: Record<string, number> } => !!x.figures);
  const macros: Record<string, number> = {};
  const micros: Record<string, number> = {};
  for (const { food, figures } of served) {
    for (const row of MACRO_ROWS) {
      const alias = row.aliases.find((a) => typeof figures[a] === 'number');
      if (alias) macros[row.key] = (macros[row.key] || 0) + figures[alias];
    }
    const analysed = microsById[food.id];
    if (analysed) {
      for (const [key, value] of Object.entries(analysed)) if (typeof value === 'number' && Number.isFinite(value)) micros[key] = (micros[key] || 0) + value;
      continue;
    }
    for (const [raw, value] of Object.entries(figures)) {
      if (MACRO_KEYS.has(raw) || NOT_A_MICRO.test(raw) || typeof value !== 'number') continue;
      const def = nutrientByKey(raw);
      if (!def) continue;
      micros[def.key] = (micros[def.key] || 0) + value * (def.scale?.[raw] ?? 1);
    }
  }
  return { meals: foods.length, counted: served.length, macros, coverage: coverage(micros, { protein_g: macros.protein_g, fiber_g: macros.fiber_g }, 15) };
}
