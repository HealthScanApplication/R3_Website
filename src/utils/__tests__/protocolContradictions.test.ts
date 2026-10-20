import { describe, it, expect, vi } from 'vitest';
import { combineProtocols, conflictsAcross, findConflicts, findProtocolConflicts, reviewCombined, reviewDiet, reviewFitness, type DietConfig, type FitnessConfig } from '../protocolBuilders';
import { ruleLevelOf } from '../routineStandard';
import type { AdminProtocol, AdminProtocolItem } from '../protocolAdmin';

let n = 0;
const item = (p: Partial<AdminProtocolItem>): AdminProtocolItem => ({ id: `i${++n}`, display_name: '', kind: 'action', category: 'move', subtype: null, parent_protocol_item_id: null, recurrence_days_of_week: null, hidden: false, ...p } as AdminProtocolItem);
const rule = (text: string, p: Partial<AdminProtocolItem> = {}) => item({ display_name: text, kind: /^(rest|do)\b/i.test(text) ? 'rule_do' : 'rule_dont', ...p });
const session = (title: string, dow: number, p: Partial<AdminProtocolItem> = {}) => item({ display_name: title, subtype: 'exercise', recurrence_days_of_week: [dow], ...p });

describe('ruleLevelOf: a rule sits on an activity, a day or the week', () => {
  it('is an activity rule when it has a parent step', () => expect(ruleLevelOf({ parent_protocol_item_id: 'x', recurrence_days_of_week: [3] })).toBe('activity'));
  it('is a day rule when it names 1–6 weekdays', () => {
    expect(ruleLevelOf({ recurrence_days_of_week: [3] })).toBe('day');
    expect(ruleLevelOf({ recurrence_days_of_week: [1, 2, 3, 4, 5, 6] })).toBe('day');
  });
  it('is a week rule when it names no day or every day', () => {
    expect(ruleLevelOf({})).toBe('week');
    expect(ruleLevelOf({ recurrence_days_of_week: [] })).toBe('week');
    expect(ruleLevelOf({ recurrence_days_of_week: [0, 1, 2, 3, 4, 5, 6] })).toBe('week');
  });
});

describe('findProtocolConflicts: the two cases from the Guardian routines', () => {
  it('flags a scheduled Walk against "Rest on Wednesday"', () => {
    const found = findProtocolConflicts('Week', [rule('Rest on Wednesday'), session('Walk 40 minutes', 3), session('Walk 40 minutes', 2)]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'Rest on Wednesday', item: 'Walk 40 minutes', reason: expect.stringMatching(/rest day/) });
  });
  it('flags Treadmill Walk and Run against a "Don\'t treadmill" rule', () => {
    const found = findProtocolConflicts('Week', [rule("Don't treadmill"), session('Treadmill Walk and Run', 2), session('Walk 30 minutes', 4)]);
    expect(found.map((c) => c.item)).toEqual(['Treadmill Walk and Run']);
  });
  it('flags nothing when the plan does not contradict itself', () => {
    expect(findProtocolConflicts('Week', [rule('Rest on Wednesday'), session('Walk 40 minutes', 2), session('Walk 40 minutes', 4)])).toEqual([]);
  });
  it('gives every conflict a stable id of rule>item for the decision map', () => {
    const r = rule('Rest on Wednesday'); const s = session('Walk 40 minutes', 3);
    expect(findProtocolConflicts('Week', [r, s])[0]).toMatchObject({ ruleId: r.id, itemId: s.id, id: `${r.id}>${s.id}` });
  });
});

