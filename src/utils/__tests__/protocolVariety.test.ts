import { describe, expect, it } from 'vitest';
import { planVariety, ruleFitFlags, mealAlternatives, lengthLabel, type Recipe, type Activity, type VRow } from '../protocolVariety';

let n = 0; const uuid = () => `new-${++n}`;
const recipes: Recipe[] = [
  { id: 'r1', name_common: 'Oats', meal_slot: 'Breakfast', dietary_info: { vegan: true }, health_score: 80 },
  { id: 'r2', name_common: 'Chia pudding', meal_slot: 'Breakfast', dietary_info: { vegan: true }, health_score: 90 },
  { id: 'r3', name_common: 'Eggs', meal_slot: 'Breakfast', dietary_info: { vegetarian: true }, health_score: 85 },
  { id: 'r4', name_common: 'Tofu bowl', meal_slot: 'Lunch', dietary_info: { vegan: true }, health_score: 70 },
];
const activities: Activity[] = [
  { id: 'a1', name: 'Push-up', category: 'strength', parent_activity_id: 'p' , body_parts: ['chest'] },
  { id: 'a2', name: 'Incline push-up', category: 'strength', parent_activity_id: 'p', body_parts: ['chest'] },
  { id: 'a3', name: 'Squat', category: 'strength', body_parts: ['legs'] },
];

describe('protocolVariety', () => {
  it('rotates meals within slot and diet, keeps rules attached, leaves supplements daily', () => {
    n = 0;
    const rows: VRow[] = [
      { id: 'm', display_name: 'Oats', category: 'consume', catalog_recipe_id: 'r1', scheduled_time: '08:00' },
      { id: 'rule', display_name: 'Chew slowly', kind: 'rule_do', parent_protocol_item_id: 'm' },
      { id: 's', display_name: 'Vitamin D', category: 'supplement' },
    ];
    const p = planVariety(rows, recipes, activities, { totalDays: 7, uuid });
    expect(mealAlternatives(recipes[0], 'breakfast', recipes).map((r) => r.id)).toEqual(['r2']);
    expect(p.updates.map((u) => u.id)).toEqual(['m', 'rule']);
    const meals = p.inserts.filter((i) => i.source_id === 'm');
    expect(meals).toHaveLength(6);
    expect(meals[0].set).toMatchObject({ day_number: 2, catalog_recipe_id: 'r2', display_name: 'Chia pudding' });
    const rules = p.inserts.filter((i) => i.source_id === 'rule');
    expect(rules.map((r) => r.set.parent_protocol_item_id)).toEqual(meals.map((m) => m.id));
    expect(p.inserts.some((i) => i.source_id === 's')).toBe(false);
  });

  it('fitness: rest on day 7/14, lighter day 4, progression in week 2', () => {
    n = 0;
    const rows: VRow[] = [
      { id: 'e1', display_name: 'Push-up', catalog_activity_id: 'a1', sets: 3 },
      { id: 'e2', display_name: 'Squat', catalog_activity_id: 'a3', duration_minutes: 20 },
    ];
    const p = planVariety(rows, recipes, activities, { totalDays: 14, uuid });
    const e1 = p.inserts.filter((i) => i.source_id === 'e1');
    expect(e1.map((i) => i.set.day_number)).not.toContain(7);
    expect(e1.map((i) => i.set.day_number)).not.toContain(14);
    expect(e1.find((i) => i.set.day_number === 2)!.set).toMatchObject({ catalog_activity_id: 'a2', sets: 3 });
    expect(e1.find((i) => i.set.day_number === 4)!.set.sets).toBe(2);
    expect(e1.find((i) => i.set.day_number === 9)!.set.sets).toBe(4);
    expect(p.inserts.find((i) => i.source_id === 'e2' && i.set.day_number === 8)!.set.duration_minutes).toBe(23);
  });

  it('Day length does nothing; already-scheduled items are left alone', () => {
    const rows: VRow[] = [{ id: 'm', display_name: 'Oats', catalog_recipe_id: 'r1', day_number: 3 }];
    expect(planVariety(rows, recipes, activities, { totalDays: 1 }).inserts).toHaveLength(0);
    expect(planVariety(rows, recipes, activities, { totalDays: 14, uuid }).inserts).toHaveLength(0);
    expect(lengthLabel(null)).toBe('2 weeks');
    expect(lengthLabel(28)).toBe('Month');
  });

  it('flags rules that do not fit', () => {
    const rows: VRow[] = [
      { id: 'm', display_name: 'Whole Milk', category: 'consume' },
      { id: 'r1', display_name: '75% plants on plate', kind: 'rule_do', parent_protocol_item_id: 'm' },
      { id: 'r2', display_name: 'Meal', kind: 'rule_do' },
      { id: 'r3', display_name: 'No screens before bed', kind: 'rule_dont', parent_protocol_item_id: 'm' },
    ];
    const f = ruleFitFlags(rows, { name: 'Toddler Nutrition • 1 to 2 Years' });
    expect(f.map((x) => x.rule)).toEqual(['75% plants on plate', 'Meal', 'No screens before bed']);
  });
});

describe('generic meal slots', () => {
  it('links a bare "Breakfast" to recipes fitting the protocol diet', async () => {
    const { dietFlagsOf } = await import('../protocolVariety');
    n = 0;
    const rows: VRow[] = [{ id: 'b', display_name: 'Breakfast', category: 'consume', scheduled_time: '08:00' }];
    const p = planVariety(rows, recipes, activities, { totalDays: 7, uuid, dietFlags: dietFlagsOf({ name: 'Vegan Reset' }) });
    expect(p.updates[0].set).toMatchObject({ day_number: 1, catalog_recipe_id: expect.any(String) });
    expect(p.inserts[0].set).toMatchObject({ day_number: 2 });
  });
});
