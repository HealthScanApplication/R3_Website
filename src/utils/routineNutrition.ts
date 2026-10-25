/**
 * What a day of a routine's meals adds up to.
 *
 * Only a recipe's per-serving figures can be added: figures per 100 g say nothing about how much is eaten, so a meal that
 * has only those is counted as a meal without data, never guessed at. Micronutrients are folded onto the canonical keys
 * of recipeNutrients (selenium_ug and selenium_mcg are one nutrient) and shown as a share of the daily value.
 */
import type { CatalogFood } from './protocolBuilders';
import { coverage, nutrientByKey, type Coverage } from './recipeNutrients';

export interface MacroRow { key: string; label: string; unit: string; aliases: string[] }
/** The macro rows, each with the spellings recipes use for it. */
export const MACRO_ROWS: MacroRow[] = [
  { key: 'energy_kcal', label: 'Energy', unit: 'kcal', aliases: ['energy_kcal', 'calories', 'kcal'] },
  { key: 'protein_g', label: 'Protein', unit: 'g', aliases: ['protein_g'] },
  { key: 'carbohydrates_g', label: 'Carbs', unit: 'g', aliases: ['carbohydrates_g', 'carbs_g', 'carbohydrate_g'] },
  { key: 'fats_g', label: 'Fat', unit: 'g', aliases: ['fats_g', 'fat_g', 'total_fat_g'] },
  { key: 'fiber_g', label: 'Fibre', unit: 'g', aliases: ['fiber_g', 'fibre_g'] },
];
/** Sugar and alcohol: macros too, kept out of the micronutrients, shown beside the five above when a meal states them. */
export const OTHER_MACRO_ROWS: MacroRow[] = [
  { key: 'sugar_g', label: 'Sugar', unit: 'g', aliases: ['sugars_g', 'sugar_g', 'total_sugars_g'] },
  { key: 'alcohol_g', label: 'Alcohol', unit: 'g', aliases: ['alcohol_g', 'alcohol_ethyl_g'] },
];
const ALL_MACRO_ROWS = [...MACRO_ROWS, ...OTHER_MACRO_ROWS];
const MACRO_KEYS = new Set(ALL_MACRO_ROWS.flatMap((row) => row.aliases));
const NOT_A_MICRO = /^(energy_k(cal|j)|calories|fats?_g|protein_g|carbs?_g|carbohydrates?_g|sugars?_g|total_sugars_g|fiber_g|fibre_g|water_g|saturated_fat_g|ash_g|alcohol_g|alcohol_ethyl_g|salt_g|trans_fat_g|total_fat_g)$/;

/** The types a micronutrient is shown under. */
export type MicroGroupKey = 'vitamins' | 'minerals' | 'fats' | 'aminos' | 'other';
export const MICRO_GROUPS: Array<{ key: MicroGroupKey; label: string }> = [
  { key: 'vitamins', label: 'Vitamins' },
  { key: 'minerals', label: 'Minerals' },
  { key: 'fats', label: 'Fatty acids' },
  { key: 'aminos', label: 'Amino acids' },
  { key: 'other', label: 'Other' },
];
const VITAMIN_KEY = /^(vitamin_|folate_|thiamine_|riboflavin_|niacin_|pantothenic_|biotin_|choline_)/;
const MINERAL_KEY = /^(iron|calcium|magnesium|zinc|potassium|iodine|phosphorus|selenium|copper|manganese|chromium|molybdenum|sodium|fluoride|boron)_/;
const FAT_KEY = /^(omega_|dha_|epa_|monounsaturated_|polyunsaturated_|saturated_)/;
const AMINO_KEY = /^(histidine|isoleucine|leucine|lysine|methionine|phenylalanine|threonine|tryptophan|valine)_/;
export const microGroupOf = (key: string): MicroGroupKey => VITAMIN_KEY.test(key) ? 'vitamins' : MINERAL_KEY.test(key) ? 'minerals' : FAT_KEY.test(key) ? 'fats' : AMINO_KEY.test(key) ? 'aminos' : 'other';

/** The micronutrients a day has figures for, by type (vitamins, minerals…), in the order the nutrient list gives; macros are not among them. */
export function microGroups(cov: Coverage[]): Array<{ key: MicroGroupKey; label: string; items: Coverage[] }> {
  const micro = cov.filter((c) => c.amount != null && !MACRO_KEYS.has(c.def.key));
  return MICRO_GROUPS.map((g) => ({ ...g, items: micro.filter((c) => microGroupOf(c.def.key) === g.key) })).filter((g) => g.items.length > 0);
}

export interface DayNutrition {
  /** Meals in the day, and how many of them have per-serving figures. */
  meals: number;
  counted: number;
  macros: Record<string, number>;
  /** The core and extended nutrients as a share of the daily value; amount null = no figure for it. */
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
    for (const row of ALL_MACRO_ROWS) {
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
  return { meals: foods.length, counted: served.length, macros, coverage: coverage(micros, { protein_g: macros.protein_g, fiber_g: macros.fiber_g }, 30) };
}
