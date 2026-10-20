/*
 * Hard gate for protocol_items writes on the website. createProtocolItem / updateProtocolItem (protocolAdmin.ts)
 * run every row through here, so the editor, Guardian builder, Diet / Fitness / Combine, admin and imports all get
 * the same rules as the AI builders. Single-row rules only (the whole-day rules live in protocolRules /
 * routineStandard and run where a whole day is known):
 *
 *  - sleep anchors: a wake row is "End Sleep"; a plain bedtime row is "Start Sleep"
 *  - meals / drinks: dish or drink name without a verb; slot (group_name) Breakfast / Lunch / Dinner / Snack from
 *    the title, else the time; a slot named in the title moves the time into that slot's window
 *  - "Avoid X" / "Limit caffeine" saved as a step becomes a rule (Drinks / Consume / general group rule)
 *  - the reverse: a "Do: Chlorella" / "Do: Drink Water" rule with a clock time (a supplement or drink named as a bare item)
 *    becomes the step it was meant to be
 *  - set info filled from the title when the fields are empty
 *  - the old title is kept as "Was" (filter.original_title) when a title is changed by the gate
 * Personal calendar entries, rule rows and Supplements stay untouched. Warnings go to listeners so the editor can
 * show them live.
 */
import { END_SLEEP, START_SLEEP, PLAIN_BEDTIME, isWakeTitle, mealTitle, ruleGroupFor, ruleRowFields } from './protocolRules';
import { consumeKind, isCalendarEntry, isRuleLikeTitle, itemRuleFields, parseSetInfo, slotFromTitle, SLOT_TITLE, SLOT_WINDOW, mealSlotFor, timedRuleRowIsItem } from './routineStandard';

export interface GateWarning { field: string; message: string }
type Item = Record<string, any>;
type Listener = (title: string, warnings: GateWarning[]) => void;
const listeners = new Set<Listener>();
/** The editor subscribes to show what the gate changed or flagged. */
export function onGateWarnings(fn: Listener): () => void { listeners.add(fn); return () => listeners.delete(fn); }

const hhmm = (t?: string | null) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const GENERIC_SLOT_GROUP = /^(|consume|consumption|food|foods|meals?|nutrition|drinks?|beverages?|breakfast|lunch|dinner|snack|morning|midday|afternoon|evening|night)$/i;

/**
 * Returns the row to write plus warnings. `existing` is the stored row for updates (so a patch that only changes
 * the title still knows the category); for creates it is undefined.
 */
export function gateProtocolItem(patch: Item, existing?: Item): { item: Item; warnings: GateWarning[] } {
  const result = gate(patch, existing);
  if (result.warnings.length) for (const fn of listeners) fn(result.item.display_name || String(patch.display_name ?? existing?.display_name ?? ''), result.warnings);
  return result;
}

/** Same rules without notifying listeners: for showing warnings on rows already on screen. */
export function checkProtocolItem(patch: Item, existing?: Item) { return gate(patch, existing); }

