import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { enforceProtocolRules, isBareItemTitle, takeGroupOf, type RuleStep } from '../protocolRules';
import { gateProtocolItem } from '../protocolGate';
import { itemRuleFields, ruleRowIsItem, standardiseProtocol, timedRuleRowIsItem, type Row } from '../routineStandard';

/** A thing to take is a step, never a rule: "Do: Chlorella" / "Do: Drink Water" under a day's rules had no time and nothing to tick off. */
describe('isBareItemTitle', () => {
  it('names of things to take are bare items', () => {
    for (const t of ['Chlorella', 'Milk Thistle', 'N-Acetyl Cysteine', 'Drink Water', 'Take magnesium', 'Pinch of Whole Salt (Celtic / Himalayan)', 'Vitamin D 2000 IU', 'Activated charcoal', 'Chlorella (3 x 1 g)', 'Water (3 L)']) expect(isBareItemTitle(t), t).toBe(true);
  });
  it('constraints and guidance are not', () => {
    for (const t of ["Don't skimp on water", 'No alcohol on detox days', 'No charcoal with food', 'Drink water during every session', 'Eat protein at lunch', 'Eat the rainbow daily', 'Sip water slowly',
      'Follow every label', 'Pause All Supplements', 'Fewer supplements, not more', 'Check label: T. chebula', 'Keep binder 2 h from everything', 'Limit caffeine', 'Drink', 'Milk Thistle dose 2x', 'Supplies for 40 days',
      'Gentle Start (no greens yet)', 'Add Green-Barley + Wheat Grass blend', 'Quit coffee', 'Eliminate caffeine', 'Steer clear of caffeine', 'Consult your doctor', 'Hydrate', 'Don’t take iron', '']) expect(isBareItemTitle(t), t).toBe(false);
  });
});

describe('takeGroupOf: supplements need a sign they are a product; drinks must be plain liquids', () => {
  it('real items', () => {
    expect(takeGroupOf('Chlorella', 'supplements', { notes: 'Split into 3 × 1 g doses with meals.' })).toBe('supplement');
    expect(takeGroupOf('Chlorella', 'supplements', { linked: true })).toBe('supplement');
    expect(takeGroupOf('Take magnesium', 'supplements')).toBe('supplement');
    expect(takeGroupOf('Pinch of Whole Salt (Celtic / Himalayan)', 'supplements')).toBe('supplement');
    expect(takeGroupOf('Vitamin D 2000 IU', 'supplement')).toBe('supplement');
    for (const t of ['Drink Water', 'Water', 'Lemon water', 'Green tea', 'Drink green tea', 'Water (3 L)', 'Drink Water (filtered)']) expect(takeGroupOf(t, 'consume'), t).toBe('drink');
  });
  it('headings, advice and avoidance are not supplements, even bare', () => {
    for (const t of ['Supplements', 'Medications', 'Blood thinners', 'Binders', 'Binder spacing', 'Consult your doctor', 'Seek medical advice', 'Pregnancy safety', 'Drug interactions', 'Warnings', 'Note', 'Tips', 'Start low, go slow', 'Be consistent', 'Choose quality brands', 'Store in fridge', 'Shake well'])
      expect(takeGroupOf(t, 'supplements', { notes: 'Aspirin 81 mg interacts; tell your surgeon.' }), t).toBeNull(); // a dose in the note does not make a heading a product
    for (const t of ['Alcohol', 'Caffeine', 'Fasting', 'Hydrate', 'Quit coffee', 'Don’t take iron']) expect(takeGroupOf(t, 'supplements'), t).toBeNull();
  });
  it('a supplement name with no dose, no "Take" and no link is left as it is', () => {
    expect(takeGroupOf('Magnesium', 'supplements', { notes: 'Calms the nervous system.' })).toBeNull();
  });
  it('drinks: guidance about drinks is not a drink', () => {
    for (const t of ['Choose water over juice', 'Choose water', 'Use filtered water', 'Prefer still water', 'Filter your water', 'Minimise juice', 'Eliminate juice', 'Ditch juice', 'Lots of water', 'Extra water', 'Herbal tea or water', 'Coffee after noon', 'Bone broth with turmeric'])
      expect(takeGroupOf(t, 'consume'), t).toBeNull();
  });
  it('foods, diet labels and activities are never converted', () => {
    expect(takeGroupOf('Mediterranean diet', 'consume')).toBeNull();
    expect(takeGroupOf('Vegetable soup', 'consume')).toBeNull();
    expect(takeGroupOf('Sauna', 'do')).toBeNull();
  });
});

