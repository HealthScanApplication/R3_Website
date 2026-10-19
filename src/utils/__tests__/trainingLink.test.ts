import { describe, expect, it } from 'vitest';
import { trainingFuel, type DietConfig, type FitnessConfig, type SupplementPick } from '../protocolBuilders';
import { dietByDay, linkIssues, trainingByDay } from '../trainingLink';

const creatine: SupplementPick = { id: 'sup-creatine', name: 'Creatine', source: 'supplement', image: null };
const session = (day: number, time: string, title = 'Leg day', minutes = 40) => ({ day, time, anchor: 'clock' as const, offset: 0, title, minutes, intensity: 'moderate' as const, exercises: [] });
const fitness = (extra: Partial<FitnessConfig> = {}): FitnessConfig => ({
  goal: 'general', level: 'beginner', minutes: 40, sessions: [session(1, '07:00'), session(3, '18:00', 'Tennis', 60)],
  fuel: { pre: ['Banana'], post: [creatine, 'Protein shake'], preMinutes: 30, postMinutes: 15 }, ...extra,
});
const diet = (extra: Partial<DietConfig> = {}): DietConfig => ({ framework: 'balanced', kcal: 2000, protein: 20, carbs: 50, fat: 30, slots: ['breakfast', 'lunch', 'dinner'], plan: {}, ...extra });

describe('training fuel', () => {
  it('times pre fuel before the start and post fuel after the session ends', () => {
    expect(trainingFuel(fitness()).map((f) => [f.day, f.when, f.time])).toEqual([[1, 'pre', '06:30'], [1, 'post', '07:55'], [3, 'pre', '17:30'], [3, 'post', '19:15']]);
  });
  it('makes no fuel without a fuel plan, and skips empty sides', () => {
    expect(trainingFuel(fitness({ fuel: undefined }))).toEqual([]);
    expect(trainingFuel(fitness({ fuel: { pre: [' '], post: ['Water'], preMinutes: 30, postMinutes: 0 } })).map((f) => f.when)).toEqual(['post', 'post']);
  });
});

describe('diet and fitness side by side', () => {
  it('lists only training days, with their fuel', () => {
    const days = trainingByDay(fitness());
    expect(days.map((d) => [d.day, d.sessions[0].title, d.fuel.length])).toEqual([[1, 'Leg day', 2], [3, 'Tennis', 2]]);
  });
  it('lists every day of the diet with meal times and supplements', () => {
    const d = dietByDay(diet({ supplements: { morning: [creatine] } }));
    expect(d).toHaveLength(7);
    expect(d[0].meals.map((m) => m.label)).toEqual(['Breakfast', 'Lunch', 'Dinner']);
    expect(d[0].supplements).toMatchObject([{ name: 'Creatine', time: '08:00' }]);
  });
  it('agrees when nothing overlaps', () => {
    expect(linkIssues(diet(), fitness())).toEqual([]);
  });
  it('flags training and fuel inside a fasting window', () => {
    const fasting = diet({ fasting: { type: 'intermittent', start: '20:00', end: '12:00', days: [7, 1, 2, 3, 4, 5, 6] } });
    const issues = linkIssues(fasting, fitness());
    expect(issues.filter((i) => i.kind === 'training_while_fasting').map((i) => i.day)).toEqual([1]); // Mon 07:00, not Wed 18:00
    expect(issues.filter((i) => i.kind === 'fuel_while_fasting').map((i) => i.day)).toEqual([1, 1]);   // 06:30 and 07:55
  });
  it('flags a fuel supplement the diet already gives that day, once per item', () => {
    const issues = linkIssues(diet({ supplements: { morning: [creatine], evening: [{ ...creatine }] } }), fitness());
    expect(issues.filter((i) => i.kind === 'duplicate_supplement').map((i) => [i.day, i.message])).toEqual([
      [1, 'Mon: Creatine is already in the Diet supplements at 08:00.'],
      [3, 'Wed: Creatine is already in the Diet supplements at 08:00.'],
    ]);
  });
  it('matches free-text fuel to diet supplements by name', () => {
    const issues = linkIssues(diet({ supplements: { evening: ['protein shake'] } }), fitness());
    expect(issues.filter((i) => i.kind === 'duplicate_supplement')).toHaveLength(2);
  });
});
