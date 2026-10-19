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