const step = (over: Partial<RuleStep>): RuleStep => ({ title: '', group: 'wellness', time: null, notes: '', dos: [], donts: [], windowKey: '1', ...over });

describe('AI draft: a bare supplement or drink saved as a rule becomes a step', () => {
  const out = enforceProtocolRules([
    step({ title: 'Magnesium (400 mg)', group: 'supplements', kind: 'rule', notes: 'Take at bedtime.' }),
    step({ title: 'Chlorella', group: 'supplements', kind: 'rule', notes: 'Split into 3 × 1 g doses with meals.' }),
    step({ title: 'Milk Thistle', group: 'supplements', kind: 'rule', notes: '200–400 mg standardised to 70–80% silymarin.' }),
    step({ title: 'Drink Water', group: 'consume', kind: 'rule', notes: 'Increase water to 3+ litres.' }),
    step({ title: 'Limit caffeine', group: 'consume', kind: 'rule', donts: ['Coffee after noon'] }),
    step({ title: 'Follow every label', group: 'supplements', kind: 'rule' }),
    step({ title: 'Drink water during every session', group: 'consume', kind: 'rule' }),
    step({ title: 'Coffee', group: 'meal', kind: 'rule', donts: ['After noon'], dos: ['Herbal tea', 'Water'] }),
    step({ title: 'Supplements', group: 'supplements', kind: 'rule', donts: ['Iron within 2 h of calcium'] }),
    step({ title: 'Blood thinners', group: 'supplements', kind: 'rule', notes: 'Aspirin 81 mg interacts.' }),
  ]);
  const by = (t: string) => out.find((s) => s.title === t)!;
  it('Chlorella is an action with a time, placed by the meal its note names', () => {
    expect(by('Chlorella')).toMatchObject({ kind: 'action', time: '12:30' });
    expect(by('Chlorella').issues!.map((i) => i.code)).toContain('rule_to_step');
    expect(by('Milk Thistle')).toMatchObject({ kind: 'action', time: '08:00' });
  });
  it('an untimed supplement is placed by the time its note names, not a generic default', () => {
    expect(by('Magnesium (400 mg)')).toMatchObject({ kind: 'action', time: '21:30' });
  });
  it('Drink Water becomes the step "Water", in the breakfast slot at 08:00', () => {
    const water = out.find((s) => s.title === 'Water')!;
    expect(water).toMatchObject({ kind: 'action', time: '08:00', mealSlot: 'Breakfast' });
    expect(water.issues!.map((i) => i.code)).toContain('rule_to_step');
  });
  it('real constraints and rules that list Don\'ts stay rules', () => {
    for (const t of ['Limit caffeine', 'Follow every label', 'Drink water during every session', 'Coffee', 'Supplements']) expect(by(t).kind, t).toBe('rule');
    expect(by('Coffee').dos).toEqual(['Herbal tea', 'Water']); // the allowed alternatives stay a checklist
  });
  it('a heading with a dose in its note is not a product', () => {
    expect(by('Blood thinners').kind).toBe('rule');
  });
});

const rule = (over: Partial<Row>): Row => ({ id: 'r', display_name: '', kind: 'rule_do', category: 'supplement', item_type: 'supplement', subtype: 'supplement', scope: 'supplement', ...over });

