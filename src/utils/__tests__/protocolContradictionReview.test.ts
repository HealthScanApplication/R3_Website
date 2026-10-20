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
  it('keeping a step whose parent is dropped is inconsistent (and only the parent chain can tell)', () => {
    // Plate is dropped for "Avoid sugar"; Honey (its child) is kept for "No honey", which is a different rule.
    const plate = item({ display_name: 'Honey cake plate', category: 'consume' }); const honey = drink('Honey', null, { parent_protocol_item_id: plate.id });
    const r1 = rule('Avoid cake'); const r2 = rule('Avoid honey');
    const cs = clashes([plate, honey, r1, r2]);
    const plateVsCake = cs.find((c) => c.itemId === plate.id && c.ruleId === r1.id)!; const honeyVsHoney = cs.find((c) => c.itemId === honey.id && c.ruleId === r2.id)!;
    const decisions = { [plateVsCake.id!]: 'rule' as const, [honeyVsHoney.id!]: 'item' as const };
    expect(resolveDecisions(cs, decisions).inconsistent.map((c) => c.id)).toEqual([]);
    expect(resolveDecisions(cs, decisions, new Map([[honey.id, plate.id], [plate.id, null]])).inconsistent.map((c) => c.id)).toEqual([honeyVsHoney.id]);
  });
  it('a choice settles the other contradictions it decides: no second click is asked for', () => {
    const r = rule('Avoid sugar'); const [a, b] = [drink('Honey cake'), drink('Maple syrup pancakes')];
    const cs = clashes([r, a, b]);
    const keepStep = { [cs.find((c) => c.itemId === a.id)!.id!]: 'item' as const };
    expect(resolveDecisions(cs, keepStep).undecided).toEqual([]);
    expect(resolveDecisions(cs, {}).undecided).toHaveLength(2);
  });
  it('a step already dropped for one rule needs no decision about another, and a "keep" on it is inconsistent', () => {
    const x = drink('Honey coffee'); const sugar = rule('Avoid sugar'); const caffeine = rule('Avoid caffeine');
    const cs = clashes([x, sugar, caffeine]);
    const vsSugar = cs.find((c) => c.ruleId === sugar.id)!; const vsCaffeine = cs.find((c) => c.ruleId === caffeine.id)!;
    expect(resolveDecisions(cs, { [vsSugar.id!]: 'rule' }).undecided).toEqual([]);
    expect(resolveDecisions(cs, { [vsSugar.id!]: 'rule', [vsCaffeine.id!]: 'item' }).inconsistent.map((c) => c.id)).toEqual([vsCaffeine.id]);
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
  const bodies: Array<Record<string, any>> = [];
  async function run(byProtocol: Record<string, AdminProtocolItem[]>, decisions: Record<string, 'rule' | 'item'> = {}) {
    const created: string[] = [];
    bodies.length = 0;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (init?.method === 'POST' && url.endsWith('/protocol_items')) { created.push(body.display_name); bodies.push(body); return new Response(JSON.stringify([{ id: `new-${created.length}`, ...body }])); }
      if (init?.method === 'POST' && url.endsWith('/protocols')) return new Response(JSON.stringify([{ id: 'combined', ...body }]));
      const list = Object.keys(byProtocol).find((id) => url.includes(`protocol_id=eq.${id}`));
      if (list && url.includes('/protocol_items')) return new Response(JSON.stringify(byProtocol[list]));
      if (url.includes('builder_kind=not.is.null')) return new Response(JSON.stringify([]));
      return new Response(JSON.stringify(url.includes('/rpc/') ? null : init?.method === 'PATCH' ? [{ id: 'combined', ...body }] : []));
    });
    try { await combineProtocols('token', 'owner', { name: 'Sam' }, Object.keys(byProtocol).map((id) => proto(id, id)), decisions); } finally { vi.unstubAllGlobals(); }
    return created;
  }

  const wake = (p: Partial<AdminProtocolItem> = {}) => item({ display_name: 'Wake up', category: 'do', ...p } as Partial<AdminProtocolItem>);
  const bed = (p: Partial<AdminProtocolItem> = {}) => item({ display_name: 'Go to bed', category: 'do', ...p } as Partial<AdminProtocolItem>);
  it('the sleep pair (Start / End Sleep, Wake up, Go to bed) is not matched by a rule\'s words, so a choice never has to drop it', () => {
    expect(clashes([rule('Avoid wake up'), wake(), bed(), rule("Don't sleep with your phone"), item({ display_name: 'Start Sleep', category: 'sleep', subtype: 'sleep' })])).toEqual([]);
  });
  it('a nap is not the sleep pair: "No napping after 3pm" reaches a 16:00 nap', () => {
    expect(clashes([rule('No napping after 3pm'), item({ display_name: 'Take a nap', category: 'sleep', scheduled_time: '16:00:00' } as Partial<AdminProtocolItem>)])).toHaveLength(1);
  });
  it('a hidden sleep pair does not stand in for the real one: the visible pair of the next Protocol is copied', async () => {
    await run({ A: [wake({ hidden: true } as Partial<AdminProtocolItem>), bed({ hidden: true } as Partial<AdminProtocolItem>)], B: [wake({ scheduled_time: '06:15:00' } as Partial<AdminProtocolItem>), bed({ scheduled_time: '23:15:00' } as Partial<AdminProtocolItem>)] });
    expect(bodies.filter((x) => /^(End|Start) Sleep$/.test(x.display_name)).map((x) => `${x.display_name} ${x.scheduled_time}`).sort()).toEqual(['End Sleep 06:15:00', 'Start Sleep 23:15:00']);
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

describe('rules as a builder keeps them', () => {
  it('"Don\'t skip breakfast" kept as "Skip breakfast" is at most a maybe against a Breakfast step', () => {
    const found = clashes([rule('Skip breakfast'), item({ display_name: 'Breakfast burrito', category: 'consume' })]);
    expect(found.every((c) => c.certainty === 'maybe')).toBe(true);
  });
  it('"Cut down on sugar" kept as "Down on sugar" and "Cut back on caffeine" as "Back on caffeine" allow some', () => {
    expect(clashes([rule('Down on sugar'), drink('Honey porridge'), rule('Back on caffeine'), drink('Morning coffee')])).toEqual([]);
  });
  it('a Diet plan with "Don\'t skip breakfast" or "Cut down on sugar" still saves', () => {
    const meal = (id: string, name: string): MealPick => ({ source: 'catalog', id, name, image: null, nutrition: { energy_kcal: 500, protein_g: 20, carbohydrates_g: 60, fats_g: 15 } });
    const cfg = { framework: 'balanced', kcal: 2000, protein: 20, carbs: 50, fat: 30, slots: ['breakfast'], plan: { '1:breakfast': meal('b', 'Breakfast burrito'), '2:breakfast': meal('h', 'Honey porridge') }, drinks: { breakfast: [] }, rules: ["Don't skip breakfast", 'Cut down on sugar'] } as unknown as DietConfig;
    expect(reviewDiet(cfg).blocking).toEqual([]);
  });
  it('a rule worded "Never …" keeps its words in the label', () => {
    const [c] = clashes([rule('Never treadmill'), walk([2], { display_name: 'Treadmill Walk' })]);
    expect(c.rule).toBe('Never treadmill');
  });
});

describe('a rule with hours only forbids those hours', () => {
  const coffee = (time: string | null) => drink('Drink coffee', null, { scheduled_time: time } as Partial<AdminProtocolItem>);
  it('"No coffee after 2pm" leaves a 07:30 coffee alone and flags 15:00', () => {
    expect(clashes([rule('No coffee after 2pm'), coffee('07:30:00')])).toEqual([]);
    expect(clashes([rule('No coffee after 2pm'), coffee('15:00:00')])[0].certainty).toBe('sure');
  });
  it('a coffee with no time is only a maybe', () => {
    expect(clashes([rule('No coffee after 2pm'), coffee(null)])[0].certainty).toBe('maybe');
  });
  it('"No coffee before 10am" is the other side of the day', () => {
    expect(clashes([rule('No coffee before 10am'), coffee('09:00:00')])).toHaveLength(1);
    expect(clashes([rule('No coffee before 10am'), coffee('11:00:00')])).toEqual([]);
  });
});

describe('look-alikes are not what the rule avoids', () => {
  it.each([
    ['Avoid dairy', ['Peanut butter toast', 'Oat milk porridge', 'Butternut squash soup'], ['Cheese omelette']],
    ['Avoid red meat', ['Chicken curry', 'Turkey sandwich'], ['Beef stew']],
    ['Avoid meat', [], ['Chicken curry', 'Beef stew']],
    ['Avoid caffeine', ['Chamomile tea', 'Peppermint tea', 'Hot chocolate', 'Apply tea tree oil', 'Decaf coffee'], ['Iced tea', 'Morning coffee']],
    ['Avoid sugar', ['Jamaican jerk chicken', 'Rice cakes', 'Exfoliate with sugar scrub'], ['Honey on toast']],
    ['Avoid alcohol', ['Red wine vinegar dressing', 'Beer 0.0', 'Non-alcoholic beer'], ['Glass of wine']],
  ])('%s', (text, safe, flagged) => {
    for (const title of safe) expect(clashes([rule(text), drink(title)]), title).toEqual([]);
    for (const title of flagged) expect(clashes([rule(text), drink(title)]).length, title).toBeGreaterThan(0);
  });
});

describe('what counts as a training session', () => {
  it.each(['Log workout', 'Pack gym bag', 'Log menstrual cycle', 'Run the dishwasher', 'Plan the week'])('"%s" is not on a rest day', (title) => {
    expect(clashes([rule('Rest on Wednesday'), item({ display_name: title })])).toEqual([]);
  });
  it.each(['Go walking', 'Walk 40 minutes', 'Gym session', 'Treadmill Walk and Run', 'Strength training', '30 min run'])('"%s" is', (title) => {
    expect(clashes([rule('Rest on Wednesday'), item({ display_name: title, recurrence_days_of_week: [3] })])).toHaveLength(1);
  });
});

describe('how a rest day is worded', () => {
  it.each(['Rest on weekends', 'Rest on Saturday', 'Saturday is a rest day', 'Take Saturday off', 'No training on Saturday', 'No gym on Saturday', 'Rest day: Saturday'])('"%s"', (text) => {
    expect(clashes([rule(text), walk([6])]), text).toHaveLength(1);
    expect(clashes([rule(text), walk([3])]), text).toEqual([]);
  });
  it('"sun" on its own is not Sunday', () => {
    expect(clashes([rule('Rest and get some sun'), walk([0])])).toEqual([]);
  });
  it('"Mon-Fri" and "weekdays" are five days', () => {
    expect(clashes([rule('No alcohol Mon-Fri'), drink('Glass of wine', [3])])).toHaveLength(1);
    expect(clashes([rule('No alcohol on weekdays'), drink('Glass of wine', [3])])).toHaveLength(1);
    expect(clashes([rule('No alcohol on weekdays'), drink('Glass of wine', [6])])).toEqual([]);
  });
  it('"running" finds "Run 5k" and "gym" is not too short to count', () => {
    expect(clashes([rule('No running on Wednesday'), item({ display_name: 'Run 5k', category: 'do', recurrence_days_of_week: [3] })]).length).toBeGreaterThan(0);
    expect(clashes([rule('No gym on Wednesday'), item({ display_name: 'Gym session', recurrence_days_of_week: [3] })]).length).toBeGreaterThan(0);
  });
});

describe('Start and End Sleep', () => {
  it('are not matched by a rule\'s words', () => {
    expect(clashes([rule("Don't sleep with your phone"), item({ display_name: 'Start Sleep', category: 'sleep', subtype: 'sleep' })])).toEqual([]);
  });
});

describe('linked plans are told apart by row, not by name', () => {
  it('a linked plan and an ordinary Protocol with the same name still leave one side droppable', () => {
    const r = rule('Avoid sugar'); const cake = drink('Honey cake');
    const [c] = conflictsAcross([{ name: 'Plan', items: [r], cloned: true }, { name: 'Plan', items: [cake] }]);
    expect([c.canKeepRule, c.canKeepItem]).toEqual([true, false]);
  });
});

describe('combining keeps the shape of the plan', () => {
  const proto = (id: string): AdminProtocol => ({ id, name: id, total_days: 7 } as AdminProtocol);
  async function copy(items: AdminProtocolItem[]) {
    const created: Array<Record<string, any>> = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (init?.method === 'POST' && url.endsWith('/protocol_items')) { const row = { ...body, id: `new-${created.length + 1}` }; created.push(row); return new Response(JSON.stringify([row])); }
      if (init?.method === 'POST' && url.endsWith('/protocols')) return new Response(JSON.stringify([{ id: 'combined', ...body }]));
      if (url.includes('/protocol_items') && url.includes('protocol_id=eq.A')) return new Response(JSON.stringify(items));
      if (url.includes('builder_kind=not.is.null')) return new Response(JSON.stringify([]));
      return new Response(JSON.stringify(url.includes('/rpc/') ? null : init?.method === 'PATCH' ? [{ id: 'combined', ...body }] : []));
    });
    try { await combineProtocols('token', 'owner', { name: 'Sam' }, [proto('A')], {}); } finally { vi.unstubAllGlobals(); }
    return created;
  }
  it('a grandchild listed before its parent still lands under it', async () => {
    const top = item({ display_name: 'Morning routine' }); const mid = item({ display_name: 'Prepare breakfast', parent_protocol_item_id: top.id }); const leaf = item({ display_name: 'Boil eggs', parent_protocol_item_id: mid.id });
    const created = await copy([leaf, mid, top]);
    const byTitle = Object.fromEntries(created.map((c) => [c.display_name, c]));
    expect(byTitle['Boil eggs'].parent_protocol_item_id).toBe(byTitle['Prepare breakfast'].id);
    expect(byTitle['Prepare breakfast'].parent_protocol_item_id).toBe(byTitle['Morning routine'].id);
  });
});

