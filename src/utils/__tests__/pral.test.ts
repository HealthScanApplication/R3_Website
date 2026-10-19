import { expect, it, vi } from 'vitest';
import { combinePral, PRAL_DISPLAY, sumPral, trustedPral } from '../pral';
import { aggregateDiet, loadDietAnalysis } from '../dietNutrition';
import type { DietConfig, MealPick } from '../protocolBuilders';

it('ships dark: the display flag is off unless VITE_PRAL_DISPLAY is "true"', async () => {
  for (const [value, want] of [[undefined, false], ['false', false], ['true', true]] as const) {
    vi.resetModules(); vi.unstubAllEnvs(); if (value !== undefined) vi.stubEnv('VITE_PRAL_DISPLAY', value); else vi.stubEnv('VITE_PRAL_DISPLAY', '');
    expect((await import('../pral')).PRAL_DISPLAY).toBe(want);
  }
  vi.unstubAllEnvs(); vi.resetModules();
  expect(typeof PRAL_DISPLAY).toBe('boolean');
});

it('trusts only sourced/rule numbers; not_applicable wins; unknown is null, never 0', () => {
  expect(trustedPral({ pral_status: 'sourced', pral_meq_per_100g: '-3.5' })).toBe(-3.5);
  expect(trustedPral({ pral_status: 'rule', pral_meq_per_100g: 0 })).toBe(0);
  expect(trustedPral({ pral_status: 'not_applicable', pral_meq_per_100g: 4 })).toBe('not_applicable');
  expect(trustedPral({ pral_status: null, pral_meq_per_100g: 4 })).toBeNull();
  expect(trustedPral({ pral_status: 'sourced', pral_meq_per_100g: '' })).toBeNull();
  expect(trustedPral({ pral_status: 'sourced', pral_meq_per_100g: 900 })).toBeNull();
  expect(trustedPral(undefined)).toBeNull();
});

it('sums pral × grams / 100 only when every item has a value', () => {
  expect(sumPral([{ name: 'a', grams: 200, pral: 5 }, { name: 'b', grams: 100, pral: -2 }])).toMatchObject({ total: 8, withValue: 2, count: 2 });
  expect(sumPral([{ name: 'a', grams: 200, pral: 5 }, { name: 'b', grams: 100, pral: null }])).toMatchObject({ total: null, withValue: 1, count: 2 });
  expect(sumPral([{ name: 'a', grams: 200, pral: 5 }, { name: 'w', grams: 250, pral: 0, rule: true }])).toMatchObject({ total: 10, rule: 1, withValue: 2 });
  expect(sumPral([{ name: 'a', grams: 200, pral: 5 }, { name: 'x', grams: 5, pral: 'not_applicable' }])).toMatchObject({ total: null, notApplicable: 1, withValue: 1, count: 2 });
  expect(sumPral([{ name: 'a', grams: null, pral: 5 }])).toMatchObject({ total: null, withValue: 0 });
  expect(sumPral([])).toMatchObject({ total: null, count: 0 });
});

it('combines meals scaled by servings; any unavailable part makes the total unavailable', () => {
  const ok = { total: 4, withValue: 2, count: 2, notApplicable: 0, rule: 0 };
  expect(combinePral([{ pral: ok, servings: 2 }, { pral: ok, servings: 0.5 }]).total).toBe(10);
  expect(combinePral([{ pral: ok, servings: 1 }, null])).toMatchObject({ total: null, withValue: 2, count: 3 });
});

const ingredientRows = [
  { id: 'veg', name_common: 'Veg', nutrition_per_100g: { vitamin_c_mg: 10 }, elements_hazardous: {}, pral_status: 'sourced', pral_meq_per_100g: -4 },
  { id: 'meat', name_common: 'Meat', nutrition_per_100g: { vitamin_c_mg: 0 }, elements_hazardous: {}, pral_status: 'sourced', pral_meq_per_100g: 10 },
];
const meal: MealPick = { id: 'r', source: 'catalog', name: 'Stew', image: null, servings: 3, nutrition: null };
function stub(withColumns: boolean, calls: string[] = []) {
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    if (url.includes('/catalog_recipes?')) return Response.json([{ id: 'r', servings: 2, nutrition_per_serving: { energy_kcal: 100 } }]);
    if (url.includes('/catalog_recipe_ingredients?')) return Response.json([{ recipe_id: 'r', ingredient_id: 'veg', amount_g: 200, retention_factor: 0.5 }, { recipe_id: 'r', ingredient_id: 'meat', amount_g: 100, retention_factor: null }]);
    if (url.includes('/catalog_ingredients?')) {
      if (url.includes('pral_status') && !withColumns) return Response.json({ code: '42703', message: 'column catalog_ingredients.pral_meq_per_100g does not exist' }, { status: 400 });
      return Response.json(withColumns ? ingredientRows : ingredientRows.map(({ pral_status, pral_meq_per_100g, ...r }) => r));
    }
    throw Error(url);
  });
}
const cfg = (pick: MealPick): DietConfig => ({ framework: 'balanced', kcal: 2000, protein: 20, carbs: 50, fat: 30, slots: ['breakfast'], plan: { '1:breakfast': pick, '2:breakfast': pick }, drinks: { breakfast: [] }, drinkPlan: { '1:breakfast': [], '2:breakfast': [] } });

it('scales PRAL with the same retention, divisor and servings as vitamin C', async () => {
  stub(true);
  try {
    const a = await loadDietAnalysis('t', [meal], []);
    // Veg 200 g × 0.5 retention = 100 g → -4; meat 100 g → +10; per serving ÷2 = 3.
    expect(a['catalog:r'].pral).toMatchObject({ total: 3, withValue: 2, count: 2 });
    expect(a['catalog:r'].micros!.vitamin_c_mg).toBe(5);
    const r = aggregateDiet(cfg(meal), a);
    expect(r.days[0].pral.total).toBe(9);
    expect(r.days[0].nutrients.vitamin_c_mg.amount).toBe(15);
    expect(r.week.pral).toMatchObject({ total: 18, withValue: 4, count: 4 });
    expect(r.days[2].pral.total).toBeNull();
  } finally { vi.unstubAllGlobals(); }
});

it('retries once without the pral columns, keeps the planner data, and reports PRAL unavailable', async () => {
  const calls: string[] = [];
  stub(false, calls);
  try {
    const a = await loadDietAnalysis('t', [meal], []);
    expect(a['catalog:r'].micros!.vitamin_c_mg).toBe(5);
    expect(a['catalog:r'].pral).toMatchObject({ total: null, withValue: 0, count: 2 });
    expect(calls.filter((u) => u.includes('/catalog_ingredients?'))).toHaveLength(2);
  } finally { vi.unstubAllGlobals(); }
});

it('treats a text-only drink as missing PRAL in the day total', () => {
  const pick = { ...meal, pral: { total: 3, withValue: 2, count: 2, notApplicable: 0, rule: 0 } };
  const r = aggregateDiet({ ...cfg(pick), drinkPlan: { '1:breakfast': ['Tea'] } });
  expect(r.days[0].pral).toMatchObject({ total: null, withValue: 2, count: 3 });
  expect(r.days[1].pral.total).toBe(9);
});
