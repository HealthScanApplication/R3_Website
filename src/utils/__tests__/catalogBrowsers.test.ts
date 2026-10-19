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
  expect(g.map((x) => `${x.label}:${x.steps.length}`)).toEqual(['Morning:1', 'Afternoon:1', 'Evening:1', 'Rules:1']);
});
