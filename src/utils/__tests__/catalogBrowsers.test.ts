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
