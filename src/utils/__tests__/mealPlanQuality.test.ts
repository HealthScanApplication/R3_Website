import { describe, expect, it } from 'vitest';
import { validateTwoWeekPlantMealPlan } from '../mealPlanQuality';

const slots = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const recipe = (day: number, slot: typeof slots[number], diet: 'vegan' | 'vegetarian' = 'vegan') => ({
  id: `${diet}-${day}-${slot}`,
  meal_slot: slot,
  dietary_info: { vegan: diet === 'vegan', vegetarian: true },
  nutrition_per_serving: { energy_kcal: 400, protein_g: 18 },
  health_score: 90,
  image_url: '/meal.webp',
});

describe('validateTwoWeekPlantMealPlan', () => {
  it('accepts 14 unique recipes for every slot', () => {
    const plan = Array.from({ length: 14 }, (_, day) => slots.map((slot) => recipe(day, slot))).flat();
    expect(validateTwoWeekPlantMealPlan(plan, 'vegan')).toMatchObject({ ok: true, uniqueRecipeCount: 56 });
  });

  it('fails closed on a duplicate and reports the resulting slot shortfall', () => {
    const plan = Array.from({ length: 14 }, (_, day) => slots.map((slot) => recipe(day, slot))).flat();
    plan[55] = plan[0];
    const result = validateTwoWeekPlantMealPlan(plan, 'vegan');
    expect(result.ok).toBe(false);
    expect(result.duplicateRecipeIds).toContain(plan[0].id);
    expect(result.slotShortfalls.snack).toBe(1);
  });

  it('rejects incompatible diets and incomplete nutrition', () => {
    const plan = Array.from({ length: 14 }, (_, day) => slots.map((slot) => recipe(day, slot))).flat();
    plan[0].dietary_info.vegan = false;
    plan[1].nutrition_per_serving = {} as never;
    const result = validateTwoWeekPlantMealPlan(plan, 'vegan');
    expect(result.ok).toBe(false);
    expect(result.wrongDietRecipeIds).toEqual([plan[0].id]);
    expect(result.incompleteNutritionRecipeIds).toEqual([plan[1].id]);
  });
});
