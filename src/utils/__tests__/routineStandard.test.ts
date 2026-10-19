import { describe, it, expect } from 'vitest';
import { consumeKind, splitMealDrink, parseSetInfo, isCalendarEntry, isRuleLikeTitle, repegTimes, standardiseProtocol, findContradictions, type Row } from '../routineStandard';
import { enforceProtocolRules, mealTitle, ruleGroupFor, ruleRowFields } from '../protocolRules';
import { localEventPlan, cleanPastedText, detectEvent } from '../eventProtocol';

let n = 0;
const row = (p: Partial<Row>): Row => ({ id: `r${++n}`, display_name: '', kind: 'action', ...p });
const changesFor = (rows: Row[], mode: 'cleanup' | 'new' = 'cleanup') => standardiseProtocol(rows, mode);
const renamed = (cs: ReturnType<typeof changesFor>, id: string) => cs.find((c) => c.item_id === id && c.field === 'display_name')?.to;

describe('meal names', () => {
  it('"Breakfast" is a slot, not a dish', () => expect(consumeKind('Breakfast')).toBe('slot'));
  it('"Eat breakfast" / "Have lunch" are slots, renamed to the slot', () => {
    const a = row({ display_name: 'Eat breakfast', category: 'consume', subtype: 'meal', scheduled_time: '08:00:00' });
    const b = row({ display_name: 'Have lunch', category: 'consume', subtype: 'meal', scheduled_time: '12:30:00' });
    const cs = changesFor([a, b]);
    expect(renamed(cs, a.id)).toBe('Breakfast');
    expect(renamed(cs, b.id)).toBe('Lunch');
  });
  it('empty slot stays empty and is flagged (never invented)', () => {
    const a = row({ display_name: 'Dinner', category: 'consume', subtype: 'meal', scheduled_time: '18:30:00' });
    const cs = changesFor([a]);
    expect(cs.some((c) => c.item_id === a.id && c.action === 'flag' && /Empty dinner slot/.test(c.reason))).toBe(true);
    expect(cs.some((c) => c.action === 'insert' && c.insert?.subtype === 'meal')).toBe(false);
  });
  it('meal with a drink in the title splits into meal + drink item', () => {
    expect(splitMealDrink('Oats with green tea')).toEqual({ meal: 'Oats', drink: 'Green tea' });
    const a = row({ display_name: 'Oats with green tea', category: 'consume', subtype: 'meal', scheduled_time: '08:00:00' });
    const cs = changesFor([a]);
    expect(renamed(cs, a.id)).toBe('Oats');
    expect(cs.find((c) => c.action === 'insert' && c.insert?.subtype === 'drink')?.insert?.display_name).toBe('Green tea');
  });
  it('a second item in the slot that is a drink goes to Drinks, not into the meal', () => {
    const meal = row({ display_name: 'Breakfast', category: 'consume', subtype: 'meal', scheduled_time: '08:00:00', catalog_recipe_id: 'x' });
    const drink = row({ display_name: 'Black coffee', category: 'consume', subtype: 'meal', scheduled_time: '08:00:00' });
    const cs = changesFor([meal, drink]);
    expect(cs.find((c) => c.item_id === drink.id && c.field === 'subtype')?.to).toBe('drink');
    expect(renamed(cs, meal.id)).toBeUndefined();
  });
  it('smoothie is a meal, water is a drink', () => {
    expect(consumeKind('Green smoothie')).toBe('meal');
    expect(consumeKind('Protein shake')).toBe('meal');
    expect(consumeKind('Water')).toBe('drink');
    expect(consumeKind('Drink warm water')).toBe('drink');
  });
  it('meal verbs are stripped; drinks keep the drink name', () => {
    expect(mealTitle('Eat plain rice')).toBe('Plain rice');
    const a = row({ display_name: 'Drink Water', category: 'consume', subtype: 'meal', scheduled_time: '07:00:00' });
    expect(renamed(changesFor([a]), a.id)).toBe('Water');
  });
  it('recipe-linked meal whose recipe name differs keeps the Guardian title unless generic', () => {
    const plan = enforceProtocolRules([{ title: 'Grandma soup', group: 'meal', time: '12:30', notes: '', dos: [], donts: [], link: { kind: 'food', query: 'vegetable soup' } }]);
    expect(plan[0].title).toBe('Grandma soup');
  });
});

