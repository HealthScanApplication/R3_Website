// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RoutineStep } from '../protocolBuilders';
import { RoutineJourney } from '../../components/guides/RoutineJourney';
import { asMealRule } from '../../components/guides/CatalogBrowsers';

const step = (over: Partial<RoutineStep>): RoutineStep => ({ id: undefined, parentId: null, notes: null, recipeId: null, activityId: null, dows: null, name: 'Step', time: null, group: null, day: null, kind: 'action', itemType: 'activity', scope: null, recurrenceType: null, category: 'do', subtype: 'wellness', minutes: null, sets: null, reps: null, weight: null, ...over });
const steps: RoutineStep[] = [
  step({ id: 's1', name: 'Get morning daylight', time: '07:30', minutes: 20, notes: 'Spend time outdoors soon after waking.' }),
  step({ id: 's2', name: 'Freshly ground flaxseed', time: '07:45', itemType: 'consume', subtype: 'meal', category: 'consume' }),
  step({ id: 's3', name: 'Eat a high-protein lunch', time: '12:30', itemType: 'consume', subtype: 'meal', category: 'consume', notes: 'Build it round protein.' }),
  step({ id: 's4', name: 'Barbell squat', time: '17:30', subtype: 'exercise', activityId: 'act1', sets: 3, reps: 8 }),
  step({ id: 's5', name: 'Oatmeal with berries', time: '08:00', itemType: 'recipe', subtype: 'meal', category: 'consume', recipeId: 'rec1' }),
  step({ id: 's6', name: 'Avoid ultra-processed food', kind: 'rule_dont', subtype: 'meal', time: '12:30' }),
  step({ id: 's7', name: 'Evening walk', time: '18:30', day: 2, subtype: 'exercise' }),
  step({ id: 's8', name: 'Get morning daylight', time: '07:30', day: 2 }),
];
const dish = (id: string, name: string) => ({ id, name_common: name, image_primary_url: `https://img/${id}.webp`, image_url: null, meal_slot: 'lunch', cuisine: null, description_simple: null, description: null, health_score: 88, prep_time: null, cook_time: null, servings: 1, nutrition_per_100g: null, nutrition_per_serving: { energy_kcal: id === 'rec1' ? 300 : 450, protein_g: id === 'rec1' ? 10 : 35, carbohydrates_g: 40, fats_g: 12, fiber_g: 5, sugars_g: 6 }, elements_hazardous: null, dietary_info: null });
const calls: string[] = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url); calls.push(u);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (u.includes('/catalog_activities?')) return json([{ id: 'act1', name: 'Barbell squat', image_url: 'https://img/act1.png', primary_image_url: null }]);
    if (u.includes('/catalog_recipe_ingredients?') && u.includes('ingredient_name')) return json([{ ingredient_name: 'Rolled oats', amount_g: 50, sort_order: 1 }, { ingredient_name: 'Blueberries', amount_g: 80, sort_order: 2 }]);
    if (u.includes('/catalog_recipe_ingredients?')) return json([{ id: 'l1', recipe_id: 'rec1', ingredient_id: 'ing1', amount_g: 100 }, { id: 'l2', recipe_id: 'sug1', ingredient_id: 'ing1', amount_g: 100 }]);
    if (u.includes('/catalog_ingredients?')) return json([{ id: 'ing1', name_common: 'Spinach', nutrition_per_100g: { vitamin_c_mg: 28 }, elements_beneficial: {}, elements_hazardous: {} }]);
    if (u.includes('/catalog_recipes?') && u.includes('nutrition_per_serving,servings')) return json([{ id: 'rec1', nutrition_per_serving: {}, servings: 1 }, { id: 'sug1', nutrition_per_serving: {}, servings: 1 }]);
    if (u.includes('/catalog_recipes?') && u.includes('meal_slot')) return json(u.includes('id=in') ? [dish('rec1', 'Oatmeal with berries')] : [dish('sug1', 'Lentil Power Bowl')]);
    if (u.includes('/catalog_recipes?')) return json([{ id: 'rec1', name_common: 'Oatmeal with berries', image_primary_url: 'https://img/rec1.webp', image_url: null }]);
    return json([]);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const show = () => render(<RoutineJourney accessToken="tok" steps={steps} description="A week." totalDays={2} />);

it('a routine\'s own hygiene and sleep steps are shown, not tucked away as suggested basics', async () => {
  const own = [...steps, step({ id: 'h1', name: 'Brush teeth', time: '07:00', subtype: 'hygiene' }), step({ id: 'z1', name: 'Start sleep', time: '22:00', subtype: 'sleep', category: 'sleep' })];
  render(<RoutineJourney accessToken="tok" steps={own} description="A week." totalDays={2} />);
  expect(await screen.findByText('Brush teeth')).toBeTruthy();
  expect(screen.getByText('Start sleep')).toBeTruthy();
  expect(screen.queryByText(/Suggested daily basics/)).toBeNull();
});