describe('a rule only conflicts with what it covers', () => {
  it('an activity rule covers its own activity and that activity\'s children, not the rest of the week', () => {
    const walk = session('Treadmill Walk', 2); const other = session('Treadmill Run', 4);
    const r = rule("Don't treadmill", { parent_protocol_item_id: walk.id });
    expect(findProtocolConflicts('Week', [walk, other, r]).map((c) => c.item)).toEqual(['Treadmill Walk']);
  });
  it('a day rule covers only the listed weekdays', () => {
    const items = [rule('No coffee', { recurrence_days_of_week: [2] }), item({ display_name: 'Drink Coffee', category: 'consume', recurrence_days_of_week: [2] }), item({ display_name: 'Drink Coffee', category: 'consume', recurrence_days_of_week: [5] })];
    expect(findProtocolConflicts('Week', items)).toHaveLength(1);
  });
  it('a week rule covers every day', () => {
    const items = [rule('No coffee'), item({ display_name: 'Drink Coffee', category: 'consume', recurrence_days_of_week: [2] }), item({ display_name: 'Drink Coffee', category: 'consume', recurrence_days_of_week: [5] })];
    expect(findProtocolConflicts('Week', items)).toHaveLength(2);
  });
  it('two steps with the same name on different days are two contradictions, each with its weekday', () => {
    const found = findProtocolConflicts('Week', [rule('No coffee'), item({ display_name: 'Drink Coffee', category: 'consume', recurrence_days_of_week: [2] }), item({ display_name: 'Drink Coffee', category: 'consume', recurrence_days_of_week: [5] })]);
    expect(found.map((c) => c.where)).toEqual(['Week · Tue', 'Week · Fri']);
    expect(new Set(found.map((c) => c.id)).size).toBe(2);
    expect(found.every((c) => c.itemSource === 'Week')).toBe(true);
  });
  it('a day-level "Rest on Sunday" rule does not rest the other days', () => {
    expect(findProtocolConflicts('Week', [rule('Rest', { recurrence_days_of_week: [0] }), session('Walk 40 minutes', 3)])).toEqual([]);
    expect(findProtocolConflicts('Week', [rule('Rest', { recurrence_days_of_week: [0] }), session('Walk 40 minutes', 0)])).toHaveLength(1);
  });
  it('a do and a don\'t about the same thing conflict only where they overlap', () => {
    const together = findProtocolConflicts('Week', [rule('Avoid sugar'), rule('Do sweeten tea with honey')]);
    expect(together).toHaveLength(1);
    const apart = findProtocolConflicts('Week', [rule('Avoid sugar', { recurrence_days_of_week: [1] }), rule('Do sweeten tea with honey', { recurrence_days_of_week: [4] })]);
    expect(apart).toEqual([]);
  });
});

describe('findConflicts directly', () => {
  it('ignores hidden-day steps that are not on a covered day', () => {
    const rules = [{ text: 'Rest on Wednesday', scope: 'Plan', isDont: false }];
    const items = [{ title: 'Walk 40 minutes', where: 'Mon', day: 1, kind: 'session' as const }, { title: 'Walk 40 minutes', where: 'Wed', day: 3, kind: 'session' as const }];
    expect(findConflicts(rules, items).map((c) => c.where)).toEqual(['Wed']);
  });
});

describe('builders block a contradiction inside one plan', () => {
  const fitness = (sessions: FitnessConfig['sessions'], rules: string[]): FitnessConfig => ({ goal: 'general', level: 'beginner', minutes: 30, sessions, rules });
  const walk = (day: number): FitnessConfig['sessions'][number] => ({ day, time: '07:00', title: 'Walk 40 minutes', minutes: 40, intensity: 'low', exercises: [] });
  it('a fitness plan with a Wednesday session and "Rest on Wednesday" cannot be saved', () => {
    const review = reviewFitness(fitness([walk(3)], ['Rest on Wednesday']));
    expect(review.conflicts).toHaveLength(1);
    expect(review.blocking.some((b) => /contradict/.test(b.message))).toBe(true);
  });
  it('the same plan without the Wednesday session is clean', () => {
    const review = reviewFitness(fitness([walk(2)], ['Rest on Wednesday']));
    expect(review.conflicts).toEqual([]);
    expect(review.blocking).toEqual([]);
  });
  it('a diet plan with a caffeine rule and a coffee drink cannot be saved', () => {
    const cfg: DietConfig = { framework: 'balanced', kcal: 2000, protein: 20, carbs: 50, fat: 30, slots: ['breakfast'], plan: {}, rules: ['Avoid caffeine'],
      drinkPlan: { '1:breakfast': [{ source: 'catalog', id: 'c', name: 'Coffee', image: null, nutrition: null }] } } as unknown as DietConfig;
    const review = reviewDiet(cfg);
    expect(review.conflicts.some((c) => c.item === 'Coffee')).toBe(true);
    expect(review.blocking.some((b) => /Coffee/.test(b.message))).toBe(true);
  });
});