describe('meal slots (Breakfast / Lunch / Dinner / Snack)', () => {
  const field = (cs: ReturnType<typeof changesFor>, id: string, f: string) => cs.find((c) => c.item_id === id && c.field === f)?.to;
  it('meal and drink in the same slot get the slot as group_name, as separate items', () => {
    const m = row({ display_name: 'Oats', category: 'consume', subtype: 'meal', scheduled_time: '08:00:00' });
    const d = row({ display_name: 'Green tea', category: 'consume', subtype: 'drink', scheduled_time: '08:00:00' });
    const cs = changesFor([m, d]);
    expect(field(cs, m.id, 'group_name')).toBe('Breakfast');
    expect(field(cs, d.id, 'group_name')).toBe('Breakfast');
    expect(cs.some((c) => c.action === 'hide')).toBe(false);
  });
  it('slot mismatch: "Kitchari Lunch Bowl" saved as breakfast at 08:00 moves to Lunch 12:30', () => {
    const m = row({ display_name: 'Kitchari Lunch Bowl', category: 'consume', subtype: 'meal', scheduled_time: '08:00:00', group_name: 'Breakfast' });
    const cs = changesFor([m]);
    expect(field(cs, m.id, 'scheduled_time')).toBe('12:30:00');
    expect(field(cs, m.id, 'group_name')).toBe('Lunch');
  });
  it('a meal filed under Wellness moves to Consume', () => {
    const m = row({ display_name: 'Lentil dinner', category: 'do', subtype: 'wellness', scheduled_time: '18:30:00' });
    const linked = row({ display_name: 'Golden milk', category: 'do', subtype: 'wellness', scheduled_time: '21:00:00', catalog_recipe_id: 'r1' });
    const walk = row({ display_name: 'Walk after dinner', category: 'do', subtype: 'exercise', scheduled_time: '19:30:00' });
    const cs = changesFor([m, linked, walk]);
    expect(field(cs, m.id, 'category')).toBe('consume');
    expect(field(cs, linked.id, 'subtype')).toBe('meal');
    expect(field(cs, walk.id, 'category')).toBeUndefined();
  });
  it('supplements and activities named "snack" are not meals; custom group names are flagged, not overwritten', () => {
    const sup = row({ display_name: 'Ashwagandha', category: 'do', subtype: 'wellness', item_type: 'supplement', scheduled_time: '08:00:00', catalog_ingredient_id: 'i1' });
    const mv = row({ display_name: 'Movement Snack', category: 'do', subtype: 'exercise', scheduled_time: '10:00:00' });
    const custom = row({ display_name: 'Pre-bed protein', category: 'consume', subtype: 'meal', scheduled_time: '21:00:00', group_name: 'Nutrition Protocol' });
    const generic = row({ display_name: 'Warm lemon water', category: 'consume', subtype: 'drink', scheduled_time: '07:00:00', group_name: 'Consume' });
    const cs = changesFor([sup, mv, custom, generic]);
    expect(field(cs, sup.id, 'category')).toBeUndefined();
    expect(field(cs, mv.id, 'category')).toBeUndefined();
    expect(cs.find((c) => c.item_id === custom.id && c.field === 'group_name')?.action).toBe('flag');
    expect(field(cs, generic.id, 'group_name')).toBe('Breakfast');
    const dayPart = row({ display_name: 'Oats', category: 'consume', subtype: 'meal', scheduled_time: '08:00:00', group_name: 'Morning Hydration & Nutrition' });
    const own = row({ display_name: 'Oats', category: 'consume', subtype: 'meal', scheduled_time: '08:00:00', group_name: 'PAGG Supplement Stack' });
    const cs2 = changesFor([dayPart, own]);
    expect(field(cs2, dayPart.id, 'group_name')).toBe('Breakfast');
    expect(cs2.find((c) => c.item_id === own.id && c.field === 'group_name')?.action).toBe('flag');
  });
  it('items in the Supplements group stay in Supplements (Morning → Supplements), not a meal slot', () => {
    const flax = row({ display_name: 'Freshly ground flaxseed', category: 'consume', subtype: 'meal', scheduled_time: '07:30:00', group_name: 'Supplement' });
    const cs = changesFor([flax]);
    expect(cs.filter((c) => c.item_id === flax.id && (c.field === 'group_name' || c.field === 'scheduled_time'))).toHaveLength(0);
  });
  it('every meal sharing one time is spread by slot', () => {
    const ms = ['Porridge', 'Soup', 'Stew'].map((t, i) => row({ display_name: t, category: 'consume', subtype: 'meal', scheduled_time: '08:00:00', sort_order: i, day_number: 1 }));
    const cs = changesFor(ms);
    expect(ms.map((m) => field(cs, m.id, 'scheduled_time'))).toEqual(['08:00:00', '12:30:00', '18:30:00']);
    expect(ms.map((m) => field(cs, m.id, 'group_name'))).toEqual(['Breakfast', 'Lunch', 'Dinner']);
  });
  it('a split-out drink lands in the meal\'s slot', () => {
    const m = row({ display_name: 'Oats with green tea', category: 'consume', subtype: 'meal', scheduled_time: '08:00:00' });
    expect(changesFor([m]).find((c) => c.insert?.subtype === 'drink')?.insert?.group_name).toBe('Breakfast');
  });
  it('checker (new Protocols): meals get their slot; a titled slot wins over the clock', () => {
    const out = enforceProtocolRules([
      { title: 'Eat kitchari lunch bowl', group: 'meal', time: '08:00', notes: '', dos: [], donts: [] },
      { title: 'Oats', group: 'meal', time: '07:30', notes: '', dos: [], donts: [] },
      { title: 'Green tea', group: 'meal', time: '07:30', notes: '', dos: [], donts: [] },
      { title: 'Stew', group: 'meal', time: '19:00', notes: '', dos: [], donts: [] },
    ]);
    expect(out.find((s) => s.title === 'Kitchari lunch bowl')).toMatchObject({ mealSlot: 'Lunch', time: '12:30' });
    expect(out.find((s) => s.title === 'Oats')!.mealSlot).toBe('Breakfast');
    expect(out.find((s) => s.title === 'Green tea')!.mealSlot).toBe('Breakfast');
    expect(out.find((s) => s.title === 'Stew')!.mealSlot).toBe('Dinner');
  });
});

