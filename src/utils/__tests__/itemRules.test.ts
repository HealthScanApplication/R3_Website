import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { AVOID_TITLE, CONSTRAINT_WORD, DRINK_NAME, TAKE_VERB, enforceProtocolRules, isBareItemTitle, takeGroupOf, type RuleStep } from '../protocolRules';
import { gateProtocolItem } from '../protocolGate';
import { itemRuleFields, ruleRowIsItem, standardiseProtocol, type Row } from '../routineStandard';

/** A thing to take is a step, never a rule: "Do: Chlorella" / "Do: Drink Water" under a day's rules had no time and nothing to tick off. */
describe('isBareItemTitle', () => {
  it('names of things to take are bare items', () => {
    for (const t of ['Chlorella', 'Milk Thistle', 'N-Acetyl Cysteine', 'Drink Water', 'Take magnesium', 'Pinch of Whole Salt (Celtic / Himalayan)', 'Vitamin D 2000 IU', 'Activated charcoal']) expect(isBareItemTitle(t), t).toBe(true);
  });
  it('constraints and guidance are not', () => {
    for (const t of ["Don't skimp on water", 'No alcohol on detox days', 'No charcoal with food', 'Drink water during every session', 'Eat protein at lunch', 'Eat the rainbow daily', 'Sip water slowly',
      'Follow every label', 'Pause All Supplements', 'Fewer supplements, not more', 'Check label: T. chebula', 'Keep binder 2 h from everything', 'Limit caffeine', 'Drink', 'Milk Thistle dose 2x', 'Supplies for 40 days',
      'Gentle Start (no greens yet)', 'Add Green-Barley + Wheat Grass blend', '']) expect(isBareItemTitle(t), t).toBe(false);
  });
  it('only supplements and plain drinks count as things to take; food names and activities stay as they are', () => {
    expect(takeGroupOf('Chlorella', 'supplements')).toBe('supplement');
    expect(takeGroupOf('Drink Water', 'consume')).toBe('drink');
    expect(takeGroupOf('Green tea', 'meal')).toBe('drink');
    expect(takeGroupOf('Mediterranean diet', 'consume')).toBeNull(); // a diet label is guidance, not a dish
    expect(takeGroupOf('Sauna', 'do')).toBeNull();
  });
});

const step = (over: Partial<RuleStep>): RuleStep => ({ title: '', group: 'wellness', time: null, notes: '', dos: [], donts: [], windowKey: '1', ...over });

describe('AI draft: a bare supplement or drink saved as a rule becomes a step', () => {
  const out = enforceProtocolRules([
    step({ title: 'Chlorella', group: 'supplements', kind: 'rule', notes: 'Split into 3 × 1 g doses with meals.' }),
    step({ title: 'Drink Water', group: 'consume', kind: 'rule', notes: 'Increase water to 3+ litres.' }),
    step({ title: 'Limit caffeine', group: 'consume', kind: 'rule', donts: ['Coffee after noon'] }),
    step({ title: 'Follow every label', group: 'supplements', kind: 'rule' }),
    step({ title: 'Drink water during every session', group: 'consume', kind: 'rule' }),
  ]);
  const by = (t: string) => out.find((s) => s.title === t)!;
  it('Chlorella is an action with a time and a note saying why', () => {
    expect(by('Chlorella')).toMatchObject({ kind: 'action', time: '08:00' });
    expect(by('Chlorella').issues!.map((i) => i.code)).toContain('rule_to_step');
  });
  it('Drink Water becomes the step "Water" in a slot, with a time', () => {
    const water = out.find((s) => s.title === 'Water')!;
    expect(water).toMatchObject({ kind: 'action', time: '12:30', mealSlot: 'Lunch' });
    expect(water.issues!.map((i) => i.code)).toContain('rule_to_step');
  });
  it('real constraints stay rules', () => {
    expect(by('Limit caffeine').kind).toBe('rule');
    expect(by('Follow every label').kind).toBe('rule');
    expect(by('Drink water during every session').kind).toBe('rule');
  });
});

const rule = (over: Partial<Row>): Row => ({ id: 'r', display_name: '', kind: 'rule_do', category: 'supplement', item_type: 'supplement', subtype: 'supplement', scope: 'supplement', ...over });

