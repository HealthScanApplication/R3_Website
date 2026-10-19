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
import { hazardAdjustedScore } from '../protocolBuilders';
it('lowers the health score for recorded hazards', () => {
  // Baby spinach: high lead and cadmium, low oxalates and perchlorate, trace phytates.
  const h = ['high', 'high', 'low', 'low', 'trace'].map((level, i) => ({ key: `k${i}`, level }));
  expect(hazardAdjustedScore(100, h)).toBe(72);
  expect(hazardAdjustedScore(100, [])).toBe(100);
  expect(hazardAdjustedScore(30, Array(9).fill({ key: 'x', level: 'high' }))).toBe(0);
  expect(hazardAdjustedScore(null, h)).toBeNull();
});