describe('sleep anchors', () => {
  it('renames Wake / Sleep and folds duplicates as rules', () => {
    const w = row({ display_name: 'Wake', category: 'sleep', scheduled_time: '06:00:00' });
    const s = row({ display_name: 'Sleep', category: 'sleep', scheduled_time: '22:00:00' });
    const s2 = row({ display_name: 'Sleep 8-10 Hours', category: 'sleep', scheduled_time: null });
    const l = row({ display_name: 'Lights Fully Off', category: 'sleep', scheduled_time: '22:30:00' });
    const cs = changesFor([w, s, s2, l]);
    expect(renamed(cs, w.id)).toBe('End Sleep');
    expect(renamed(cs, s.id)).toBe('Start Sleep');
    expect(cs.some((c) => c.item_id === s2.id && c.action === 'hide')).toBe(true);
    expect(cs.some((c) => c.item_id === l.id && c.action === 'hide')).toBe(true);
    expect(cs.filter((c) => c.action === 'insert' && c.insert?.parent_ref === s.id).map((c) => c.insert!.display_name)).toEqual(expect.arrayContaining(['Sleep 8-10 Hours', 'Lights Fully Off']));
  });
  it('no wake item: flagged in cleanup, added in new', () => {
    const s = row({ display_name: 'Bedtime', category: 'sleep', scheduled_time: '22:00:00' });
    expect(changesFor([s]).some((c) => c.action === 'flag' && /No wake item/.test(c.reason))).toBe(true);
    expect(changesFor([s], 'new').some((c) => c.action === 'insert' && c.insert?.display_name === 'End Sleep')).toBe(true);
  });
  it('bedtime after midnight is still the bedtime (not mistaken for early morning)', () => {
    const w = row({ display_name: 'Wake', category: 'sleep', scheduled_time: '08:00:00' });
    const early = row({ display_name: 'Sleep', category: 'sleep', scheduled_time: '22:00:00' });
    const late = row({ display_name: 'Go to bed', category: 'sleep', scheduled_time: '00:30:00' });
    const cs = changesFor([w, early, late]);
    expect(renamed(cs, late.id)).toBe('Start Sleep');
    expect(cs.some((c) => c.item_id === early.id && c.action === 'hide')).toBe(true);
  });
});

