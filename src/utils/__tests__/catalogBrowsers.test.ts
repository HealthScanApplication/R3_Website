import { expect, it } from 'vitest';
import { hazardsOf, per100Of } from '../protocolBuilders';
it('reads flat per-100 g nutrition and skips provenance keys', () => {
  expect(per100Of({ fats_g: 0.62, protein_g: 1.36, _derivation: { basis: 'raw' }, note: 'x' })).toEqual({ fats_g: 0.62, protein_g: 1.36 });
  expect(per100Of(null)).toEqual({});
});
it('lists recorded hazards highest level first', () => {
  expect(hazardsOf({ arsenic: { level: 'low' }, lead: { level: 'high' }, cadmium: { level: 'moderate' } }).map((h) => h.key)).toEqual(['lead', 'cadmium', 'arsenic']);
  expect(hazardsOf([])).toEqual([]);
});
import { ingredientForm } from '../protocolBuilders';
it('splits ingredients into whole/raw and processed, with how', () => {
  expect(ingredientForm('Orange juice', null, 'Drinks')).toEqual({ form: 'processed', processing: 'Juice' });
  expect(ingredientForm('Beetroot powder', null, 'Vegetables')).toEqual({ form: 'processed', processing: 'Powder' });
  expect(ingredientForm('Brown Meagre', 'fish, raw', 'Fish & seafood')).toEqual({ form: 'raw', processing: null });
  expect(ingredientForm('Apple', null, 'Fruit')).toEqual({ form: 'raw', processing: null });
  expect(ingredientForm('Xanthan gum', null, 'Additives')).toEqual({ form: 'processed', processing: 'Additive' });
  expect(ingredientForm('Apple purée', null, 'Fruit')).toEqual({ form: 'processed', processing: 'Paste' });
  expect(ingredientForm('Bread', null, 'Grains & bakery')).toEqual({ form: 'processed', processing: 'Baked' });
  expect(ingredientForm('Quinoa', null, 'Grains & bakery')).toEqual({ form: null, processing: null });
});
import { partsOfDay } from '../../components/guides/CatalogBrowsers';
it('splits routine steps into morning, afternoon, evening and rules', () => {
  const g = partsOfDay([{ name: 'Lemon water', time: '06:30' }, { name: 'Burdock', time: '12:30' }, { name: 'Start Sleep', time: '22:00' }, { name: 'Mostly raw', kind: 'rule_do' }] as any);
  expect(g.map((x) => `${x.label}:${x.steps.length}`)).toEqual(['Morning:1', 'Afternoon:1', 'Evening:1', 'Day rules:1']);
});

