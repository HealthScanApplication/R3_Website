import { describe, it, expect, vi } from 'vitest';
import { combineProtocols, conflictsAcross, findProtocolConflicts, resolveDecisions, reviewCombined, reviewDiet, reviewFitness, type Conflict, type DietConfig, type FitnessConfig, type MealPick } from '../protocolBuilders';
import type { AdminProtocol, AdminProtocolItem } from '../protocolAdmin';

let n = 0;
const item = (p: Partial<AdminProtocolItem>): AdminProtocolItem => ({ id: `r${++n}`, display_name: '', kind: 'action', category: 'do', subtype: null, parent_protocol_item_id: null, recurrence_days_of_week: null, hidden: false, ...p } as AdminProtocolItem);
const rule = (text: string, p: Partial<AdminProtocolItem> = {}) => item({ display_name: text, kind: /^(rest|do)\b/i.test(text) ? 'rule_do' : 'rule_dont', ...p });
const walk = (dows: number[] | null, p: Partial<AdminProtocolItem> = {}) => item({ display_name: 'Walk 40 minutes', subtype: 'exercise', recurrence_days_of_week: dows, ...p });
const drink = (title: string, dows: number[] | null = null, p: Partial<AdminProtocolItem> = {}) => item({ display_name: title, category: 'consume', recurrence_days_of_week: dows, ...p });
const clashes = (items: AdminProtocolItem[]) => findProtocolConflicts('Plan', items);

describe('rest-day rules find every scheduled session', () => {
  it('a Walk on Monday, Wednesday and Friday breaks "Rest on Wednesday"', () => expect(clashes([rule('Rest on Wednesday'), walk([1, 3, 5])])).toHaveLength(1));
  it('so does a daily Walk (no weekdays listed)', () => expect(clashes([rule('Rest on Wednesday'), walk(null)])).toHaveLength(1));
  it('a Walk on other days does not', () => expect(clashes([rule('Rest on Wednesday'), walk([2, 4])])).toEqual([]));
  it('a Walk added in the editor as a wellness step is still a session', () => expect(clashes([rule('Rest on Wednesday'), walk([3], { subtype: 'wellness' })])).toHaveLength(1));
  it('"No training on Wednesday" is a rest day too, as stored and as a builder keeps it', () => {
    expect(clashes([rule('No training on Wednesday'), walk([3])])).toHaveLength(1);
    const cfg: FitnessConfig = { goal: 'general', level: 'beginner', minutes: 30, rules: ['No training on Wednesday'], sessions: [{ day: 3, time: '07:00', title: 'Walk 40 minutes', minutes: 40, intensity: 'low', exercises: [] }] };
    expect(reviewFitness(cfg).blocking.some((b) => /contradict/.test(b.message))).toBe(true);
  });
  it('"No training on Wednesday" says nothing about Tuesday\'s Strength training', () => {
    expect(clashes([rule('No training on Wednesday'), item({ display_name: 'Strength training', subtype: 'exercise', recurrence_days_of_week: [2] })])).toEqual([]);
  });
  it('"Do recover with a protein shake" is not a rest day', () => {
    expect(clashes([rule('Do recover with a protein shake', { recurrence_days_of_week: [3] }), walk([3])])).toEqual([]);
  });
});

