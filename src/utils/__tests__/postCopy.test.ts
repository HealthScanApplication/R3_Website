import { describe, expect, it } from 'vitest';
import { HEADLINE_MAX, SUBLINE_MAX, daysIn, parseAudience, postCopy, words } from '../postCopy';

describe('postCopy', () => {
  it('writes for the audience and the problem', () => {
    expect(postCopy({ audience: 'Women · 40–55 · Menopause', problem: 'Sleep', offer: { title: '7-day menopause sleep challenge for women', free: true } }))
      .toEqual({ headline: 'Sleep through menopause', subline: '7 nights. One evening routine.', cta: 'Join the challenge' });
    expect(postCopy({ audience: 'Everyone', problem: 'Sleep' })).toEqual({ headline: 'Sleep better tonight', subline: 'One evening routine.', cta: 'Get routine' });
    expect(postCopy({ audience: 'Men 45–64', problem: 'Low energy' }).headline).toBe('More energy for men');
    expect(postCopy({ audience: 'Women 45–64 · Pregnancy', problem: 'Stress', offer: { title: 'Calm plan', free: false } })).toMatchObject({ headline: 'Calmer through pregnancy', cta: 'Start the Protocol' });
  });
  it('drops a life stage that is the topic itself', () => {
    expect(postCopy({ audience: 'Women · Menopause', problem: 'Menopause' }).headline).toBe('Menopause support for women');
  });
  it('finds the topic in the offer when the problem is generic', () => {
    expect(postCopy({ audience: 'Everyone', problem: 'Wellbeing', offer: { title: 'Gut reset week', description: 'A 14-day plan.' } })).toMatchObject({ headline: 'Look after your gut', subline: '14 days. Meals and habits for digestion.' });
  });
  it('falls back to a clean "<Problem>, handled"', () => {
    expect(postCopy({ audience: 'Everyone', problem: 'Tinnitus problems' })).toMatchObject({ headline: 'Tinnitus, handled', subline: 'One short daily routine.' });
  });
  it('writes recipes and Protocols from their facts', () => {
    expect(postCopy({ kind: 'recipe', audience: 'Everyone', problem: 'Gut', offer: { title: 'Ginger miso soup', ingredients: 6, minutes: 20 } }))
      .toEqual({ headline: 'Ginger miso soup', subline: '6 ingredients · 20 min', cta: 'Get the recipe' });
    expect(postCopy({ kind: 'recipe', audience: 'Everyone', problem: 'Sleep', offer: { title: 'Warm turmeric oat milk with honey and cinnamon' } }).headline).toBe('Warm turmeric oat milk with');
    expect(postCopy({ kind: 'protocol', audience: 'Everyone', problem: 'Sleep', offer: { title: 'Deep sleep', days: 21 } }))
      .toEqual({ headline: 'Better, steadier sleep', subline: '21 days · one evening routine', cta: 'Start the Protocol' });
  });
  it('never says the old filler, and stays inside the word limits', () => {
    const audiences = ['Everyone', 'Women 45–64 · Menopause', 'Teen girls 13–17', 'Men · 65+', 'Toddlers 1–3', 'Women · 18–29 · Pregnancy'];
    const problems = ['Sleep', 'Stress', 'Low energy', 'Gut', 'Weight', 'Skin', 'Back pain', 'Focus', 'Hydration', 'Fitness', 'Healthy eating', 'Hormones', 'Morning routine', 'Something rare'];
    for (const audience of audiences) for (const problem of problems) for (const kind of ['offer', 'protocol', 'recipe', 'none'] as const) {
      const c = postCopy({ audience, problem, kind, offer: { title: 'A 30-day plan with a rather long descriptive name indeed', free: true } });
      expect(words(c.headline), `${audience}/${problem}/${kind}: ${c.headline}`).toBeLessThanOrEqual(HEADLINE_MAX);
      expect(words(c.subline), `${audience}/${problem}/${kind}: ${c.subline}`).toBeLessThanOrEqual(SUBLINE_MAX);
      expect(`${c.headline} ${c.subline}`).not.toMatch(/simple routine|early result|cure|guarante/i);
    }
  });
  it('matches topics on whole words', () => {
    expect(postCopy({ audience: 'Everyone', problem: 'Shortness of breath' }).headline).toBe('Shortness of breath, handled');
    expect(postCopy({ audience: 'Everyone', problem: 'Eating habits' }).headline).toBe('Eat well, every day');
  });
  it('treats only known life stages as stages', () => {
    expect(parseAudience('Women 18–65 · Athletes')).toEqual({ group: 'women', stage: null });
    expect(postCopy({ audience: 'Women 18–65 · Athletes', problem: 'Sleep' }).headline).toBe('Better sleep for women');
  });
  it('parses audiences and lengths', () => {
    expect(parseAudience('Women 45–64 · Menopause')).toEqual({ group: 'women', stage: 'menopause' });
    expect(parseAudience('Everyone')).toEqual({ group: null, stage: null });
    expect(parseAudience('Men · 65+ · Not specified')).toEqual({ group: 'men', stage: null });
    expect(daysIn('4-week strength plan')).toBe(28);
    expect(daysIn('14 nights of better rest')).toBe(14);
    expect(daysIn('No length here')).toBeNull();
  });
});