describe('write gate: a scheduled "Do: <item>" rule is saved as the step it was meant to be', () => {
  it('Chlorella on day 2 (supplement) and Drink Water on day 1 (consume)', () => {
    const c = gateProtocolItem(rule({ display_name: 'Chlorella', day_number: 2, group_name: 'Chelation', notes: 'Split into 3 × 1 g doses with meals.' }));
    expect(c.item).toMatchObject({ kind: 'action', scope: null, category: 'supplement', item_type: 'supplement', subtype: 'supplement', scheduled_time: '12:30:00' });
    expect(c.warnings.some((w) => /something to take/.test(w.message))).toBe(true);
    const w = gateProtocolItem(rule({ display_name: 'Drink Water', day_number: 1, category: 'consume', item_type: 'consume', subtype: 'beverage', scope: 'consume', group_name: 'Hydration' }));
    expect(w.item).toMatchObject({ kind: 'action', scope: null, category: 'consume', subtype: 'drink', scheduled_time: '08:00:00' });
  });
  it('a rule that already has a time keeps it', () => {
    expect(gateProtocolItem(rule({ display_name: 'Pinch of Whole Salt (Celtic / Himalayan)', scheduled_time: '10:59:00', scope: 'consume' })).item).toMatchObject({ kind: 'action', scheduled_time: '10:59:00', subtype: 'supplement' });
  });
  it('standing rules, children, Don\'ts and real constraints are left alone', () => {
    expect(gateProtocolItem(rule({ display_name: 'Activated charcoal' })).item.kind).toBe('rule_do'); // no day, no time: a kit-list rule
    expect(gateProtocolItem(rule({ display_name: 'Chlorella', day_number: 2, parent_protocol_item_id: 'p' })).item.kind).toBe('rule_do');
    expect(gateProtocolItem(rule({ display_name: 'Chlorella', day_number: 2, kind: 'rule_dont' })).item.kind).toBe('rule_dont');
    expect(gateProtocolItem(rule({ display_name: 'Follow every label', day_number: 2 })).item.kind).toBe('rule_do');
    expect(gateProtocolItem(rule({ display_name: 'Drink water during every session', category: 'consume', scope: 'consume', day_number: 1 })).item.kind).toBe('rule_do');
  });
});

describe('the standard flags and fixes the rows that are already saved', () => {
  // The six rows from "Monthly 3-Day Supplement Plan" on staging.
  const rows: Row[] = [
    rule({ id: 'chl', display_name: 'Chlorella', day_number: 2, group_name: 'Chelation', notes: 'Split into 3 × 1 g doses with meals. Broken-cell-wall chlorella has superior bioavailability.' }),
    rule({ id: 'mt', display_name: 'Milk Thistle', day_number: 3, group_name: 'Liver Support', notes: '200–400 mg standardised to 70–80% silymarin. Take with food.' }),
    rule({ id: 'nac', display_name: 'N-Acetyl Cysteine', day_number: 3, group_name: 'Liver Support', notes: '600 mg NAC with food.' }),
    ...[1, 2, 3].map((d) => rule({ id: `w${d}`, display_name: 'Drink Water', day_number: d, category: 'consume', item_type: 'consume', subtype: 'beverage', scope: 'consume', group_name: 'Hydration' })),
    { id: 'a', display_name: 'Activated Charcoal', kind: 'action', category: 'supplement', item_type: 'supplement', subtype: 'supplement', scheduled_time: '10:00:00', day_number: 1 },
  ];
  it('all six become steps; the real step is untouched', () => {
    const changes = standardiseProtocol(rows, 'cleanup', 'Detox');
    const kinds = changes.filter((c) => c.field === 'kind');
    expect(kinds.map((c) => c.item_id).sort()).toEqual(['chl', 'mt', 'nac', 'w1', 'w2', 'w3']);
    expect(kinds.every((c) => c.to === 'action')).toBe(true);
    const time = (id: string) => changes.find((c) => c.item_id === id && c.field === 'scheduled_time')?.to;
    expect([time('chl'), time('mt'), time('nac'), time('w1')]).toEqual(['12:30:00', '12:30:00', '12:30:00', '08:00:00']);
    expect(changes.some((c) => c.item_id === 'a' && c.field === 'kind')).toBe(false);
  });
  it('itemRuleFields keeps day, group and notes (it only retypes)', () => {
    const f = itemRuleFields(rows[0]);
    expect(Object.keys(f).sort()).toEqual(['category', 'item_type', 'kind', 'scheduled_time', 'scope', 'subtype']);
  });
  it('day instructions and standing kit rules on the same protocols are not touched', () => {
    for (const r of [
      rule({ display_name: 'Milk Thistle dose 2x', day_number: 3, scheduled_time: '07:45:00', scope: 'consume' }),
      rule({ display_name: 'Gentle Start (no greens yet)', day_number: 1, scheduled_time: '07:45:00', category: 'consume', item_type: 'recipe', subtype: 'meal', scope: 'consume' }),
      rule({ display_name: 'Add Green-Barley + Wheat Grass blend', day_number: 2, scheduled_time: '07:45:00', category: 'consume', item_type: 'recipe', subtype: 'meal', scope: 'consume' }),
      rule({ display_name: 'Digest Support Tincture' }),
      rule({ display_name: 'Drink Water', category: 'consume', item_type: 'consume', subtype: 'meal', scope: 'consume' }), // standing hydration target
    ]) expect(ruleRowIsItem(r), r.display_name || '').toBe(false);
  });
});

describe('the AI builder function keeps the same pattern and tells the model', () => {
  const server = readFileSync('supabase/functions/make-server-ed0fe4c2/index.tsx', 'utf8');
  const literal = (name: string) => new RegExp(`^const ${name} = /(.*)/i$`, 'm').exec(server)?.[1];
  it.each([['AVOID_TITLE', AVOID_TITLE], ['TAKE_VERB', TAKE_VERB], ['CONSTRAINT_WORD', CONSTRAINT_WORD], ['DRINK_NAME', DRINK_NAME]] as const)('%s is identical on the server', (name, re) => {
    expect(literal(name)).toBe(re.source);
  });
  it('the prompt says a thing to take is never a rule, and the response is corrected when the model does it anyway', () => {
    expect(server).toMatch(/A supplement, food or drink the person takes is always a step/);
    expect(server).toMatch(/kind: step\.kind === 'rule' && !isTakeItemStep\(/);
  });
});