describe('write gate: a "Do: <item>" rule with a clock time is saved as the step it was meant to be', () => {
  it('a timed Chlorella (supplement) and a timed Drink Water (consume)', () => {
    const c = gateProtocolItem(rule({ display_name: 'Chlorella', scheduled_time: '12:00:00', day_number: 2, group_name: 'Chelation', notes: 'Split into 3 × 1 g doses with meals.' }));
    expect(c.item).toMatchObject({ kind: 'action', scope: null, category: 'supplement', item_type: 'supplement', subtype: 'supplement', scheduled_time: '12:00:00' });
    expect(c.warnings.some((w) => /something to take/.test(w.message))).toBe(true);
    const w = gateProtocolItem(rule({ display_name: 'Drink Water', scheduled_time: '09:00:00', category: 'consume', item_type: 'consume', subtype: 'beverage', scope: 'consume', group_name: 'Hydration' }));
    expect(w.item).toMatchObject({ kind: 'action', scope: null, category: 'consume', subtype: 'drink', scheduled_time: '09:00:00' });
  });
  it('the timed salt doses', () => {
    expect(gateProtocolItem(rule({ display_name: 'Pinch of Whole Salt (Celtic / Himalayan)', scheduled_time: '10:59:00', scope: 'consume' })).item).toMatchObject({ kind: 'action', scheduled_time: '10:59:00', subtype: 'supplement' });
  });
  it('rows the builders write stay rules: a rule\'s allowed alternatives are day-1 rules with no time', () => {
    for (const title of ['Herbal tea', 'Water', 'Lemon water']) {
      const r = gateProtocolItem(rule({ display_name: title, day_number: 1, category: 'consume', item_type: 'consume', subtype: 'drink', scope: 'consume', notes: '' }));
      expect(r.item.kind, title).toBe('rule_do');
    }
    expect(gateProtocolItem(rule({ display_name: 'Chlorella', day_number: 2, notes: 'Split into 3 × 1 g doses.' })).item.kind).toBe('rule_do'); // day only: flagged in data, not converted on write
  });
  it('standing rules, children, Don\'ts and real constraints are left alone', () => {
    expect(gateProtocolItem(rule({ display_name: 'Activated charcoal' })).item.kind).toBe('rule_do'); // no day, no time: a kit-list rule
    expect(gateProtocolItem(rule({ display_name: 'Chlorella', scheduled_time: '12:00:00', parent_protocol_item_id: 'p' })).item.kind).toBe('rule_do');
    expect(gateProtocolItem(rule({ display_name: 'Chlorella', scheduled_time: '12:00:00', kind: 'rule_dont' })).item.kind).toBe('rule_dont');
    expect(gateProtocolItem(rule({ display_name: 'Follow every label', scheduled_time: '12:00:00' })).item.kind).toBe('rule_do');
    expect(gateProtocolItem(rule({ display_name: 'Drink water during every session', category: 'consume', scope: 'consume', scheduled_time: '12:00:00' })).item.kind).toBe('rule_do');
  });
});

