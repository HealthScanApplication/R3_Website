import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { DietPralSummary } from '../../components/guides/DietPralSummary';
import { DietNutritionPanel } from '../../components/guides/DietNutritionPanel';
import { aggregateDiet, type DietTotals } from '../dietNutrition';
import type { DietConfig } from '../protocolBuilders';
import type { PralTotal } from '../pral';

const base = (pral: PralTotal, meals: DietTotals['pralMeals'] = [], ingredients: DietTotals['ingredients'] = []): DietTotals =>
  ({ count: 1, unlinked: 0, unassessed: 0, nutrients: {}, hazards: [], ingredients, pral, pralMeals: meals });
const html = (t: DietTotals) => renderToStaticMarkup(<DietPralSummary totals={t} enabled expanded />);
const FORBIDDEN = /alkalin|alkalis|acidif|acid-forming|detox|cleanse|good|bad|target:|goal|healthy/i;

it('all sourced: shows the total with the label, basis and caveats', () => {
  const out = html(base({ total: -3.24, withValue: 2, count: 2, notApplicable: 0, rule: 0 }, [{ name: 'Stew', pral: { total: -3.24, withValue: 2, count: 2, notApplicable: 0, rule: 0 } }]));
  expect(out).toContain('PRAL (acid/base load)');
  expect(out).toContain('-3.2 mEq');
  expect(out).toContain('not the pH of the blood');
  expect(out).toContain('not a target');
  expect(out).toContain('Remer &amp; Manz (1995)');
  expect(out).toContain('pral-remer-v1');
  expect(out).toContain('Not medical advice.');
  expect(out.replace('potential renal acid load', '')).not.toMatch(FORBIDDEN);
  expect(out).not.toMatch(/#E88A7A|#E8B86A|green|red/);
});
it('partial: no partial sum, shows N of M items have a value', () => {
  const out = html(base({ total: null, withValue: 1, count: 3, notApplicable: 0, rule: 0 }));
  expect(out).toContain('— 1 of 3 items have a value');
  expect(out).not.toContain(' 0 mEq');
});
it('rule, not applicable and missing ingredients each get their own wording', () => {
  const ing = (name: string, pral: any, pralRule?: boolean) => ({ name, grams: 100, per100: {}, hazards: [], pral, pralRule });
  const out = html(base({ total: null, withValue: 1, count: 3, notApplicable: 1, rule: 1 }, [], [ing('Water', 0, true), ing('Wine', 'not_applicable'), ing('Mystery', null), ing('Lentils', -2.5)]));
  expect(out).toContain('about 0 (rule: water)');
  expect(out).toContain('Not applicable to this food type');
  expect(out).toContain('— not enough sourced data');
  expect(out).toContain('-2.5 mEq per 100 g');
  expect(out).toContain('1 not applicable to this food type.');
});
it('flag off renders nothing new, including inside the planner panel (whatever the env says)', async () => {
  expect(renderToStaticMarkup(<DietPralSummary enabled={false} totals={base({ total: 1, withValue: 1, count: 1, notApplicable: 0, rule: 0 })} />)).toBe('');
  vi.resetModules(); vi.stubEnv('VITE_PRAL_DISPLAY', 'false');
  const { DietNutritionPanel: Panel } = await import('../../components/guides/DietNutritionPanel');
  const cfg: DietConfig = { framework: 'balanced', kcal: 2000, protein: 20, carbs: 50, fat: 30, slots: ['breakfast'], plan: {}, drinks: { breakfast: [] } };
  expect(renderToStaticMarkup(<Panel report={aggregateDiet(cfg)} loading={false} error="" />)).not.toContain('PRAL');
  vi.unstubAllEnvs(); vi.resetModules();
});