it('every step has a picture in front of it: its own image, or an icon for what it is', async () => {
  const { container } = show();
  await screen.findByText('Eat a high-protein lunch');
  const rows = [...container.querySelectorAll('li')].filter((li) => li.querySelector('[data-prefix]'));
  expect(rows.length).toBe(5); // the day's five steps (the rule is a chip, day 2 is another tab)
  for (const row of rows) expect(row.querySelector('[data-prefix]')).toBeTruthy();
  await waitFor(() => expect(container.querySelector('button[aria-label="Open Barbell squat"][data-prefix="image"]')).toBeTruthy()); // the activity's own picture
  expect(container.querySelector('[data-prefix="icon"]')).toBeTruthy(); // the daylight step has no picture: an icon tile
});

it('a step\'s description is indented under its title, in the same column as the title and time', async () => {
  const { container } = show();
  const title = await screen.findByText('Get morning daylight');
  const note = screen.getByText('Spend time outdoors soon after waking.');
  expect(note.parentElement).toBe(title.parentElement);
  const row = title.closest('li') as HTMLElement;
  expect(row.style.gridTemplateColumns).toMatch(/^24px 44px/); // a number column, a picture column, then the text column the note sits in
  expect(container.querySelector('li [data-prefix]')!.nextElementSibling!.contains(note)).toBe(true);
});

it('a meal named in words gets a suggested dish with its ingredients; a food with no meal word does not', async () => {
  show();
  const lunch = (await screen.findByText('Eat a high-protein lunch')).closest('li') as HTMLElement;
  const card = await within(lunch).findByRole('group', { name: 'Suggested meal: Lentil Power Bowl' });
  expect(card.textContent).toContain('450 kcal');
  const flax = screen.getByText('Freshly ground flaxseed').closest('li') as HTMLElement;
  expect(within(flax).queryByRole('group')).toBeNull();
  // a recipe the step links to is shown as its own meal, with the ingredients
  const oat = (await screen.findByText('Oatmeal with berries', { selector: 'div' })).closest('li') as HTMLElement;
  const linked = await within(oat).findByRole('group', { name: 'Meal: Oatmeal with berries' });
  await waitFor(() => expect(linked.textContent).toContain('Ingredients · 2'));
  expect(linked.textContent).toContain('Rolled oats');
  expect(linked.textContent).toContain('Blueberries');
});

it('rules are Do / Don\'t chips, one tab per day, and a day shows its own steps and those that run every day', async () => {
  show();
  expect(await screen.findByText(/Don’t/)).toBeTruthy();
  expect(screen.getByText('Avoid ultra-processed food', { exact: false })).toBeTruthy();
  expect(screen.queryByText('Evening walk')).toBeNull();
  const days = screen.getByRole('group', { name: 'Day' });
  fireEvent.click(within(days).getByRole('button', { name: 'Day 2' }));
  expect(await screen.findByText('Evening walk')).toBeTruthy();
  expect(screen.getByText('Eat a high-protein lunch')).toBeTruthy(); // a step with no day runs every day
  expect(within(days).getByRole('button', { name: 'Day 2' }).getAttribute('aria-pressed')).toBe('true');
});

it('the Nutrients tab adds up the day\'s meals and shows the share of the daily value from their ingredients', async () => {
  show();
  await screen.findByText('Eat a high-protein lunch');
  await screen.findByRole('group', { name: /Suggested meal/ });
  fireEvent.click(screen.getByRole('tab', { name: 'Nutrients' }));
  const panel = screen.getByRole('tabpanel');
  await waitFor(() => expect(within(panel).getByRole('list', { name: 'Macros' })).toBeTruthy());
  expect(within(panel).getByRole('list', { name: 'Macros' }).textContent).toContain('750'); // 300 + 450 kcal
  await waitFor(() => expect(within(panel).getByRole('list', { name: /^Vitamins/ }).textContent).toMatch(/Vitamin C/));
  fireEvent.click(screen.getByRole('tab', { name: 'Steps' }));
  expect(screen.getByText('Get morning daylight')).toBeTruthy();
});