describe('a rule covers only what it sits on', () => {
  it('a day rule on Tuesday does not cover a step on Monday and Wednesday', () => {
    expect(clashes([rule('No coffee', { recurrence_days_of_week: [2] }), drink('Drink Coffee', [1, 3])])).toEqual([]);
    expect(clashes([rule('No coffee', { recurrence_days_of_week: [2] }), drink('Drink Coffee', [1, 2])])).toHaveLength(1);
  });
  it('an activity rule covers its own step, not a same-named step elsewhere', () => {
    const mon = item({ display_name: 'Breakfast', category: 'consume', recurrence_days_of_week: [1] });
    const tue = item({ display_name: 'Breakfast', category: 'consume', recurrence_days_of_week: [2] });
    const monCoffee = drink('Drink Coffee', [1], { parent_protocol_item_id: mon.id });
    const tueCoffee = drink('Drink Coffee', [2], { parent_protocol_item_id: tue.id });
    const found = clashes([mon, tue, monCoffee, tueCoffee, rule('No coffee', { parent_protocol_item_id: mon.id })]);
    expect(found.map((c) => c.itemId)).toEqual([monCoffee.id]);
  });
  it('an activity rule in one Protocol does not reach a same-named step in another', () => {
    const a = item({ display_name: 'Walk', subtype: 'exercise' }); const b = item({ display_name: 'Walk 40 minutes', subtype: 'exercise' });
    const found = conflictsAcross([{ name: 'A', items: [a, rule("Don't walk", { parent_protocol_item_id: a.id })] }, { name: 'B', items: [item({ ...b, display_name: 'Walk' })] }]);
    expect(found.filter((c) => c.itemSource === 'B')).toEqual([]);
  });
  it('a do and a don\'t under different activities do not clash, under the same one they do', () => {
    const oat1 = item({ display_name: 'Oatmeal', category: 'consume', recurrence_days_of_week: [1] });
    const oat2 = item({ display_name: 'Oatmeal', category: 'consume', recurrence_days_of_week: [2] });
    expect(clashes([oat1, oat2, rule('Avoid sugar', { parent_protocol_item_id: oat1.id }), rule('Do sweeten with honey', { parent_protocol_item_id: oat2.id })])).toEqual([]);
    expect(clashes([oat1, oat2, rule('Avoid sugar', { parent_protocol_item_id: oat1.id }), rule('Do sweeten with honey', { parent_protocol_item_id: oat1.id })])).toHaveLength(1);
  });
  it('a week "Avoid sugar" covers a "sweeten with honey" under any step', () => {
    const oat = item({ display_name: 'Oatmeal', category: 'consume' });
    expect(clashes([oat, rule('Avoid sugar'), rule('Do sweeten with honey', { parent_protocol_item_id: oat.id })])).toHaveLength(1);
  });
  it('hidden steps and rules are not part of the Protocol', () => {
    expect(clashes([rule('Rest on Wednesday'), walk([3], { hidden: true })])).toEqual([]);
    expect(clashes([rule('Rest on Wednesday', { hidden: true }), walk([3])])).toEqual([]);
    expect(reviewCombined([{ name: 'A', items: [rule('Rest on Wednesday')] }, { name: 'B', items: [walk([3], { hidden: true })] }]).conflicts).toEqual([]);
  });
});