describe('sleep — regressions from the Staging dry run', () => {
  it('a second wake item at 04:00 is not taken as a bedtime after midnight', () => {
    const w = row({ display_name: 'Wake', category: 'sleep', scheduled_time: '06:00:00' });
    const w2 = row({ display_name: 'Wake at 4am', category: 'sleep', scheduled_time: '04:00:00' });
    const b = row({ display_name: 'Sleep', category: 'sleep', scheduled_time: '22:00:00' });
    const cs = changesFor([w, w2, b]);
    expect(renamed(cs, w2.id)).toBeUndefined();
    expect(renamed(cs, b.id)).toBe('Start Sleep');
    expect(cs.some((c) => c.item_id === w2.id && c.action === 'flag')).toBe(true);
  });
  it('bedtime advice in the title is kept as a do', () => {
    const b = row({ display_name: 'Sleep by 10pm, cool dark room', category: 'sleep', scheduled_time: '22:00:00' });
    expect(changesFor([b]).find((c) => c.item_id === `rule:${b.id}`)?.insert?.display_name).toBe('Sleep by 10pm, cool dark room');
  });
});

describe('hygiene sets', () => {
  it('pegging follows wake when wake moves', () => {
    const w = row({ display_name: 'End Sleep', category: 'sleep', scheduled_time: '07:00:00' });
    const h = row({ display_name: 'Morning hygiene', subtype: 'hygiene', scheduled_time: '07:10:00', filter: { anchor: { to: 'wake', offset_minutes: 10 } } });
    const moved = repegTimes([{ ...w, scheduled_time: '05:30:00' }, h]);
    expect(moved.find((r) => r.id === h.id)!.scheduled_time).toBe('05:40:00');
  });
  it('existing hygiene set is pegged, not duplicated by defaults', () => {
    const w = row({ display_name: 'Wake', category: 'sleep', scheduled_time: '06:00:00' });
    const b = row({ display_name: 'Sleep', category: 'sleep', scheduled_time: '22:00:00' });
    const h = row({ display_name: 'Morning hygiene', subtype: 'hygiene', scheduled_time: '06:15:00' });
    const cs = changesFor([w, b, h], 'new');
    expect(cs.find((c) => c.item_id === h.id && c.field === 'filter.anchor')?.to).toEqual({ to: 'wake', offset_minutes: 15 });
    expect(cs.some((c) => c.item_id === 'new:wake-hygiene')).toBe(false);
    expect(cs.some((c) => c.item_id === 'new:bedtime-hygiene')).toBe(true);
  });
  it('missing hygiene sets are only flagged in cleanup', () => {
    const cs = changesFor([row({ display_name: 'Wake', category: 'sleep', scheduled_time: '06:00:00' })]);
    expect(cs.filter((c) => c.action === 'insert')).toHaveLength(0);
    expect(cs.some((c) => /No morning hygiene set/.test(c.reason))).toBe(true);
  });
});