it('the Nutrients tab keeps macros (with sugar) apart from the micronutrients, and files the micronutrients by type', async () => {
  show();
  await screen.findByText('Eat a high-protein lunch');
  await screen.findByRole('group', { name: /Suggested meal/ });
  fireEvent.click(screen.getByRole('tab', { name: 'Nutrients' }));
  const panel = screen.getByRole('tabpanel');
  const macros = await within(panel).findByRole('list', { name: 'Macros' });
  for (const label of ['Energy', 'Protein', 'Carbs', 'Fat', 'Fibre', 'Sugar']) expect(macros.textContent).toContain(label);
  expect(macros.textContent).toContain('12 g'); // 6 + 6 g of sugar over the day's two meals
  const vitamins = await within(panel).findByRole('list', { name: /^Vitamins/ });
  expect(vitamins.textContent).toMatch(/Vitamin C/);
  for (const macro of ['Protein', 'Fibre', 'Sugar', 'Alcohol']) expect(vitamins.textContent).not.toContain(macro);
  // no micronutrient list repeats a macro
  for (const list of within(panel).getAllByRole('list')) if (list !== macros) for (const macro of ['Protein', 'Fibre', 'Sugar']) expect(list.textContent).not.toContain(macro);
});

it('steps are numbered down the day on a timeline at the left: one number each, a line joining a step to the next in its list', async () => {
  const { container } = show();
  await screen.findByText('Eat a high-protein lunch');
  expect([...container.querySelectorAll('[data-step-number]')].map((n) => n.getAttribute('data-step-number'))).toEqual(['1', '2', '3', '4', '5']);
  for (const list of container.querySelectorAll('ol')) {
    const rows = [...list.children];
    expect(list.getAttribute('start')).toBe(rows[0].querySelector('[data-step-number]')!.getAttribute('data-step-number'));
    rows.forEach((row, i) => expect(!!row.querySelector('span[style*="width: 1px"]')).toBe(i < rows.length - 1)); // no line after the last step of a list
  }
  const row = container.querySelector('li') as HTMLElement;
  expect(row.firstElementChild!.hasAttribute('data-step-number')).toBe(true); // the number is the left-most column
});

it('nothing inside the routine carries a colour of its own: no green or amber accents', async () => {
  const { container } = show();
  await screen.findByText('Eat a high-protein lunch');
  fireEvent.click(screen.getByRole('tab', { name: 'Nutrients' }));
  await screen.findByRole('list', { name: 'Macros' });
  expect(container.innerHTML).not.toMatch(/199,\s*216,\s*163|C7D8A3|232,\s*184,\s*106|E8B86A/i);
});

it('"Finish caffeine for the day" is a meal rule, a Do rule with its note, not a meal step with a suggested dish', async () => {
  const rule = step({ id: 'c1', name: 'Finish caffeine for the day', time: '14:00', itemType: 'consume', subtype: 'meal', category: 'consume', group: 'Lunch', notes: 'Choose caffeine-free drinks after this point.' });
  render(<RoutineJourney accessToken="tok" steps={[rule]} description="A week." totalDays={1} />);
  const rules = await screen.findByRole('list', { name: 'Meals rules' });
  expect(within(rules).getByText('Do')).toBeTruthy();
  expect(rules.textContent).toContain('Finish caffeine for the day');
  expect(rules.textContent).toContain('14:00');
  expect(rules.textContent).toContain('Choose caffeine-free drinks after this point.');
  await new Promise((resolve) => setTimeout(resolve, 60));
  expect(document.querySelector('[data-step-number]')).toBeNull(); // not a numbered step
  expect(screen.queryByRole('group', { name: /meal:/i })).toBeNull(); // no dish
  expect(calls.some((u) => u.includes('meal_slot'))).toBe(false); // none was even looked up
});

it('asMealRule turns only a limit on eating or drinking into a rule', () => {
  const meal = { itemType: 'consume', subtype: 'meal', category: 'consume' };
  expect(asMealRule(step({ name: 'Finish caffeine for the day', ...meal })).kind).toBe('rule_do');
  expect(asMealRule(step({ name: 'Stop eating 3 hours before bed', ...meal })).kind).toBe('rule_do');
  expect(asMealRule(step({ name: 'Avoid refined sugar', ...meal })).kind).toBe('rule_dont');
  expect(asMealRule(step({ name: 'Eat a high-protein lunch', ...meal })).kind).toBe('action');
  expect(asMealRule(step({ name: 'Finish the soup', recipeId: 'r1', ...meal })).kind).toBe('action'); // a linked dish is a meal
  expect(asMealRule(step({ name: 'Stop scrolling at night', subtype: 'wellness' })).kind).toBe('action'); // not in a meal list
  expect(asMealRule(step({ name: 'Finish caffeine for the day', kind: 'rule_dont', ...meal })).kind).toBe('rule_dont'); // a stored rule is left alone
});