describe('a guess never blocks a save', () => {
  it('"Don\'t skip breakfast" is a do, not a ban on the Breakfast step', () => expect(clashes([rule("Don't skip breakfast"), drink('Breakfast')])).toEqual([]));
  it('"No screens before sleep" says nothing about Start Sleep', () => expect(clashes([rule('No screens before sleep'), item({ display_name: 'Start Sleep', category: 'sleep', subtype: 'sleep' })])).toEqual([]));
  it('"Limit" rules allow some', () => expect(clashes([rule('Limit red meat to twice a week'), drink('Beef stew'), rule('Limit caffeine'), drink('Drink Coffee')])).toEqual([]));
  it('a decaf, herbal or sugar-free step is not what the rule avoids', () => {
    expect(clashes([rule('Avoid caffeine'), drink('Decaf coffee'), drink('Herbal tea')])).toEqual([]);
    expect(clashes([rule('Avoid sugar'), drink('Sugar-free jam')])).toEqual([]);
  });
  it('part of a rule\'s words in a step name is a "maybe"; all of them is "sure"', () => {
    const [loose] = clashes([rule('Avoid canned tuna'), drink('Tuna salad')]);
    expect(loose.certainty).toBe('maybe');
    const [exact] = clashes([rule('Avoid canned tuna'), drink('Canned tuna wrap')]);
    expect(exact.certainty).toBe('sure');
  });
  it('a session\'s own checklist word-match is listed but does not block the Fitness save', () => {
    const cfg: FitnessConfig = { goal: 'general', level: 'beginner', minutes: 30, sessions: [{ day: 2, time: '07:00', title: 'Stretch 10 minutes', minutes: 10, intensity: 'low', exercises: [], rules: ["Don't stretch cold muscles"] }] };
    const review = reviewFitness(cfg);
    expect(review.conflicts.every((c) => c.certainty === 'maybe')).toBe(true);
    expect(review.blocking.filter((b) => /contradict/.test(b.message))).toEqual([]);
  });
  it('a "Limit" rule does not block a Diet save', () => {
    const meal: MealPick = { source: 'catalog', id: 'b', name: 'Beef stew', image: null, nutrition: { energy_kcal: 500, protein_g: 20, carbohydrates_g: 60, fats_g: 15 } };
    const cfg = { framework: 'balanced', kcal: 2000, protein: 20, carbs: 50, fat: 30, slots: ['dinner'], plan: { '1:dinner': meal }, drinks: { dinner: [] }, rules: ['Limit red meat to twice a week'] } as unknown as DietConfig;
    expect(reviewDiet(cfg).blocking).toEqual([]);
  });
  it('the fasting window is listed for review but does not block the Diet save', () => {
    const meal: MealPick = { source: 'catalog', id: 'o', name: 'Overnight oats', image: null, nutrition: { energy_kcal: 500, protein_g: 20, carbs: 60 } as never };
    const cfg = { framework: 'balanced', kcal: 2000, protein: 20, carbs: 50, fat: 30, slots: ['breakfast'], plan: { '1:breakfast': meal }, drinks: { breakfast: [] }, timing: { breakfast: { anchor: 'clock', time: '08:00', offset: 0 } },
      fasting: { type: 'intermittent', start: '20:00', end: '12:00', days: [1, 2, 3, 4, 5, 6, 7] } } as unknown as DietConfig;
    const review = reviewDiet(cfg);
    expect(review.conflicts.some((c) => c.rule === 'Fasting window')).toBe(true);
    expect(review.blocking.some((b) => /Fasting window/.test(b.message))).toBe(false);
  });
});

describe('resolveDecisions: what the choices leave out', () => {
  const sugar = (n = 3) => Array.from({ length: n }, (_, i) => drink(`Honey cake ${i}`));
  it('keeping a step drops the rule, which settles every other contradiction that rule is in', () => {
    const r = rule('Avoid sugar'); const [a, b] = sugar(2);
    const cs = clashes([r, a, b]);
    const decisions = { [cs.find((c) => c.itemId === a.id)!.id!]: 'item' as const };
    const { dropped, inconsistent } = resolveDecisions(cs, decisions);
    expect([...dropped]).toEqual([r.id]);
    expect(inconsistent).toEqual([]);
  });
  it('keeping the rule here and dropping it there is inconsistent', () => {
    const r = rule('Avoid sugar'); const [a, b] = sugar(2);
    const cs = clashes([r, a, b]);
    const decisions = { [cs.find((c) => c.itemId === a.id)!.id!]: 'rule' as const, [cs.find((c) => c.itemId === b.id)!.id!]: 'item' as const };
    expect(resolveDecisions(cs, decisions).inconsistent.map((c) => c.itemId)).toEqual([a.id]);
  });
  it('keeping a step whose parent is dropped is inconsistent', () => {
    const parent = item({ display_name: 'Honey cake plate', category: 'consume' }); const child = drink('Honey', null, { parent_protocol_item_id: parent.id });
    const r = rule('Avoid sugar'); const cs = clashes([parent, child, r]);
    expect(cs.map((c) => c.itemId).sort()).toEqual([child.id, parent.id].sort());
    const decisions = { [cs.find((c) => c.itemId === parent.id)!.id!]: 'rule' as const, [cs.find((c) => c.itemId === child.id)!.id!]: 'item' as const };
    expect(resolveDecisions(cs, decisions, new Map([[child.id, parent.id], [parent.id, null]])).inconsistent).not.toEqual([]);
  });
  it('more than 30 contradictions can all be settled with one choice', () => {
    const cs = clashes([rule('Avoid sugar'), ...sugar(40)]);
    expect(cs).toHaveLength(40);
    const { dropped, inconsistent } = resolveDecisions(cs, Object.fromEntries(cs.map((c) => [c.id!, 'rule' as const])));
    expect(dropped.size).toBe(40);
    expect(inconsistent).toEqual([]);
  });
});