describe('sets', () => {
  it('parses set info from titles and notes', () => {
    expect(parseSetInfo('3x10 squats')).toMatchObject({ sets: 3, reps: 10 });
    expect(parseSetInfo('30 sec on / 30 off ×50')).toMatchObject({ work_seconds: 30, rest_seconds: 30, rounds: 50 });
    expect(parseSetInfo('37–60 seconds to start')).toMatchObject({ work_seconds: 37, work_seconds_max: 60 });
    expect(parseSetInfo('30 Power Breaths')).toMatchObject({ reps: 30 });
    expect(parseSetInfo('3 rounds')).toMatchObject({ rounds: 3 });
    expect(parseSetInfo('3x60 sec weighted', false)).toMatchObject({ sets: 3, work_seconds: 60 });
    expect(parseSetInfo('3x3 min rounds - boxer style', false)).toMatchObject({ sets: 3, work_seconds: 180 });
    expect(parseSetInfo('5 x 5-minute rounds', false)).toMatchObject({ sets: 5, work_seconds: 300 });
    expect(parseSetInfo('3 sets x 20-30 seconds', false)).toMatchObject({ sets: 3, work_seconds: 20, work_seconds_max: 30 }); // ranges start at the low end
    expect(parseSetInfo('Norwegian 4x4')).toEqual({});
    expect(parseSetInfo('10x50m sprints', false)).toEqual({ sets: 10 }); // distance, not reps
    expect(parseSetInfo('4x40 m farmers walk', false)).toEqual({ sets: 4 });
  });
  it('repeated titles become numbered rounds with the count in reps', () => {
    const a = row({ display_name: '30 Power Breaths', subtype: 'wellness', category: 'do', scheduled_time: '06:00:00', duration_minutes: 5 });
    const b = row({ display_name: '30 Power Breaths', subtype: 'wellness', category: 'do', scheduled_time: '06:07:00', duration_minutes: 6 });
    const cs = changesFor([a, b]);
    expect(renamed(cs, a.id)).toBe('Power breaths, round 1/2');
    expect(renamed(cs, b.id)).toBe('Power breaths, round 2/2');
    expect(cs.find((c) => c.item_id === a.id && c.field === 'reps')?.to).toBe(30);
  });
  it('untimed duplicate of a timed item is hidden', () => {
    const a = row({ display_name: 'Meditation', subtype: 'wellness', scheduled_time: '07:00:00', duration_minutes: 10 });
    const b = row({ display_name: 'Meditation', subtype: 'wellness', scheduled_time: null });
    expect(changesFor([a, b]).some((c) => c.item_id === b.id && c.action === 'hide')).toBe(true);
  });
  it('ice bath time comes from notes; missing values flagged', () => {
    const ice = row({ display_name: 'Ice Bath Full Immersion', subtype: 'wellness', scheduled_time: '06:40:00', duration_minutes: 2, notes: '37–60 seconds to start' });
    const bare = row({ display_name: 'Visualise the session', subtype: 'wellness', scheduled_time: '07:00:00' });
    const cs = changesFor([ice, bare]);
    expect(cs.find((c) => c.item_id === ice.id && c.field === 'work_seconds')?.to).toBe(37);
    expect(cs.some((c) => c.item_id === bare.id && c.action === 'flag')).toBe(true);
  });
});

describe('sets — false positives', () => {
  it('the same meal on different days is not a set of rounds', () => {
    const a = row({ display_name: 'Green giant smoothie', category: 'consume', subtype: 'meal', scheduled_time: '08:00:00', day_number: 1 });
    const b = row({ display_name: 'Green giant smoothie', category: 'consume', subtype: 'meal', scheduled_time: '08:00:00', day_number: 2 });
    expect(changesFor([a, b]).some((c) => /round/.test(String(c.to)))).toBe(false);
  });
  it('the same practice on different days is not a set either', () => {
    const a = row({ display_name: 'Meditation', subtype: 'wellness', scheduled_time: '07:00:00', duration_minutes: 10, day_number: 1 });
    const b = row({ display_name: 'Meditation', subtype: 'wellness', scheduled_time: '07:00:00', duration_minutes: 10, day_number: 2 });
    expect(changesFor([a, b]).some((c) => /round/.test(String(c.to)))).toBe(false);
  });
  it('coaching prose in notes is not parsed as set info', () => {
    const a = row({ display_name: 'Post-Cold Warm-Up & Body Scan', subtype: 'wellness', scheduled_time: '06:45:00', duration_minutes: 5, notes: 'Start with 30 seconds and build tolerance gradually over several weeks' });
    expect(changesFor([a]).some((c) => c.field === 'work_seconds')).toBe(false);
  });
});

