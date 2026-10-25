import { describe, expect, it } from 'vitest';
import { dayNutrition, microGroupOf, microGroups, servingFigures } from '../routineNutrition';
import type { CatalogFood } from '../protocolBuilders';

const food = (over: Partial<CatalogFood>): CatalogFood => ({ id: 'r', name: 'Dish', image: null, category: null, description: null, healthScore: null, per100: {}, hazards: [], meta: [], diets: [], ...over });

describe('servingFigures', () => {
  it('is the recipe\'s own per-serving figures, or its only figures when those are per serving, never per 100 g', () => {
    expect(servingFigures(food({ perServing: { energy_kcal: 300 }, per100: { energy_kcal: 120 }, nutritionBasis: 'per100g' }))).toEqual({ energy_kcal: 300 });
    expect(servingFigures(food({ per100: { energy_kcal: 250 }, nutritionBasis: 'serving' }))).toEqual({ energy_kcal: 250 });
    expect(servingFigures(food({ per100: { energy_kcal: 120 }, nutritionBasis: 'per100g' }))).toBeNull();
    expect(servingFigures(food({}))).toBeNull();
  });
});

describe('dayNutrition', () => {
  it('adds up the macros of the meals that have per-serving figures, whichever way each spells them', () => {
    const day = dayNutrition([
      food({ id: 'a', perServing: { energy_kcal: 300, protein_g: 20, carbs_g: 30, fat_g: 10, fibre_g: 6 } }),
      food({ id: 'b', perServing: { calories: 450, protein_g: 25, carbohydrates_g: 50, fats_g: 15, fiber_g: 4 } }),
    ]);
    expect(day.macros).toEqual({ energy_kcal: 750, protein_g: 45, carbohydrates_g: 80, fats_g: 25, fiber_g: 10 });
    expect(day.meals).toBe(2);
    expect(day.counted).toBe(2);
  });

  it('a meal with only figures per 100 g is counted as a meal but never added in', () => {
    const day = dayNutrition([food({ id: 'a', perServing: { energy_kcal: 300 } }), food({ id: 'b', per100: { energy_kcal: 999 }, nutritionBasis: 'per100g' })]);
    expect(day.meals).toBe(2);
    expect(day.counted).toBe(1);
    expect(day.macros.energy_kcal).toBe(300);
  });

  it('shares of the daily value come from the ingredient-based micros when a recipe has them, else from its own figures', () => {
    const day = dayNutrition(
      [food({ id: 'a', perServing: { energy_kcal: 300, protein_g: 25, vitamin_c_mg: 5 } }), food({ id: 'b', perServing: { energy_kcal: 200, vitamin_c_mg: 10, magnesium_mg: 42 } })],
      { a: { vitamin_c_mg: 45, magnesium_mg: 210 } },
    );
    const by = (key: string) => day.coverage.find((c) => c.def.key === key)!;
    expect(by('vitamin_c_mg').amount).toBe(55); // a's 45 from its ingredients, not its own 5; b's own 10
    expect(by('vitamin_c_mg').pct).toBe(Math.round(55 / 90 * 100));
    expect(by('magnesium_mg').amount).toBe(252);
    expect(by('protein_g').amount).toBe(25);
    expect(by('zinc_mg').amount).toBeNull(); // not measured is not zero
  });

  it('no meals, or none with figures, is empty', () => {
    expect(dayNutrition([]).counted).toBe(0);
    expect(dayNutrition([food({ per100: { energy_kcal: 5 }, nutritionBasis: 'per100g' })]).counted).toBe(0);
  });
});

describe('sugar and alcohol', () => {
  it('are macros: added up with the rest, whichever way a recipe spells them, and never among the micronutrients', () => {
    const day = dayNutrition([
      food({ id: 'a', perServing: { energy_kcal: 100, sugars_g: 8, alcohol_g: 1.5 } }),
      food({ id: 'b', perServing: { energy_kcal: 100, total_sugars_g: 4 } }),
    ]);
    expect(day.macros).toMatchObject({ energy_kcal: 200, sugar_g: 12, alcohol_g: 1.5 });
    expect(microGroups(day.coverage)).toEqual([]);
  });
});

describe('microGroups', () => {
  it('files the micronutrients a day has figures for by type, leaves macros out, and skips types with nothing', () => {
    const day = dayNutrition([food({ id: 'a', perServing: { energy_kcal: 300, protein_g: 20, fiber_g: 5, vitamin_c_mg: 30, thiamine_mg: 0.3, iron_mg: 3, omega_3_g: 0.5 } })]);
    const groups = microGroups(day.coverage);
    expect(groups.map((g) => g.label)).toEqual(['Vitamins', 'Minerals', 'Fatty acids']);
    expect(groups[0].items.map((c) => c.def.key)).toEqual(['vitamin_c_mg', 'thiamine_mg']);
    expect(groups.flatMap((g) => g.items).map((c) => c.def.key)).not.toContain('protein_g');
    expect(groups.flatMap((g) => g.items).map((c) => c.def.key)).not.toContain('fiber_g');
  });

  it('knows a vitamin, a mineral, a fatty acid and an amino acid by its key', () => {
    expect(['vitamin_b12_mcg', 'folate_mcg', 'choline_mg'].map(microGroupOf)).toEqual(['vitamins', 'vitamins', 'vitamins']);
    expect(['selenium_mcg', 'iron_mg', 'potassium_mg'].map(microGroupOf)).toEqual(['minerals', 'minerals', 'minerals']);
    expect(['omega_3_g', 'dha_g', 'polyunsaturated_g'].map(microGroupOf)).toEqual(['fats', 'fats', 'fats']);
    expect(['leucine_g', 'tryptophan_g'].map(microGroupOf)).toEqual(['aminos', 'aminos']);
    expect(['lutein_mg', 'coq10_mg'].map(microGroupOf)).toEqual(['other', 'other']);
  });
});