describe('combining Protocols: an overlap is the user\'s to decide', () => {
  const fitnessPlan = [rule("Don't treadmill"), session('Walk 30 minutes', 2)];
  const walks = [session('Treadmill Walk and Run', 4)];

  it('finds the contradiction across two Protocols and says which Protocol each side is from', () => {
    const found = conflictsAcross([{ name: 'Rules', items: fitnessPlan }, { name: 'Cardio', items: walks }]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: "Don't treadmill", item: 'Treadmill Walk and Run', ruleSource: 'Rules', itemSource: 'Cardio', canKeepRule: true, canKeepItem: true });
  });
  it('a side that lives in a linked diet or fitness plan cannot be dropped', () => {
    // The step is in a linked plan: "keep the rule" would have to drop that step, so it is not offered; dropping the rule is fine.
    const [c] = conflictsAcross([{ name: 'Rules', items: fitnessPlan }, { name: 'Cardio', items: walks, cloned: true }]);
    expect(c.canKeepRule).toBe(false);
    expect(c.canKeepItem).toBe(true);
    const [d] = conflictsAcross([{ name: 'Rules', items: fitnessPlan, cloned: true }, { name: 'Cardio', items: walks, cloned: true }]);
    expect(d.canKeepRule).toBe(false);
    expect(d.canKeepItem).toBe(false);
  });
  it('blocks combining only when neither side can be dropped', () => {
    const open = reviewCombined([{ name: 'Rules', items: fitnessPlan }, { name: 'Cardio', items: walks }]);
    expect(open.conflicts).toHaveLength(1);
    expect(open.blocking).toEqual([]);
    const stuck = reviewCombined([{ name: 'Rules', items: fitnessPlan, cloned: true }, { name: 'Cardio', items: walks, cloned: true }]);
    expect(stuck.blocking).toHaveLength(1);
  });
  it('two Protocols that do not overlap combine with no decisions', () => {
    const review = reviewCombined([{ name: 'Rules', items: [rule('Avoid sugar')] }, { name: 'Cardio', items: [session('Walk 30 minutes', 2)] }]);
    expect(review.conflicts).toEqual([]);
  });
});

describe('combineProtocols applies the user\'s decisions', () => {
  const proto = (id: string, name: string): AdminProtocol => ({ id, name, total_days: 7 } as AdminProtocol);
  const rules = [rule('Rest on Wednesday')];
  const walk = session('Walk 40 minutes', 3);
  const sources = [proto('p-rules', 'Rules'), proto('p-cardio', 'Cardio')];

  async function run(decisions: Record<string, 'rule' | 'item'>, cloned: string[] = []) {
    const created: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (init?.method === 'POST' && url.endsWith('/protocol_items')) { created.push(body.display_name); return new Response(JSON.stringify([{ id: `new-${created.length}`, ...body }])); }
      if (init?.method === 'POST' && url.endsWith('/protocols')) return new Response(JSON.stringify([{ id: 'combined', ...body }]));
      if (url.includes('/protocol_items') && (!init?.method || init.method === 'GET')) return new Response(JSON.stringify(url.includes('p-rules') ? rules : url.includes('p-cardio') ? [walk] : []));
      if (url.includes('builder_kind=not.is.null')) return new Response(JSON.stringify(cloned.map((id) => ({ id, builder_kind: 'fitness' }))));
      return new Response(JSON.stringify(url.includes('/rpc/') ? null : init?.method === 'PATCH' ? [{ id: 'combined', ...body }] : []));
    });
    try { await combineProtocols('token', 'owner', { name: 'Sam' }, sources, decisions); } finally { vi.unstubAllGlobals(); }
    return created;
  }
  const [c] = conflictsAcross([{ name: 'Rules', items: rules }, { name: 'Cardio', items: [walk] }]);

  it('refuses to combine while a contradiction is undecided', async () => {
    await expect(run({})).rejects.toThrow(/Decide 1 contradiction/);
  });
  it('"keep the rule" leaves the step out', async () => {
    const created = await run({ [c.id!]: 'rule' });
    expect(created).toContain('Rest on Wednesday');
    expect(created).not.toContain('Walk 40 minutes');
  });
  it('"keep the step" leaves the rule out', async () => {
    const created = await run({ [c.id!]: 'item' });
    expect(created).toContain('Walk 40 minutes');
    expect(created).not.toContain('Rest on Wednesday');
  });
  it('refuses a choice that would drop a step from a linked plan', async () => {
    await expect(run({ [c.id!]: 'rule' }, ['p-cardio'])).rejects.toThrow(/linked plan/);
  });
});