describe('the standard reports the rows that are already saved', () => {
  // The six rows from "Monthly 3-Day Supplement Plan" on staging (day only, no time).
  const rows: Row[] = [
    rule({ id: 'chl', display_name: 'Chlorella', day_number: 2, group_name: 'Chelation', catalog_product_id: 'prod_custom_chlorella', notes: 'Split into 3 × 1 g doses with meals. Broken-cell-wall chlorella has superior bioavailability.' }),
    rule({ id: 'mt', display_name: 'Milk Thistle', day_number: 3, group_name: 'Liver Support', notes: '200–400 mg standardised to 70–80% silymarin. Take with food.' }),
    rule({ id: 'nac', display_name: 'N-Acetyl Cysteine', day_number: 3, group_name: 'Liver Support', notes: '600 mg NAC with food.' }),
    ...[1, 2, 3].map((d) => rule({ id: `w${d}`, display_name: 'Drink Water', day_number: d, category: 'consume', item_type: 'consume', subtype: 'beverage', scope: 'consume', group_name: 'Hydration', notes: d === 1 ? 'Increase water to 3+ litres. Add lemon juice.' : 'Final day of elevated hydration.' })),
    { id: 'a', display_name: 'Activated Charcoal', kind: 'action', category: 'supplement', item_type: 'supplement', subtype: 'supplement', scheduled_time: '10:00:00', day_number: 1 },
  ];
  it('day-only rules are flagged, not rewritten; the real step is untouched', () => {
    const changes = standardiseProtocol(rows, 'cleanup', 'Detox');
    const flagged = changes.filter((c) => c.action === 'flag' && c.field === 'kind');
    expect(flagged.map((c) => c.item_id).sort()).toEqual(['chl', 'mt', 'nac', 'w1', 'w2', 'w3']);
    expect(changes.some((c) => c.action === 'update' && ['chl', 'mt', 'nac', 'w1'].includes(c.item_id))).toBe(false);
    expect(changes.some((c) => c.item_id === 'a')).toBe(false);
  });
  it('a rule with a clock time is retyped as a step and keeps its time', () => {
    const salt = rule({ id: 'salt', display_name: 'Pinch of Whole Salt (Celtic / Himalayan)', scope: 'consume', scheduled_time: '10:59:00', group_name: 'Daily Schedule' });
    const changes = standardiseProtocol([salt], 'cleanup', 'Detox').filter((c) => c.item_id === 'salt');
    expect(changes.find((c) => c.field === 'kind')).toMatchObject({ action: 'update', from: 'rule_do', to: 'action' });
    expect(changes.find((c) => c.field === 'scope')).toMatchObject({ to: null });
    expect(changes.some((c) => c.field === 'scheduled_time')).toBe(false);
    expect(timedRuleRowIsItem(salt)).toBe(true);
  });
  it('the fields to retype keep day, group and notes; the time follows the meal the note names', () => {
    expect(Object.keys(itemRuleFields(rows[0])).sort()).toEqual(['category', 'item_type', 'kind', 'scheduled_time', 'scope', 'subtype']);
    expect([rows[0], rows[1], rows[2], rows[3]].map((r) => itemRuleFields(r).scheduled_time)).toEqual(['12:30:00', '12:30:00', '12:30:00', '08:00:00']);
    expect(itemRuleFields(rule({ display_name: 'Magnesium glycinate (400 mg)', notes: 'Not at night, it can be stimulating for some.' })).scheduled_time).toBe('08:00:00'); // a negation is not a time
  });
  it('day instructions, standing kit rules and day-1 alternatives on the same protocols are not touched', () => {
    for (const r of [
      rule({ display_name: 'Milk Thistle dose 2x', day_number: 3, scheduled_time: '07:45:00', scope: 'consume' }),
      rule({ display_name: 'Gentle Start (no greens yet)', day_number: 1, scheduled_time: '07:45:00', category: 'consume', item_type: 'recipe', subtype: 'meal', scope: 'consume' }),
      rule({ display_name: 'Add Green-Barley + Wheat Grass blend', day_number: 2, scheduled_time: '07:45:00', category: 'consume', item_type: 'recipe', subtype: 'meal', scope: 'consume' }),
      rule({ display_name: 'Digest Support Tincture' }),
      rule({ display_name: 'Drink Water', category: 'consume', item_type: 'consume', subtype: 'meal', scope: 'consume' }), // standing hydration target
      rule({ display_name: 'Herbal tea', day_number: 1, category: 'consume', item_type: 'consume', subtype: 'drink', scope: 'consume', notes: '' }), // a rule's allowed alternative
      rule({ display_name: 'Restores glutathione levels', day_number: 1, parent_protocol_item_id: 'x' }),
    ]) expect(ruleRowIsItem(r), r.display_name || '').toBe(false);
  });
});

/** The edge function only tells the model; the shared checker (above) does the correcting, with the right time. */
describe('the AI builder function', () => {
  const server = readFileSync('supabase/functions/make-server-ed0fe4c2/index.tsx', 'utf8');
  it('tells the model a thing to take is never a rule, and leaves the correction to the shared checker', () => {
    expect(server).toMatch(/A supplement, food or drink the person takes is always a step/);
    expect(server).toMatch(/kind: step\.kind === 'rule' \? 'rule' : 'action'/);
    expect(server).not.toMatch(/isTakeItemStep/);
  });
});