describe('notes and drinks — regressions', () => {
  it('"639 Hz" in notes is not reps; "60s" is seconds', () => {
    expect(parseSetInfo('639 Hz tone, 10 min', false).reps).toBeUndefined();
    expect(parseSetInfo('Hold 60s', false).work_seconds).toBe(60);
  });
  it('water repeated in the day is not rounds', () => {
    const a = row({ display_name: 'Plain water', subtype: 'wellness', scheduled_time: '09:00:00' });
    const b = row({ display_name: 'Plain water', subtype: 'wellness', scheduled_time: '15:00:00' });
    expect(changesFor([a, b]).some((c) => /round/.test(String(c.to)))).toBe(false);
  });
});

describe('rules', () => {
  it('rule-like titles become rules', () => {
    for (const t of ['Avoid sugar', 'Seal 40% Rule Mental Override Training', 'Whole30 Elimination Rules', 'Lights Fully Off', 'Mindset = commit fully']) expect(isRuleLikeTitle(t)).toBe(true);
    expect(isRuleLikeTitle('Morning hygiene')).toBe(false);
  });
  it('Seal 40% rule attaches to the workout set', () => {
    const w = row({ display_name: 'Workout 1', subtype: 'exercise', scheduled_time: '16:00:00' });
    const k = row({ display_name: 'Do squats', subtype: 'exercise', parent_protocol_item_id: w.id });
    const r = row({ display_name: 'Seal 40% Rule Mental Override Training', subtype: 'exercise', scheduled_time: '16:00:00' });
    const cs = changesFor([w, k, r]);
    expect(cs.find((c) => c.item_id === `rule:${r.id}`)?.insert).toMatchObject({ parent_ref: w.id, kind: 'rule_do' });
  });
  it('"Avoid X" becomes a dont; with no host it is a top-level rule', () => {
    const r = row({ display_name: 'Avoid alcohol', subtype: 'wellness', scheduled_time: null });
    expect(changesFor([r]).find((c) => c.item_id === `rule:${r.id}`)?.insert).toMatchObject({ kind: 'rule_dont', parent_ref: undefined });
  });
  it('checker: category guidance is a group rule (Drinks / Consume), never pinned to one item', () => {
    const out = enforceProtocolRules([
      { title: 'Oats', group: 'meal', time: '08:00', notes: '', dos: [], donts: [], windowKey: 'd1' },
      { title: 'Warm water', group: 'meal', time: '07:15', notes: '', dos: [], donts: [], windowKey: 'd1' },
      { title: 'Avoid sugar', group: 'meal', time: null, notes: '', dos: [], donts: [], windowKey: 'd1' },
      { title: 'Limit caffeine intake', group: 'meal', time: null, notes: '', dos: [], donts: [], windowKey: 'd1' },
      { title: 'Avoid screens', group: 'wellness', time: null, notes: '', dos: [], donts: [], windowKey: 'd1' },
    ]);
    expect(out.find((s) => s.title === 'Oats')!.donts).toEqual([]);
    expect(out.find((s) => s.title === 'Warm water')!.donts).toEqual([]);
    expect(out.find((s) => s.title === 'Avoid sugar')).toMatchObject({ kind: 'rule', ruleGroup: 'consume', time: null });
    expect(out.find((s) => s.title === 'Limit caffeine intake')).toMatchObject({ kind: 'rule', ruleGroup: 'drinks', time: null });
    expect(out.find((s) => s.title === 'Avoid screens')).toMatchObject({ kind: 'rule', ruleGroup: 'general' });
  });
  it('rule group: drink subjects → Drinks, food → Consume, mixed diet → Consume', () => {
    expect(ruleGroupFor('Limit caffeine intake')).toBe('drinks');
    expect(ruleGroupFor('Avoid alcohol')).toBe('drinks');
    expect(ruleGroupFor('Skip coffee and black tea')).toBe('drinks');
    expect(ruleGroupFor('No added sugar')).toBe('consume');
    expect(ruleGroupFor('Avoid tyramine foods')).toBe('consume');
    expect(ruleGroupFor('Follow the clean diet: no pork, alcohol, salt')).toBe('consume');
    expect(ruleGroupFor('No supplements on fasting days')).toBe('supplements');
    expect(ruleGroupFor('Avoid screens')).toBe('general');
  });
  it('rule storage: Drinks = scope consume + subtype drink; Consume = scope consume + subtype meal', () => {
    expect(ruleRowFields('drinks')).toEqual({ scope: 'consume', subtype: 'drink', category: 'consume' });
    expect(ruleRowFields('consume')).toEqual({ scope: 'consume', subtype: 'meal', category: 'consume' });
    expect(ruleRowFields('general').scope).toBe('outside');
  });
  it('cleanup: "Limit caffeine intake" becomes a top-level Drinks rule, not a child of Warm water', () => {
    const w = row({ display_name: 'Warm water', category: 'consume', subtype: 'meal', scheduled_time: '07:15:00' });
    const c = row({ display_name: 'Limit caffeine intake', category: 'consume', subtype: 'meal', scheduled_time: null });
    const cs = changesFor([w, c]);
    expect(cs.some((x) => x.item_id === c.id && x.action === 'hide')).toBe(true);
    expect(cs.find((x) => x.item_id === `rule:${c.id}`)?.insert).toMatchObject({ parent_ref: undefined, kind: 'rule_do', scope: 'consume', subtype: 'drink' });
    expect(cs.some((x) => x.action === 'insert' && x.insert?.parent_ref === w.id)).toBe(false);
  });
  it('cleanup: "Avoid alcohol" is a Drinks dont; "No added sugar" a Consume dont', () => {
    const a = row({ display_name: 'Avoid alcohol', category: 'consume', subtype: 'meal' });
    const b = row({ display_name: 'No added sugar', category: 'consume', subtype: 'meal' });
    const cs = changesFor([a, b]);
    expect(cs.find((x) => x.item_id === `rule:${a.id}`)?.insert).toMatchObject({ kind: 'rule_dont', subtype: 'drink' });
    expect(cs.find((x) => x.item_id === `rule:${b.id}`)?.insert).toMatchObject({ kind: 'rule_dont', subtype: 'meal' });
  });
  it('contradictions between Protocols are detected', () => {
    const c = findContradictions(
      [{ protocol_id: 'detox', title: 'No caffeine', polarity: 'dont' }, { protocol_id: 'diet', title: 'No salt', polarity: 'dont' }],
      [{ protocol_id: 'fitness', title: 'Pre-workout coffee' }, { protocol_id: 'fitness', title: 'Electrolyte drink' }, { protocol_id: 'fitness', title: 'Decaf coffee' }],
    );
    expect(c.map((x) => x.subject).sort()).toEqual(['caffeine', 'salt']);
  });
});

