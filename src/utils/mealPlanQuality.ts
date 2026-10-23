export const TWO_WEEK_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type TwoWeekMealSlot = typeof TWO_WEEK_MEAL_SLOTS[number];
export type PlantDiet = 'vegan' | 'vegetarian';

export interface MealPlanRecipeCandidate {
  id: string;
  name_common?: string | null;
  meal_slot?: unknown;
  dietary_info?: Record<string, unknown> | null;
  nutrition_per_serving?: Record<string, unknown> | null;
  health_score?: number | null;
  image_url?: string | null;
}

export interface MealPlanQualityResult {
  ok: boolean;
  requiredUniqueRecipes: number;
  uniqueRecipeCount: number;
  duplicateRecipeIds: string[];
  wrongDietRecipeIds: string[];
  incompleteNutritionRecipeIds: string[];
  slotCounts: Record<TwoWeekMealSlot, number>;
  slotShortfalls: Partial<Record<TwoWeekMealSlot, number>>;
}

const normalizeSlot = (value: unknown): TwoWeekMealSlot | null => {
  const raw = Array.isArray(value) ? value.join(' ') : String(value ?? '');
  const text = raw.toLowerCase();
  return TWO_WEEK_MEAL_SLOTS.find((slot) => text.includes(slot)) ?? null;
};

const hasUsableNutrition = (recipe: MealPlanRecipeCandidate): boolean => {
  const nutrition = recipe.nutrition_per_serving;
  if (!nutrition || typeof nutrition !== 'object') return false;
  const energy = Number(nutrition.energy_kcal ?? nutrition.calories);
  const protein = Number(nutrition.protein_g);
  return Number.isFinite(energy) && energy > 0 && Number.isFinite(protein) && protein >= 0;
};

/**
 * Fail-closed quality gate for a two-week plant-based plan.
 *
 * This checks recipe variety and data readiness. It intentionally does not claim
 * clinical nutrient adequacy: that requires age/sex/life-stage DRIs, quantities,
 * fortified-food details, and (where relevant) labs/clinician review.
 */
export function validateTwoWeekPlantMealPlan(
  recipes: MealPlanRecipeCandidate[],
  diet: PlantDiet,
  days = 14,
): MealPlanQualityResult {
  const requiredUniqueRecipes = days * TWO_WEEK_MEAL_SLOTS.length;
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const wrongDietRecipeIds: string[] = [];
  const incompleteNutritionRecipeIds: string[] = [];
  const slotCounts = Object.fromEntries(TWO_WEEK_MEAL_SLOTS.map((slot) => [slot, 0])) as Record<TwoWeekMealSlot, number>;

  for (const recipe of recipes) {
    if (seen.has(recipe.id)) duplicates.add(recipe.id);
    seen.add(recipe.id);
    if (recipe.dietary_info?.[diet] !== true) wrongDietRecipeIds.push(recipe.id);
    if (!hasUsableNutrition(recipe)) incompleteNutritionRecipeIds.push(recipe.id);
    const slot = normalizeSlot(recipe.meal_slot);
    if (slot) slotCounts[slot] += 1;
  }

  const slotShortfalls: Partial<Record<TwoWeekMealSlot, number>> = {};
  for (const slot of TWO_WEEK_MEAL_SLOTS) {
    if (slotCounts[slot] < days) slotShortfalls[slot] = days - slotCounts[slot];
  }

  return {
    ok: recipes.length === requiredUniqueRecipes
      && seen.size === requiredUniqueRecipes
      && duplicates.size === 0
      && wrongDietRecipeIds.length === 0
      && incompleteNutritionRecipeIds.length === 0
      && Object.keys(slotShortfalls).length === 0,
    requiredUniqueRecipes,
    uniqueRecipeCount: seen.size,
    duplicateRecipeIds: [...duplicates],
    wrongDietRecipeIds,
    incompleteNutritionRecipeIds,
    slotCounts,
    slotShortfalls,
  };
}

export const SUPPLEMENT_SAFETY_POLICY = {
  framework: 'Recognized dietary reference intakes, not a commercial “90 essential nutrients” claim',
  foodFirst: true,
  requiresPersonalProfile: true,
  requiresInteractionScreen: true,
  requiresUpperLimitCheck: true,
  clinicianReviewWhen: ['pregnancy', 'child', 'medication use', 'kidney disease', 'documented deficiency'],
  neverAutoSupplement: ['arsenic', 'aluminum', 'silver', 'gold', 'rare-earth elements'],
} as const;