describe('a word stem never makes a clear match, and generic verbs are not stems', () => {
  it.each([['Avoid eating out', 'Eat a protein breakfast'], ['Eating in front of the TV', 'Eat a protein breakfast'], ['Avoid drinking with meals', 'Drink 2 litres of water'], ['Avoid sitting', 'Sit-ups']])('"%s" vs "%s"', (text, title) => {
    expect(clashes([rule(text), drink(title)]).filter((c) => c.certainty !== 'maybe')).toEqual([]);
  });
  it('"No running on Wednesday" still finds "Run 5k"', () => {
    expect(clashes([rule('No running on Wednesday'), item({ display_name: 'Run 5k', recurrence_days_of_week: [3] })]).length).toBeGreaterThan(0);
  });
});

describe('hours the rule names are only exact when they are one plain time', () => {
  const coffee = (time: string | null) => drink('Drink coffee', null, { scheduled_time: time } as Partial<AdminProtocolItem>);
  const cert = (rules: string, time: string | null) => clashes([rule(rules), coffee(time)]).map((c) => c.certainty);
  it.each([['No coffee from 2pm until 6pm'], ['No coffee between 2 and 4pm'], ['No coffee after lunch'], ['No coffee in the evening'], ['No coffee after 8']])('"%s" is only a maybe', (text) => {
    expect(cert(text, '08:30:00').every((c) => c === 'maybe')).toBe(true);
    expect(cert(text, '20:00:00').every((c) => c === 'maybe')).toBe(true);
  });
  it('"No coffee after 14:00" is exact', () => {
    expect(cert('No coffee after 14:00', '15:00:00')).toEqual(['sure']);
    expect(cert('No coffee after 14:00', '13:00:00')).toEqual([]);
  });
  it('two rules about different hours are not a clear contradiction', () => {
    const found = clashes([rule('Do drink coffee before 10am'), rule('No coffee after 2pm')]);
    expect(found.every((c) => c.certainty === 'maybe')).toBe(true);
  });
  it('a Diet plan (steps have no clock time here) is never blocked by an hours rule', () => {
    const meal = (id: string, name: string): MealPick => ({ source: 'catalog', id, name, image: null, nutrition: { energy_kcal: 500, protein_g: 20, carbohydrates_g: 60, fats_g: 15 } });
    const cfg = { framework: 'balanced', kcal: 2000, protein: 20, carbs: 50, fat: 30, slots: ['dinner'], plan: { '1:dinner': meal('c', 'Coffee cake') }, drinks: { dinner: [] }, rules: ['No coffee after 2pm'] } as unknown as DietConfig;
    expect(reviewDiet(cfg).blocking).toEqual([]);
  });
});