describe('personal calendar entries', () => {
  it('flights and bookings are left alone', () => {
    for (const t of ['Flight to Warsaw (LO 574)', '[ Booked ] Airbnb • Vico Lazzi', '19:05 · €0 · 🚶 Storage → Metro', 'Luminaries — Beach Yoga & Breath']) expect(isCalendarEntry(t)).toBe(true);
    expect(isCalendarEntry('Morning hygiene')).toBe(false);
    const f = row({ display_name: 'Flight to Warsaw (LO 574)', subtype: 'wellness', scheduled_time: '10:00:00' });
    expect(changesFor([f]).filter((c) => c.item_id === f.id)).toHaveLength(0);
  });
});

describe('translations', () => {
  it('Polish title follows a standard rename, or is flagged stale', () => {
    const w = row({ display_name: 'Wake', category: 'sleep', scheduled_time: '06:00:00', translations: { pl: { display_name: 'Pobudka' } } });
    const a = row({ display_name: 'Eat plain rice', category: 'consume', subtype: 'meal', scheduled_time: '12:00:00', translations: { pl: { display_name: 'Zjedz ryż' } } });
    const cs = changesFor([w, a]);
    expect(cs.find((c) => c.item_id === w.id && c.field === 'translations.pl.display_name')?.to).toBe('Koniec snu');
    expect(cs.some((c) => c.item_id === a.id && c.action === 'flag' && /Polish/.test(c.reason))).toBe(true);
  });
  it('every rename keeps the old title as "Was"', () => {
    const w = row({ display_name: 'Wake', category: 'sleep', scheduled_time: '06:00:00' });
    expect(changesFor([w]).find((c) => c.field === 'filter.original_title')?.to).toBe('Wake');
  });
});