function gate(patch: Item, existing?: Item): { item: Item; warnings: GateWarning[] } {
  let row = { ...(existing || {}), ...patch };
  const out: Item = { ...patch };
  const warnings: GateWarning[] = [];
  const title = String(row.display_name ?? '').trim();
  // A "Do: Chlorella" / "Do: Drink Water" rule that has a clock time is a step: save it as the step. (A rule with only a day stays:
  // builders write allowed alternatives like "Herbal tea" as day-1 rules.)
  if (timedRuleRowIsItem(row as any)) {
    const fields = itemRuleFields(row as any);
    Object.assign(out, fields);
    row = { ...row, ...fields };
    warnings.push({ field: 'kind', message: `“${title}” is something to take: saved as a step at ${String(fields.scheduled_time).slice(0, 5)}, not a rule` });
  }
  const kind = row.kind || 'action';
  if (!title || kind !== 'action' || isCalendarEntry(title)) return { item: out, warnings };
  const isChild = Boolean(row.parent_protocol_item_id);
  const setTitle = (to: string, why: string) => {
    if (to === title) return;
    out.display_name = to;
    out.filter = { ...(row.filter || {}), ...(out.filter || {}), original_title: row.filter?.original_title || title };
    warnings.push({ field: 'display_name', message: `${why}: “${title}” → “${to}”` });
  };

  // Sleep anchors.
  if (row.category === 'sleep' && !isChild) {
    if (isWakeTitle(title)) setTitle(END_SLEEP, 'Wake anchor');
    else if (PLAIN_BEDTIME.test(title)) setTitle(START_SLEEP, 'Bedtime anchor');
    else if (title !== END_SLEEP && title !== START_SLEEP) warnings.push({ field: 'display_name', message: `Sleep advice “${title}” belongs as a do on Start Sleep, not a sleep item` });
    return { item: out, warnings };
  }

  // A rule saved as a step → top-level group rule (never pinned to one item).
  if (!isChild && isRuleLikeTitle(title)) {
    const fields = ruleRowFields(ruleGroupFor(title, row.category === 'consume' ? 'meal' : row.category));
    Object.assign(out, { kind: /^(avoid|no|don'?t|do not|never|skip)\b/i.test(title) ? 'rule_dont' : 'rule_do', scheduled_time: null, ...fields });
    warnings.push({ field: 'kind', message: `“${title}” is a rule, saved on ${fields.subtype === 'drink' ? 'Drinks' : fields.scope === 'consume' ? 'Consume' : 'the day'}` });
    return { item: out, warnings };
  }

  const isSupplements = row.category === 'supplement' || /^supplements?$/i.test(String(row.group_name || '').trim());
  const isConsume = !isSupplements && (row.category === 'consume' || ['meal', 'snack', 'drink', 'beverage'].includes(row.subtype));
  if (isConsume && !isChild) {
    const ck = consumeKind(title);
    if (ck === 'drink') {
      const name = title.replace(/^(drink|sip|have)\s+(a |some |your )?/i, '').replace(/^./, (c) => c.toUpperCase());
      setTitle(name, 'Drink named by the drink');
      if (row.subtype !== 'drink') out.subtype = 'drink';
    } else if (ck === 'meal') setTitle(mealTitle(title), 'Meal = dish name');
    else { const slotWord = slotFromTitle(title); if (slotWord) setTitle(SLOT_TITLE[slotWord], 'Meal slot named by the slot'); }
    // Slot: title wins, then an existing slot group, then the time.
    const named = slotFromTitle(title);
    const min = hhmm(row.scheduled_time);
    if (named && min != null && (min < SLOT_WINDOW[named].from || min > SLOT_WINDOW[named].to)) {
      out.scheduled_time = SLOT_WINDOW[named].default;
      warnings.push({ field: 'scheduled_time', message: `“${title}” is a ${named}: belongs in ${SLOT_TITLE[named]} (${SLOT_WINDOW[named].default.slice(0, 5)})` });
    }
    const current = String(row.group_name || '').trim();
    const slot = named || slotFromTitle(current) || (row.scheduled_time || out.scheduled_time ? mealSlotFor(out.scheduled_time || row.scheduled_time) : null);
    if (slot && GENERIC_SLOT_GROUP.test(current) && current !== SLOT_TITLE[slot]) out.group_name = SLOT_TITLE[slot];
    else if (slot && !GENERIC_SLOT_GROUP.test(current)) warnings.push({ field: 'group_name', message: `Custom group “${current}” — standard slot is ${SLOT_TITLE[slot]}` });
  }

  // Fitness / wellness: set info from the title when empty.
  if (!isConsume && !isSupplements && ['exercise', 'wellness', 'hygiene'].includes(row.subtype)) {
    const info = parseSetInfo(title);
    for (const f of ['sets', 'reps', 'rounds', 'work_seconds', 'rest_seconds'] as const) if (info[f] != null && row[f] == null) out[f] = info[f];
  }
  if (!row.scheduled_time && !out.scheduled_time && !isChild) warnings.push({ field: 'scheduled_time', message: 'No time: every step needs a time or an anchor' });
  return { item: out, warnings };
}