import { isBasicFor } from '../../components/guides/CatalogBrowsers';
it('puts each rule in the part of the day it belongs to', () => {
  const g = partsOfDay([
    { name: 'Push Day Workout', time: '08:30', subtype: 'exercise', kind: 'action' },
    { name: 'Warm up 5–10 min', subtype: 'exercise', kind: 'rule_do' },
    { name: "Don't train the same muscle group hard two days in a row — rest ~48h", subtype: 'exercise', kind: 'rule_dont' },
    { name: 'Sauna or steam 3x/week', kind: 'rule_do' },
    { name: 'No screens before bed', kind: 'rule_dont' },
    { name: 'Mostly raw plants', kind: 'rule_do' },
  ] as any);
  expect(Object.fromEntries(g.map((x) => [x.label, x.steps.map((s) => s.name)]))).toEqual({
    'Week rules': ["Don't train the same muscle group hard two days in a row — rest ~48h", 'Sauna or steam 3x/week'],
    Morning: ['Push Day Workout', 'Warm up 5–10 min'],
    Evening: ['No screens before bed'],
    'Day rules': ['Mostly raw plants'],
  });
});
it('treats hygiene and sleep as suggested basics outside their own routines', () => {
  expect(isBasicFor({ subtype: 'hygiene', category: 'do', name: 'Brush teeth' }, 'fitness')).toBe(true);
  expect(isBasicFor({ subtype: 'hygiene', category: 'do', name: 'Brush teeth' }, 'hygiene')).toBe(false);
  expect(isBasicFor({ subtype: 'sleep', category: 'sleep', name: 'End Sleep' }, 'fitness')).toBe(true);
  expect(isBasicFor({ subtype: 'exercise', category: 'do', name: 'Push Day Workout' }, 'fitness')).toBe(false);
});
import { stepTree, smartListOfStep } from '../../components/guides/CatalogBrowsers';
it('nests rules and sub-steps under their parent and names the smart list', () => {
  const t = stepTree([{ id: 'm', name: 'Dinner', subtype: 'meal' }, { id: 'r', parentId: 'm', name: 'Chew slowly', kind: 'rule_do' }, { id: 'x', parentId: 'gone', name: 'Orphan' }] as any);
  expect(t.top.map((s) => s.name)).toEqual(['Dinner', 'Orphan']);
  expect(t.kids(t.top[0]).map((s) => s.name)).toEqual(['Chew slowly']);
  expect(smartListOfStep({ subtype: 'supplement' } as any)).toBe('Supplements');
  expect(smartListOfStep({ subtype: 'meal', scope: 'consume' } as any)).toBe('Meals');
  expect(smartListOfStep({ subtype: 'exercise' } as any)).toBe('Fitness');
});
it('lists every-day steps of a multi-day routine once, before the numbered days, and weekly rules by recurrence', () => {
  const g = partsOfDay([
    { name: 'Long run', time: '07:00', day: 2 }, { name: 'Hydrate', time: '08:00', day: null }, { name: 'Intervals', time: '07:00', day: 1 },
    { name: 'Deload', kind: 'rule_do', recurrenceType: 'weekly' },
  ] as any);
  expect(g.map((x) => x.label)).toEqual(['Week rules', 'Every day · Morning', 'Day 1 · Morning', 'Day 2 · Morning']);
});
import { routinePeriod } from '../protocolBuilders';
import { routineCategoryLabel, routineGroupLabel, descriptionParagraphs } from '../../components/guides/CatalogBrowsers';
it('tags each routine with the span it covers and its section', () => {
  const p = (name: string, extra: object = {}) => routinePeriod({ name, description: null, tags: [], ...extra });
  expect(p('K-Beauty • Midday')).toBe('Midday');
  expect(p('K-Beauty • Evening')).toBe('Evening');
  expect(p('28-Day Herbal Protocol')).toBe('Month');
  expect(p('3-Week Herbal Tea Protocol')).toBe('3 weeks');
  expect(p('Weekly Gut Health Reset')).toBe('Week');
  expect(p('Half Marathon Training', { description: '12-week half marathon preparation' })).toBe('12 weeks');
  expect(p('Golden Era Workout')).toBe('Day');
  expect(routineCategoryLabel('skin & face')).toBe('Beauty');
  expect(routineCategoryLabel('Strength')).toBe('Fitness');
  expect(descriptionParagraphs('A reset. ### The steps A mist. **Morning SPF wears off.** Done')).toEqual(['A reset.', 'The steps A mist. Morning SPF wears off. Done']);
});
it('removes redundant AM and PM session wording from workout groups', () => {
  expect(routineGroupLabel('AM Session — Chest & Back')).toBe('Chest & Back');
  expect(routineGroupLabel('PM Session - Shoulders & Arms')).toBe('Shoulders & Arms');
  expect(routineGroupLabel('AM Session')).toBeNull();
  expect(routineGroupLabel('Mobility')).toBe('Mobility');
});
import { byPeriod } from '../../components/guides/CatalogBrowsers';
it('groups routines by span in day order', () => {
  const r = (name: string) => ({ id: name, name, description: null, image: null, category: null, tags: [] });
  expect(byPeriod([r('Weekly Reset'), r('K-Beauty • Evening'), r('Leg Day Workout'), r('28-Day Herbal'), r('3-Week Tea'), r('Morning Glow')]).map(([p]) => p)).toEqual(['Morning', 'Evening', 'Day', 'Week', '3 weeks', 'Month']);
});
import { routinePhases, phaseOf } from '../../components/guides/CatalogBrowsers';
it('reads named phases from a description and files binder rules under supplements', () => {
  const ph = routinePhases('Phases • Days 1–20, Heavy Metal Detox: 1 capsule. • Days 21–22, Para Cleanse introduction: 1 capsule. • Days 25–30, full Para Cleanse: 1 before.');
  expect(ph.map((p) => [p.from, p.to, p.name])).toEqual([[1, 20, 'Heavy Metal Detox'], [21, 22, 'Para Cleanse introduction'], [25, 30, 'full Para Cleanse']]);
  expect(phaseOf(ph, 23)).toBeNull();
  expect(phaseOf(ph, 26)).toBe('full Para Cleanse');
  expect(smartListOfStep({ name: 'Binder 2 h from everything', kind: 'rule_do' } as any)).toBe('Supplements');
  expect(smartListOfStep({ name: 'Follow every label', kind: 'rule_do' } as any)).toBe('Supplements');
});
import { bySmartList } from '../../components/guides/CatalogBrowsers';
it('orders a part of the day into smart lists in order of first appearance', () => {
  const r = bySmartList([{ name: 'Cleanse', subtype: 'hygiene' }, { name: 'Collagen', subtype: 'supplement' }, { name: 'Lunch', subtype: 'meal' }, { name: 'Wash face', subtype: 'hygiene' }, { name: 'Zinc', subtype: 'supplement' }] as any);
  expect(r.map((s) => s.name)).toEqual(['Cleanse', 'Wash face', 'Collagen', 'Zinc', 'Lunch']);
});
import { protocolDiet, mealSlotOf } from '../protocolBuilders';
import { smartListBlocks, GENERIC_MEAL } from '../../components/guides/CatalogBrowsers';
it('reads the diet from a Protocol\'s rules and suggests only for generic meal slots', () => {
  const d = protocolDiet(['Whole plant foods only', 'No added sugar or sweeteners', 'No yeast-leavened bread']);
  expect(d.diet).toBe('vegan');
  expect(d.avoid!.test('Chocolate Brownie')).toBe(true);
  expect(d.avoid!.test('Lentil stew')).toBe(false);
  expect(GENERIC_MEAL.test('Breakfast') && GENERIC_MEAL.test('Afternoon Snack') && GENERIC_MEAL.test('Dinner meal')).toBe(true);
  expect(GENERIC_MEAL.test('Oats with berries and walnuts')).toBe(false);
  expect(mealSlotOf('Morning Snack', null, '10:00')).toBe('Snack');
  expect(mealSlotOf('Meal', null, '19:00')).toBe('Dinner');
});
it('puts a smart list\'s rules beside its steps, each rule once with the steps it applies to', () => {
  const steps = [{ id: 'b', name: 'Breakfast', subtype: 'meal', time: '07:00' }, { id: 'l', name: 'Lunch', subtype: 'meal', time: '12:00' }, { name: 'No juice or soda', kind: 'rule_dont', subtype: 'drink', scope: 'consume' }] as any;
  const kids = (s: any) => (s.id === 'b' || s.id === 'l' ? [{ name: 'Chew slowly', kind: 'rule_do', parentId: s.id }] : []) as any;
  const [[list, acts, rules]] = smartListBlocks(steps, kids);
  expect(list).toBe('Meals');
  expect(acts.map((a) => a.name)).toEqual(['Breakfast', 'Lunch']);
  expect(rules).toEqual([{ name: 'No juice or soda', dont: true, on: [] }, { name: 'Chew slowly', dont: false, on: ['Breakfast', 'Lunch'] }]);
});
it('files a label rule by what it is about', () => {
  expect(smartListOfStep({ name: 'Check food labels for added sugar', kind: 'rule_do' } as any)).toBe('Meals');
  expect(smartListOfStep({ name: 'Check label: T. chebula', kind: 'rule_do' } as any)).toBe('Supplements');
});
import { mergeHygieneSets } from '../../components/guides/CatalogBrowsers';
it('merges the Morning hygiene set into the Hygiene list', () => {
  const steps = [
    { id: 'c', name: 'Gentle Cleanse', time: '06:30', subtype: 'hygiene', kind: 'action' },
    { id: 'h', name: 'Morning hygiene', time: '07:10', subtype: 'hygiene', category: 'do', itemType: 'activity', kind: 'action' },
    { id: 't', parentId: 'h', name: 'Scrape tongue', kind: 'action' },
    { id: 'b', parentId: 'h', name: 'Brush teeth', kind: 'action', time: '07:12' },
    { id: 'r', parentId: 'h', name: 'Use fluoride-free paste', kind: 'rule_do' },
    { id: 's', name: 'Zinc', time: '07:30', subtype: 'supplement', kind: 'action' },
  ] as any;
  const m = mergeHygieneSets(steps);
  expect(m.map((x) => x.name)).toEqual(['Gentle Cleanse', 'Scrape tongue', 'Brush teeth', 'Use fluoride-free paste', 'Zinc']);
  expect(m[1]).toMatchObject({ parentId: null, time: '07:10', subtype: 'hygiene' });
  expect(m[2].time).toBe('07:12');
  expect(smartListOfStep(m[1])).toBe('Hygiene');
  expect(mergeHygieneSets([{ id: 'x', name: 'Morning hygiene', subtype: 'hygiene' }] as any)).toHaveLength(1); // a set with no steps is left alone
});
import { expandWeekly, WEEKDAYS_FULL } from '../../components/guides/CatalogBrowsers';
it('shows a repeating week by weekday, with every-day steps and week rules kept once', () => {
  const steps = [
    { id: 'a', name: 'Long Run', time: '07:00', recurrenceType: 'weekly', dows: [0], kind: 'action' },
    { id: 'b', name: 'Tempo Run', time: '07:00', recurrenceType: 'weekly', dows: [2, 4], kind: 'action' },
    { id: 'c', parentId: 'b', name: 'Warm up', kind: 'rule_do' },
    { id: 'd', name: 'Lunch', time: '12:30', kind: 'action' },
    { id: 'e', name: 'Progress each week', kind: 'rule_do', recurrenceType: 'weekly', dows: [0] },
  ] as any;
  const { steps: out, weekdays } = expandWeekly(steps);
  expect(weekdays).toBe(true);
  expect(out.filter((s) => s.name === 'Tempo Run').map((s) => s.day)).toEqual([2, 4]);
  expect(out.find((s) => s.name === 'Long Run')!.day).toBe(7);
  expect(out.filter((s) => s.name === 'Warm up').map((s) => `${s.day}:${s.parentId}`)).toEqual(['2:b@2', '4:b@4']);
  expect(out.filter((s) => s.name === 'Lunch' || s.name === 'Progress each week')).toHaveLength(2);
  expect(partsOfDay(out.filter((s) => !s.parentId), (d) => WEEKDAYS_FULL[d - 1]).map((g) => g.label)).toEqual(['Week rules', 'Every day · Afternoon', 'Tuesday · Morning', 'Thursday · Morning', 'Sunday · Morning']);
  // a numbered-day cycle is left alone
  expect(expandWeekly([{ id: 'x', name: 'A', day: 3, recurrenceType: 'weekly', dows: [1] }] as any).weekdays).toBe(false);
});