describe('combining: sleep and loose matches', () => {
  const proto = (id: string, name: string): AdminProtocol => ({ id, name, total_days: 7 } as AdminProtocol);
  async function run(byProtocol: Record<string, AdminProtocolItem[]>, decisions: Record<string, 'rule' | 'item'> = {}) {
    const created: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (init?.method === 'POST' && url.endsWith('/protocol_items')) { created.push(body.display_name); return new Response(JSON.stringify([{ id: `new-${created.length}`, ...body }])); }
      if (init?.method === 'POST' && url.endsWith('/protocols')) return new Response(JSON.stringify([{ id: 'combined', ...body }]));
      const list = Object.keys(byProtocol).find((id) => url.includes(`protocol_id=eq.${id}`));
      if (list && url.includes('/protocol_items')) return new Response(JSON.stringify(byProtocol[list]));
      if (url.includes('builder_kind=not.is.null')) return new Response(JSON.stringify([]));
      return new Response(JSON.stringify(url.includes('/rpc/') ? null : init?.method === 'PATCH' ? [{ id: 'combined', ...body }] : []));
    });
    try { await combineProtocols('token', 'owner', { name: 'Sam' }, Object.keys(byProtocol).map((id) => proto(id, id)), decisions); } finally { vi.unstubAllGlobals(); }
    return created;
  }

  it('a sleep step left out by a choice is replaced by a default sleep pair, not lost', async () => {
    const end = item({ display_name: 'End Sleep', category: 'sleep', subtype: 'sleep' }); const start = item({ display_name: 'Start Sleep', category: 'sleep', subtype: 'sleep' });
    const r = rule('Avoid sleep');
    const cs = conflictsAcross([{ name: 'A', items: [r, end, start] }]);
    const created = await run({ A: [r, end, start] }, Object.fromEntries(cs.map((c) => [c.id!, 'rule' as const])));
    expect(created).toEqual(expect.arrayContaining(['End Sleep', 'Start Sleep']));
    expect(created.filter((t) => t === 'Start Sleep')).toHaveLength(1);
  });
  it('a second sleep pair that a combine would not copy never asks for a decision', () => {
    const r = rule('Avoid sleep');
    const found = reviewCombined([{ name: 'A', items: [item({ display_name: 'End Sleep', category: 'sleep', subtype: 'sleep' }), item({ display_name: 'Start Sleep', category: 'sleep', subtype: 'sleep' })] }, { name: 'B', items: [r, item({ display_name: 'End Sleep', category: 'sleep', subtype: 'sleep' }), item({ display_name: 'Start Sleep', category: 'sleep', subtype: 'sleep' })] }]);
    // Only the first Protocol's pair is copied, so only that pair can need a decision.
    expect(found.conflicts.map((c) => c.itemSource)).toEqual(['A', 'A']);
  });
  it('a loose match can be left alone: combining does not wait for a decision on it', async () => {
    const created = await run({ A: [rule('Avoid canned tuna')], B: [drink('Tuna salad')] });
    expect(created).toEqual(expect.arrayContaining(['Avoid canned tuna', 'Tuna salad']));
  });
  it('refuses choices that cannot all hold', async () => {
    const r = rule('Avoid sugar'); const [a, b] = [drink('Honey cake 1'), drink('Honey cake 2')];
    const cs: Conflict[] = conflictsAcross([{ name: 'A', items: [r] }, { name: 'B', items: [a, b] }]);
    await expect(run({ A: [r], B: [a, b] }, { [cs.find((c) => c.itemId === a.id)!.id!]: 'rule', [cs.find((c) => c.itemId === b.id)!.id!]: 'item' })).rejects.toThrow(/contradict each other/);
  });
});
