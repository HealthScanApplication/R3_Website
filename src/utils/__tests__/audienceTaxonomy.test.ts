import { describe, expect, it } from 'vitest';
import { AGE_RANGES, LIFE_STAGES, PROBLEM_AREAS, audienceRelevance, defaultAudience, describeAudience, focusTerms, isTargetableProblem, problemAreaOf, problemLabel, problemsFor, solutionScore, withPopulation, type CatalogProblem } from '../audienceTaxonomy';

describe('audience', () => {
  it('keeps age and life stage valid for the chosen population', () => {
    const a = { population: 'Women' as const, age: 'Women 45–64', stage: 'Menopause' };
    expect(withPopulation(a, 'Women')).toEqual(a);
    expect(withPopulation(a, 'Men')).toEqual({ population: 'Men', age: 'All ages', stage: 'Not specified' });
    expect(withPopulation({ ...a, stage: 'Healthy ageing' }, 'Everyone').stage).toBe('Healthy ageing');
    for (const p of ['Everyone', 'Women', 'Men', 'Children'] as const) { expect(AGE_RANGES[p].length).toBeGreaterThan(3); expect(LIFE_STAGES[p][0]).toBe('Not specified'); }
  });
  it('describes the audience as a short line', () => {
    expect(describeAudience(defaultAudience())).toBe('Everyone');
    expect(describeAudience({ population: 'Women', age: 'Women 45–64', stage: 'Menopause' })).toBe('Women 45–64 · Menopause');
    expect(describeAudience({ population: 'Children', age: 'Toddlers 1–3', stage: 'Not specified' })).toBe('Toddlers 1–3');
    expect(describeAudience({ population: 'Women', age: 'Teens 13–17', stage: 'Puberty' })).toBe('Teen girls 13–17 · Puberty');
    expect(describeAudience({ population: 'Men', age: 'All ages', stage: 'Fatherhood' })).toBe('Men · Fatherhood');
  });
});

const p = (name: string, body_system: string, extra: Partial<CatalogProblem> = {}): CatalogProblem => ({ id: name.toLowerCase(), name, body_system, ...extra });
describe('problems from the symptom catalog', () => {
  it('maps messy body systems onto friendly areas', () => {
    expect(problemAreaOf(p('Insomnia', 'brain'))).toBe('mind');
    expect(problemAreaOf(p('Migraine', 'Nervous'))).toBe('mind');
    expect(problemAreaOf(p('Bloating', 'Digestive'))).toBe('gut');
    expect(problemAreaOf(p('Acne', 'integumentary'))).toBe('skin');
    expect(problemAreaOf(p('Hot flushes', 'Endocrine'))).toBe('hormones');
    expect(problemAreaOf(p('Fatigue', 'Multi-system'))).toBe('general');
    expect(PROBLEM_AREAS.at(-1)?.id).toBe('general');
  });
  it('drops clinical oncology, poisonings and filler, and tidies names', () => {
    expect(isTargetableProblem(p('Lymphoma', 'Lymphatic', { category: 'Oncological' }))).toBe(false);
    expect(isTargetableProblem(p('Placeholder', 'Multi-system'))).toBe(false);
    expect(isTargetableProblem(p('Insomnia', 'brain'))).toBe(true);
    expect(problemLabel(p('Chloracne.', 'Integumentary'))).toBe('Chloracne');
    expect(problemLabel(p('Pruritus', 'skin', { lay_term: 'Itchy skin' }))).toBe('Itchy skin');
  });
  it('ranks problems for the audience using recorded at-risk groups', () => {
    const women = { population: 'Women' as const, age: 'Women 45–64', stage: 'Menopause' };
    const hot = p('Hot flushes', 'Endocrine', { population_risk: '["women","menopause"]' });
    const thyroid = p('Hypothyroidism', 'Endocrine', { population_risk: ['elderly'] });
    expect(audienceRelevance(hot, women)).toBe(4);
    expect(audienceRelevance(thyroid, women)).toBe(0);
    expect(problemsFor([thyroid, hot, p('Lymphoma', 'Endocrine', { category: 'Oncological' })], 'hormones', '', women).map((x) => x.name)).toEqual(['Hot flushes', 'Hypothyroidism']);
    expect(problemsFor([thyroid, hot], null, 'thyro', women).map((x) => x.name)).toEqual(['Hypothyroidism']);
  });
});

describe('matching solutions to the focus', () => {
  const a = { population: 'Women' as const, age: 'Women 45–64', stage: 'Menopause' };
  it('turns a focus into match terms with common synonyms', () => {
    expect(focusTerms({ kind: 'goal', area: 'health', label: 'Sleep better' })).toEqual(expect.arrayContaining(['sleep', 'insomnia']));
    expect(focusTerms({ kind: 'problem', area: 'mind', label: 'Insomnia' })).toEqual(expect.arrayContaining(['insomnia', 'sleep']));
  });
  it('scores offers and Protocols by focus words, then audience', () => {
    const focus = { kind: 'goal' as const, area: 'health', label: 'Sleep better' };
    expect(solutionScore('7-day menopause sleep challenge for women', focus, a)).toBeGreaterThan(solutionScore('Morning sleep routine', focus, a));
    expect(solutionScore('Strength for beginners', focus, a)).toBe(0);
    expect(solutionScore('anything', null, a)).toBe(0);
  });
});