describe('paste-text planner (ceremony example)', () => {
  const email = `Hi all!\n\n7 days before the ceremony:\n- No pork, alcohol, salt or sugar.\n- Drop coffee and black tea.\n- Eat simple food: rice, vegetable soup, fruit.\n\nOn the day: a light meal, nothing after 3 PM, drink lots of water.\nWhat to bring: white clothes, mat, blanket.\n1-2 days after: boiled potatoes and eggs.\n\nWith love,\nAna`;
  const cleaned = cleanPastedText(email);
  const det = detectEvent(cleaned);
  const plan = localEventPlan(cleaned, '20:00', det.hasEvent);
  it('strips greeting and signature', () => { expect(cleaned).not.toMatch(/Hi all|With love/); });
  it('has End Sleep / Start Sleep only as sleep items', () => {
    expect(plan.items.filter((i) => i.group === 'sleep').map((i) => i.title).sort()).toEqual(['End Sleep', 'Start Sleep']);
  });
  it('no meal title starts with a verb; water is a drink-named item', () => {
    for (const i of plan.items.filter((x) => x.group === 'meal' && x.kind !== 'rule' && !/^Stop/.test(x.title))) expect(i.title).not.toMatch(/^(Eat|Have|Drink)\b/);
    expect(plan.items.some((i) => i.title === 'Water')).toBe(true);
  });
  it('every action has a time; avoid lists are rules', () => {
    for (const i of plan.items.filter((x) => x.kind !== 'rule')) expect(i.time).toMatch(/^\d\d:\d\d$/);
    // Same date window as the meals → a don't on the first meal; otherwise a dated top-level rule. Never a step.
    const host = plan.items.find((i) => i.donts.includes('Pork'))!;
    expect(host).toMatchObject({ kind: 'rule', ruleGroup: 'consume', time: null });
    expect(plan.items.find((i) => i.donts.includes('Coffee'))).toMatchObject({ kind: 'rule', ruleGroup: 'drinks' });
    expect(plan.items.some((i) => /^(No|Avoid|Drop)\b/.test(i.title) && i.kind !== 'rule')).toBe(false);
  });
  it('cut-off and packing list', () => {
    expect(plan.cutoffTime).toBe('15:00');
    expect(plan.items.find((i) => /^Pack/.test(i.title))?.subtasks).toEqual(expect.arrayContaining(['white clothes', 'mat', 'blanket']));
  });
});

describe('basics only for their own routines', () => {
  it('adds no sleep anchors or hygiene sets to a fitness routine', () => {
    const rows = [{ id: 'w', display_name: 'Push Day Workout', kind: 'action', category: 'do', subtype: 'exercise', scheduled_time: '08:30:00' }] as Row[];
    const c = standardiseProtocol(rows, 'new', 'Strength');
    expect(c.some((x) => x.insert && /sleep|hygiene/i.test(String(x.insert.display_name)))).toBe(false);
    expect(c.some((x) => /End Sleep|Start Sleep|hygiene set/i.test(x.reason))).toBe(false);
  });
  it('still adds them to a hygiene routine', () => {
    const c = standardiseProtocol([] as Row[], 'new', 'Hygiene');
    expect(c.some((x) => x.insert?.display_name === 'Morning hygiene')).toBe(true);
  });
});