describe('rest rules that say more than rest', () => {
  it.each(['Take Sundays off social media', 'Take weekends off email'])('"%s" is about something else', (text) => {
    expect(clashes([rule(text), walk([6]), walk([0])])).toEqual([]);
  });
  it('"Lift Mon, Wed, Fri; rest days Tue, Thu" is at most a maybe', () => {
    expect(clashes([rule('Lift Mon, Wed, Fri; rest days Tue, Thu'), walk([1])]).every((c) => c.certainty === 'maybe')).toBe(true);
  });
  it.each(['Take Sunday off', 'Wednesday is a rest day'])('"%s" is exact', (text) => {
    const day = /Sunday/.test(text) ? 0 : 3;
    expect(clashes([rule(text), walk([day])]).map((c) => c.certainty)).toEqual(['sure']);
  });
  it.each(['Evening walk', 'Take a walk after dinner', 'Morning run', 'Short walk'])('"%s" is a session on a rest day', (title) => {
    expect(clashes([rule('Rest on Wednesday'), item({ display_name: title, subtype: 'wellness', recurrence_days_of_week: [3] })])).toHaveLength(1);
  });
});

describe('more look-alikes', () => {
  it.each([
    ['Avoid dairy', ['Soya milk latte', 'Butter beans', 'Coconut cream curry'], ['Cream of mushroom soup']],
    ['Avoid processed meat', ['Grilled chicken salad'], ['Bacon sandwich']],
    ['Avoid red or processed meat', ['Grilled chicken salad'], ['Beef stew', 'Ham roll']],
    ['Avoid caffeine', [], ['Green tea with lemon', 'Black tea with mint']],
  ])('%s', (text, safe, flagged) => {
    for (const title of safe) expect(clashes([rule(text), drink(title)]), title).toEqual([]);
    for (const title of flagged) expect(clashes([rule(text), drink(title)]).length, title).toBeGreaterThan(0);
  });
});

describe('a rule under a dropped step is dropped with it', () => {
  it('its contradictions need no decision of their own', () => {
    const x = item({ display_name: 'Sweet toast', category: 'consume' }); const toast = rule('Avoid toast'); const sugar = rule('Avoid sugar', { parent_protocol_item_id: x.id }); const honey = rule('Do sweeten tea with honey');
    const cs = clashes([x, toast, sugar, honey]);
    const vsToast = cs.find((c) => c.itemId === x.id && c.ruleId === toast.id)!;
    const parentOf = new Map<string, string | null>([[x.id, null], [sugar.id, x.id], [toast.id, null], [honey.id, null]]);
    const after = resolveDecisions(cs, { [vsToast.id!]: 'rule' }, parentOf);
    expect(after.undecided.map((c) => c.ruleId)).not.toContain(sugar.id);
  });
});
