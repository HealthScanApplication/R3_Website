/*
 * Routine layout standard (approved 2026-10-15). Pure functions over protocol_items rows, shared by the
 * cleanup (fix pass) and the builders (AI, paste-text planner, Diet / Fitness planners).
 *
 * Day → End Sleep → Morning / Afternoon / Evening → smart list → set (numbered 1, 2, 3…) → item → Start Sleep.
 * Day / week / phase rules sit on top.
 *
 * CLEANUP only moves what is there: old title → "Was" (filter.original_title), numbers in titles/notes → set
 * fields, rule-like rows → rules. Anything missing is FLAGGED, never invented (no meals, no safety rules).
 * NEW (builders) may fill defaults: hygiene sets, sleep anchors.
 *
 * Storage (no migration): sets/reps/rounds/work_seconds/rest_seconds/duration_minutes already exist;
 * a peg to wake/bedtime lives in `filter.anchor = { to: 'wake'|'bedtime', offset_minutes }` and is resolved to
 * scheduled_time here (mobile reads scheduled_time today; live re-pegging on mobile is a follow-up).
 */
import { END_SLEEP, START_SLEEP, PLAIN_BEDTIME, isWakeTitle, mealTitle, ruleGroupFor, ruleRowFields, takeGroupOf, itemDefaultTime } from './protocolRules';

export type Mode = 'cleanup' | 'new';
export type SmartList = 'hygiene' | 'drinks' | 'wellness' | 'fitness' | 'supplements' | 'meal' | 'work' | 'home' | 'tasks' | 'sleep';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Row {
  id: string; protocol_id?: string; display_name: string | null; kind?: string | null; category?: string | null; subtype?: string | null;
  item_type?: string | null; scope?: string | null; group_name?: string | null; scheduled_time?: string | null; duration_minutes?: number | null; notes?: string | null;
  parent_protocol_item_id?: string | null; hidden?: boolean | null; sort_order?: number | null; day_number?: number | null;
  recurrence_start_date?: string | null; recurrence_end_date?: string | null;
  sets?: number | null; reps?: number | null; rounds?: number | null; work_seconds?: number | null; rest_seconds?: number | null;
  catalog_recipe_id?: string | null; catalog_ingredient_id?: string | null; catalog_activity_id?: string | null; supplement_id?: string | null; catalog_product_id?: string | null;
  translations?: Record<string, { display_name?: string }> | null;
  filter?: Record<string, any> | null;
}
export interface Change { item_id: string; action: 'update' | 'hide' | 'insert' | 'flag'; field?: string; from?: unknown; to?: unknown; reason: string; insert?: Partial<Row> & { parent_ref?: string } }

/* ───────── text helpers ───────── */
const hhmm = (t?: string | null) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const fmt = (min: number) => { const m = ((min % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`; };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Personal planner entries (flights, bookings, events) are not routine steps: never touched. */
const CALENDAR = /\b(flight|airbnb|hotel|hostel|booked|booking|reservation|ferry|hydrofoil|check-?in|check-?out|taxi|cab|airport|luggage|pickup|pick up|tour|museum|festival|summit|launch|meeting|call between|appointment|consultation|dietician|ultrasound|physio|hair ?dresser|@ )\b|[€·•]|\b\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}\b|^\[|luminaries —/i;
export const isCalendarEntry = (title: string) => CALENDAR.test(title);

/* ───────── consume: slot vs dish vs drink ───────── */
const SLOT_ONLY = /^(eat |have |enjoy )?(a |your )?(breakfast|brunch|lunch|dinner|supper|snack|meal|main meal|light meal)$/i;
const DRINK = /^(water|warm water|lemon water|sparkling water|coconut water|(green|black|white|herbal|mint|ginger|chamomile|rooibos|matcha|dandelion( root)?) tea|tea|coffee|black coffee|espresso|decaf( coffee)?|americano|latte|kombucha|kefir|milk|(almond|oat|soy) milk|juice|.* juice|electrolytes?( drink)?|bone broth|broth|cacao|hot chocolate|.*\bwater)$/i;
/** Smoothies and shakes are meals (they replace food); plain liquids are drinks. */
export function consumeKind(title: string): 'slot' | 'drink' | 'meal' {
  const t = title.trim().replace(/^(drink|sip|have)\s+(a |some |your )?/i, '');
  if (SLOT_ONLY.test(title.trim())) return 'slot';
  if (DRINK.test(t)) return 'drink';
  return 'meal';
}
export function mealSlotFor(time?: string | null): MealSlot {
  const m = hhmm(time) ?? 720;
  return m < 11 * 60 ? 'breakfast' : m < 16 * 60 ? 'lunch' : 'dinner';
}

/** Slot windows: the slot sets the time. Default times are used when a meal sits outside its slot. */
export const SLOT_WINDOW: Record<MealSlot, { from: number; to: number; default: string }> = {
  breakfast: { from: 5 * 60, to: 10 * 60 + 59, default: '08:00:00' },
  lunch: { from: 11 * 60, to: 15 * 60 + 59, default: '12:30:00' },
  dinner: { from: 16 * 60 + 30, to: 21 * 60 + 59, default: '18:30:00' },
  snack: { from: 0, to: 24 * 60, default: '15:30:00' },
};
export const SLOT_TITLE: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
/** A slot named in the title ("Kitchari Lunch Bowl", "Post-workout snack") wins over the clock. */
export function slotFromTitle(title: string): MealSlot | null {
  const m = /\b(breakfast|brunch|lunch|dinner|supper|snack)\b/i.exec(title);
  if (!m) return null;
  const w = m[1].toLowerCase();
  return w === 'brunch' ? 'breakfast' : w === 'supper' ? 'dinner' : (w as MealSlot);
}
export function slotFromGroupName(groupName?: string | null): MealSlot | null {
  return groupName ? slotFromTitle(groupName) : null;
}
// Group labels that only say "when" or "food" (the day part comes from the time anyway) — replaced by the slot.
// Anything else ("Recovery", "Cleanse", "PAGG Supplement Stack") is the Guardian's own section: kept and flagged.
const GENERIC_WORDS = new Set('consume consumption food foods meal meals nutrition drink drinks beverage beverages eat eating hydration nourishment fuel feed morning midday afternoon evening night daily all day schedule rhythm essentials hourly and'.split(' '));
const GENERIC_GROUP = { test: (name: string) => name.toLowerCase().replace(/[&()\-–—,/]/g, ' ').split(/\s+/).filter(Boolean).every((w) => GENERIC_WORDS.has(w)) };
const inSlot = (slot: MealSlot, min: number | null) => min != null && min >= SLOT_WINDOW[slot].from && min <= SLOT_WINDOW[slot].to;
/** "Oats with green tea" → { meal: "Oats", drink: "Green tea" }. */
export function splitMealDrink(title: string): { meal: string; drink: string | null } {
  const m = /^(.+?)\s+(?:with|and|\+|&)\s+(.+)$/i.exec(title.trim());
  if (m && consumeKind(m[2]) === 'drink' && consumeKind(m[1]) !== 'drink') return { meal: m[1].trim(), drink: m[2].trim().replace(/^./, (c) => c.toUpperCase()) };
  return { meal: title.trim(), drink: null };
}

/* ───────── set info from titles / notes ───────── */
export interface SetInfo { sets?: number; reps?: number; rounds?: number; work_seconds?: number; work_seconds_max?: number; rest_seconds?: number; duration_minutes?: number }
export function parseSetInfo(text: string, fromTitle = true): SetInfo {
  const s = text.replace(/×/g, 'x').replace(/–|—/g, '-');
  const out: SetInfo = {};
  let m;
  if ((m = /(\d+)\s*(?:sec|s)\s*on\s*\/\s*(\d+)\s*(?:sec|s)?\s*off(?:\s*x\s*(\d+))?/i.exec(s))) { out.work_seconds = +m[1]; out.rest_seconds = +m[2]; if (m[3]) out.rounds = +m[3]; }
  // "3x60 sec" / "3x3 min rounds" / "5 x 5-minute rounds" = sets × time; "3x10" = sets × reps.
  // In a title the pattern must be followed by a word ("3x10 squats"), so "Norwegian 4x4" stays a name.
  if (!out.work_seconds && (m = /\b(\d+)\s*(?:sets?\s*)?x\s*(?:\d+\s*-\s*)?(\d+)(?:\s*-?\s*(sec|secs|seconds|s|min|mins|minutes?|minute)\b)?(\s+\S)?/i.exec(s)) && (!fromTitle || m[3] || m[4])) {
    out.sets = +m[1];
    const after = s.slice((m.index ?? 0) + m[0].length - (m[4]?.length ?? 0)).trim();
    if (m[3]) out.work_seconds = /^m/i.test(m[3]) ? +m[2] * 60 : +m[2];
    else if (/^(m|meters?|metres?|yd|yards?|km|kg|lbs?)\b/i.test(after)) { /* distance or load, not reps */ }
    else out.reps = +m[2];
  }
  if ((m = /\b(\d+)\s*-\s*(\d+)\s*(?:seconds|secs|sec|s)\b/i.exec(s))) { out.work_seconds = +m[1]; out.work_seconds_max = +m[2]; }
  else if (!out.work_seconds && (m = /\b(\d+)\s*(?:seconds|secs|sec|s)\b/i.exec(s))) out.work_seconds = +m[1];
  if ((m = /\b(\d+)\s*rounds?\b/i.exec(s)) && !out.rounds) out.rounds = +m[1];
  if ((m = /\bround\s*(\d+)\s*(?:\/|of)\s*(\d+)/i.exec(s))) out.rounds = +m[2];
  if ((m = /\b(\d+)\s*(?:min|minutes|mins)\b/i.exec(s))) out.duration_minutes = +m[1];
  // "30 Power Breaths" → reps 30; only in titles (notes start with things like "639 Hz").
  if (fromTitle && !out.reps && (m = /^(\d+)\s+(?!x\b|min|sec|s\b|rounds?\b|hz\b|kg\b|g\b|mg\b|ml\b|l\b|iu\b|%)([a-z])/i.exec(text.trim()))) out.reps = +m[1];
  return out;
}

/* ───────── smart list for a row ───────── */
export function smartListOf(r: Row): SmartList {
  if (r.category === 'sleep') return 'sleep';
  const sub = (r.subtype || '').toLowerCase();
  if (sub === 'drink' || sub === 'beverage') return 'drinks';
  if (r.category === 'consume' || sub === 'meal' || sub === 'snack') return consumeKind(r.display_name || '') === 'drink' ? 'drinks' : 'meal';
  if (r.category === 'supplement' || sub === 'supplement') return 'supplements';
  const map: Record<string, SmartList> = { hygiene: 'hygiene', beauty: 'hygiene', exercise: 'fitness', wellness: 'wellness', reflection: 'wellness', work: 'work', home: 'home', finance: 'home', tasks: 'tasks', planning: 'tasks' };
  return map[sub] || 'wellness';
}

/* ───────── titles that are really rules ───────── */
const RULE_TITLE = /^(avoid|no|don'?t|do not|never|limit|skip|cut out|abstain|refrain)\b|\brule\b|\b(=|commit fully)\b|elimination rules|^lights (fully )?off$|^sleep \d+\s*-\s*\d+\s*h(ou)?rs?$|^wind[- ]?down$/i;
export const isRuleLikeTitle = (t: string) => RULE_TITLE.test(t.trim());

/* ───────── rules that are really items ───────── */
const groupOfRow = (r: Row) => r.category === 'supplement' || r.item_type === 'supplement' || r.scope === 'supplement' ? 'supplements' : r.category === 'consume' || r.scope === 'consume' ? 'consume' : null;
const takeOfRow = (r: Row) => takeGroupOf((r.display_name || '').trim(), groupOfRow(r), { notes: r.notes, linked: Boolean(r.catalog_product_id || r.supplement_id) });
/**
 * A top-level "Do:" rule that only names a supplement (with a dose, a pinch or a product link) or a plain drink, and has a
 * day or a time: "Do: Chlorella", "Do: Drink Water". It was meant to be a step and lost its time. Standing rules with no
 * day and no time stay rules (Guardians use them as a kit list: "Activated charcoal — food poisoning / gas"), and children
 * are checklists.
 */
export function ruleRowIsItem(r: Row): boolean {
  const title = (r.display_name || '').trim();
  if (r.kind !== 'rule_do' || r.parent_protocol_item_id || r.hidden || !title || isCalendarEntry(title) || isRuleLikeTitle(title)) return false;
  if (r.day_number == null && !r.scheduled_time) return false;
  // A day-only rule must carry its own content (a note or a product link): builders write allowed alternatives ("Herbal tea") as bare day-1 rules.
  if (!r.scheduled_time && !(r.notes || '').trim() && !r.catalog_product_id && !r.supplement_id) return false;
  return takeOfRow(r) != null;
}
/**
 * The same with a clock time on the rule. A rule with a time is a step beyond doubt, so the write gate converts it. A rule
 * with only a day is ambiguous (builders write every rule row with day 1, including a rule's allowed "Do" alternatives like
 * "Herbal tea"), so those are flagged by the standard and fixed in data, never converted by the gate.
 */
export const timedRuleRowIsItem = (r: Row) => ruleRowIsItem(r) && Boolean(r.scheduled_time);
/** The fields that turn such a rule into a step. Group name, notes, links and day are kept. */
export function itemRuleFields(r: Row): Partial<Row> {
  const drink = takeOfRow(r) === 'drink';
  const time = r.scheduled_time || `${itemDefaultTime(`${r.display_name || ''} ${r.notes || ''}`, drink)}:00`;
  return drink
    ? { kind: 'action', scope: null, item_type: 'consume', category: 'consume', subtype: 'drink', scheduled_time: time }
    : { kind: 'action', scope: null, item_type: 'supplement', category: 'supplement', subtype: 'supplement', scheduled_time: time };
}

/* ───────── Polish names for standard titles (others are flagged for translation) ───────── */
export const PL: Record<string, string> = {
  [END_SLEEP]: 'Koniec snu', [START_SLEEP]: 'Początek snu', 'Morning hygiene': 'Poranna higiena', 'Evening hygiene': 'Wieczorna higiena',
  Water: 'Woda', 'Green tea': 'Zielona herbata', 'Black coffee': 'Czarna kawa', Breakfast: 'Śniadanie', Lunch: 'Obiad', Dinner: 'Kolacja',
  'Wind down': 'Wyciszenie', 'Lights off': 'Zgaś światła',
};

/* ───────── hygiene pegs ───────── */
export const DEFAULT_MORNING_HYGIENE = ['Scrape tongue', 'Brush teeth', 'Floss teeth', 'Wash face'];
export const DEFAULT_EVENING_HYGIENE = ['Remove makeup', 'Floss teeth', 'Brush teeth', 'Moisturise'];
/** Recompute scheduled_time for every row pegged to wake / bedtime (filter.anchor). */
export function repegTimes(rows: Row[]): Row[] {
  const wake = rows.find((r) => r.category === 'sleep' && isWakeTitle(r.display_name || ''));
  const bed = rows.find((r) => r.category === 'sleep' && !isWakeTitle(r.display_name || ''));
  return rows.map((r) => {
    const a = r.filter?.anchor as { to: 'wake' | 'bedtime'; offset_minutes: number } | undefined;
    if (!a) return r;
    const base = hhmm(a.to === 'wake' ? wake?.scheduled_time : bed?.scheduled_time);
    if (base == null) return r;
    return { ...r, scheduled_time: fmt(base + (a.to === 'wake' ? Math.abs(a.offset_minutes) : -Math.abs(a.offset_minutes))) };
  });
}

/* ───────── the standard as a change list ───────── */
/** Protocol categories that own the daily basics; any other routine (fitness, diet…) never gets them added or asked for. */
export const HYGIENE_THEMES = ['hygiene', 'oral care', 'personal care', 'beauty', 'skin & face', 'skin', 'hair'];
export const SLEEP_THEMES = ['sleep', 'wellness'];
/** `theme` = the Protocol's category. Without one (unknown), the basics are handled as before. */
export function standardiseProtocol(rows: Row[], mode: Mode = 'cleanup', theme?: string | null): Change[] {
  const t = theme?.trim().toLowerCase();
  const wantsSleep = !t || SLEEP_THEMES.includes(t), wantsHygiene = !t || HYGIENE_THEMES.includes(t);
  const changes: Change[] = [];
  const live = rows.filter((r) => !r.hidden);
  const tops = live.filter((r) => !r.parent_protocol_item_id && (r.kind === 'action' || !r.kind));
  const kids = (id: string) => live.filter((r) => r.parent_protocol_item_id === id);
  const rename = (r: Row, to: string, reason: string) => {
    if ((r.display_name || '') === to) return;
    changes.push({ item_id: r.id, action: 'update', field: 'display_name', from: r.display_name, to, reason });
    changes.push({ item_id: r.id, action: 'update', field: 'filter.original_title', from: null, to: r.display_name, reason: 'Keep the old title as "Was"' });
    const pl = PL[to];
    if (r.translations?.pl?.display_name || pl) {
      if (pl) changes.push({ item_id: r.id, action: 'update', field: 'translations.pl.display_name', from: r.translations?.pl?.display_name ?? null, to: pl, reason: 'Keep Polish in sync' });
      else changes.push({ item_id: r.id, action: 'flag', field: 'translations.pl.display_name', from: r.translations?.pl?.display_name, reason: `Polish title is stale after rename to “${to}”` });
    }
  };
  const minsOf = (r: Row) => hhmm(r.scheduled_time);

  // Sleep anchors.
  const sleep = tops.filter((r) => r.category === 'sleep');
  const wake = sleep.find((r) => isWakeTitle(r.display_name || '')) || null;
  const extraWakes = sleep.filter((r) => r !== wake && isWakeTitle(r.display_name || ''));
  const beds = sleep.filter((r) => r !== wake && !extraWakes.includes(r));
  // Bedtime after midnight (00:00–04:59) sorts as late night, not early morning.
  const night = (r: Row) => { const m = minsOf(r) ?? -1; return m >= 0 && m < 300 ? m + 1440 : m; };
  const plainBed = beds.filter((r) => !isRuleLikeTitle(r.display_name || '')).sort((a, b) => night(b) - night(a));
  const bed = plainBed[0] || null;
  if (wake) rename(wake, END_SLEEP, 'Wake anchor');
  else if (wantsSleep) changes.push(mode === 'new'
    ? { item_id: 'new:wake', action: 'insert', reason: 'Every day starts with End Sleep', insert: { display_name: END_SLEEP, category: 'sleep', subtype: 'sleep', kind: 'action', scheduled_time: '07:00:00' } }
    : { item_id: '-', action: 'flag', reason: 'No wake item (End Sleep) — add one' });
  for (const x of extraWakes) changes.push({ item_id: x.id, action: 'flag', reason: `Second wake item (“${x.display_name}”) — keep one End Sleep` });
  if (bed) {
    rename(bed, START_SLEEP, 'Bedtime anchor');
    // "Sleep by 10pm, cool dark room" → keep the advice as a do on Start Sleep.
    if (!PLAIN_BEDTIME.test((bed.display_name || '').trim())) changes.push({ item_id: `rule:${bed.id}`, action: 'insert', reason: 'Bedtime advice kept as a do on Start Sleep', insert: { parent_ref: bed.id, display_name: bed.display_name, kind: 'rule_do' } });
  }
  else if (wantsSleep && (!wake || beds.length === 0)) changes.push(mode === 'new'
    ? { item_id: 'new:bed', action: 'insert', reason: 'Every day ends with Start Sleep', insert: { display_name: START_SLEEP, category: 'sleep', subtype: 'sleep', kind: 'action', scheduled_time: '22:00:00' } }
    : { item_id: '-', action: 'flag', reason: 'No bedtime item (Start Sleep) — add one' });
  for (const extra of beds.filter((r) => r !== bed)) {
    changes.push({ item_id: extra.id, action: 'hide', reason: 'Second sleep item: becomes a rule on Start Sleep' });
    changes.push({ item_id: `rule:${extra.id}`, action: 'insert', reason: 'Sleep guidance as a do on Start Sleep', insert: { parent_ref: bed?.id || 'new:bed', display_name: extra.display_name, kind: 'rule_do', notes: extra.notes || '' } });
  }

  // Rule-like top-level actions.
  const workout = tops.find((r) => smartListOf(r) === 'fitness' && kids(r.id).some((k) => k.kind === 'action' || !k.kind)) || tops.find((r) => smartListOf(r) === 'fitness');
  for (const r of tops) {
    const t = r.display_name || '';
    if (r.category === 'sleep' || !isRuleLikeTitle(t) || isCalendarEntry(t)) continue;
    const host = /lights|sleep|wind/i.test(t) ? (bed?.id || 'new:bed') : /rule|commit|mindset|override/i.test(t) && workout ? workout.id : null;
    changes.push({ item_id: r.id, action: 'hide', reason: host ? 'Rule, not a step' : 'Rule, not a step: becomes a top-level rule' });
    // Category guidance (caffeine, sugar, alcohol…) is a group rule on Drinks / Consume, not on one item.
    const group = ruleGroupFor(t, smartListOf(r) === 'drinks' ? 'meal' : smartListOf(r) === 'meal' ? 'meal' : smartListOf(r));
    const groupFields = !host && group !== 'general' ? ruleRowFields(group) : null;
    changes.push({ item_id: `rule:${r.id}`, action: 'insert', reason: host ? 'Attached to the item it governs' : groupFields ? `Group rule on ${group === 'drinks' ? 'Drinks' : group === 'consume' ? 'Consume' : 'Supplements'} for the day` : 'Top-level rule for the day', insert: { parent_ref: host || undefined, display_name: t, kind: /^(avoid|no|don'?t|do not|never|skip)\b/i.test(t) ? 'rule_dont' : 'rule_do', notes: r.notes || '', ...(groupFields ? { scope: groupFields.scope, subtype: groupFields.subtype, category: groupFields.category } : {}) } });
  }

  // A supplement or drink filed as a rule ("Do: Chlorella"): with a clock time it is a step (update); with only a day it is flagged,
  // because builders also write allowed alternatives as day-1 rules.
  for (const r of live) {
    if (!ruleRowIsItem(r)) continue;
    const why = `“${r.display_name}” is something to take: a step, not a rule`;
    if (!r.scheduled_time) { changes.push({ item_id: r.id, action: 'flag', field: 'kind', from: r.kind, reason: `${why} (a day rule with no time: check it, then retype it as a step with a time)` }); continue; }
    for (const [field, to] of Object.entries(itemRuleFields(r))) {
      const from = (r as any)[field] ?? null;
      if (from !== to) changes.push({ item_id: r.id, action: 'update', field, from, to, reason: why });
    }
  }

  // Meals live in their consume slot (Breakfast / Lunch / Dinner / Snack), meal and drinks as separate items.
  // The slot is group_name (mobile reads it via domainMealSlotName). The slot sets the time window.
  const isConsumeRow = (r: Row) => r.category === 'consume' || ['meal', 'snack', 'drink', 'beverage'].includes(r.subtype || '');
  for (const r of tops) {
    const t = r.display_name || '';
    if (isCalendarEntry(t) || isRuleLikeTitle(t) || r.category === 'sleep') continue;
    const linkedFood = Boolean(r.catalog_recipe_id || r.catalog_ingredient_id);
    // A meal filed under Wellness / Fitness / … (linked to a recipe, or named for a slot) moves to Consume.
    const supplementOrActivity = r.category === 'supplement' || r.item_type === 'supplement' || r.item_type === 'product' || Boolean(r.supplement_id || r.catalog_product_id || r.catalog_activity_id);
    if (!isConsumeRow(r) && !supplementOrActivity && (linkedFood || (slotFromTitle(t) && !/\b(walk|workout|run|meditat|stretch|after|movement|exercise)\b/i.test(t)))) {
      changes.push({ item_id: r.id, action: 'update', field: 'category', from: r.category, to: 'consume', reason: 'Meal filed outside Consume' });
      changes.push({ item_id: r.id, action: 'update', field: 'subtype', from: r.subtype, to: consumeKind(t) === 'drink' ? 'drink' : 'meal', reason: 'Meal filed outside Consume' });
    }
  }
  // Supplements is its own smart list (Morning → Supplements): anything filed there stays there.
  const inSupplements = (r: Row) => /^supplements?$/i.test((r.group_name || '').trim()) || r.category === 'supplement';
  const consumeRows = tops.filter((r) => !inSupplements(r) && (isConsumeRow(r) || r.catalog_recipe_id || r.catalog_ingredient_id) && r.category !== 'sleep' && !isCalendarEntry(r.display_name || '') && !isRuleLikeTitle(r.display_name || ''));
  // Every meal of a day at one time = the times were never set: spread them by slot order.
  const byDay = new Map<string, Row[]>();
  for (const r of consumeRows) if (consumeKind(r.display_name || '') !== 'drink') byDay.set(`${r.day_number ?? ''}|${r.recurrence_start_date ?? ''}`, [...(byDay.get(`${r.day_number ?? ''}|${r.recurrence_start_date ?? ''}`) || []), r]);
  const spread = new Set<string>();
  for (const meals of byDay.values()) {
    if (meals.length < 3 || new Set(meals.map((m) => m.scheduled_time || '')).size > 1) continue;
    const order = [...meals].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const slots: MealSlot[] = order.length === 3 ? ['breakfast', 'lunch', 'dinner'] : ['breakfast', 'lunch', 'snack', 'dinner', 'snack', 'snack'];
    order.forEach((m, i) => {
      const slot = slotFromTitle(m.display_name || '') || slots[Math.min(i, slots.length - 1)];
      spread.add(m.id);
      changes.push({ item_id: m.id, action: 'update', field: 'scheduled_time', from: m.scheduled_time, to: SLOT_WINDOW[slot].default, reason: `All meals shared ${String(m.scheduled_time || 'no time').slice(0, 5)} — spread by slot` });
      if (slotFromGroupName(m.group_name) !== slot && (!m.group_name || GENERIC_GROUP.test(m.group_name.trim()) || slotFromGroupName(m.group_name))) changes.push({ item_id: m.id, action: 'update', field: 'group_name', from: m.group_name, to: SLOT_TITLE[slot], reason: `${SLOT_TITLE[slot]} slot` });
    });
  }
  for (const r of consumeRows) {
    if (spread.has(r.id)) continue;
    const t = r.display_name || '';
    const min = hhmm(r.scheduled_time);
    const named = slotFromTitle(t);
    const slot: MealSlot = named || slotFromGroupName(r.group_name) || mealSlotFor(r.scheduled_time);
    // "Kitchari Lunch Bowl" at 08:00: the title's slot wins; move it into the lunch window.
    if (named && min != null && !inSlot(named, min)) changes.push({ item_id: r.id, action: 'update', field: 'scheduled_time', from: r.scheduled_time, to: SLOT_WINDOW[named].default, reason: `“${t}” is a ${named} but was at ${String(r.scheduled_time).slice(0, 5)}` });
    if (slotFromGroupName(r.group_name) !== slot) {
      // Generic labels ("Consume", "Supplement", "Meals") are replaced by the slot; a Guardian's own section name is kept and flagged.
      if (!r.group_name || GENERIC_GROUP.test(r.group_name.trim()) || slotFromGroupName(r.group_name)) changes.push({ item_id: r.id, action: 'update', field: 'group_name', from: r.group_name, to: SLOT_TITLE[slot], reason: r.group_name ? `Slot mismatch: ${r.group_name} → ${SLOT_TITLE[slot]}` : `${SLOT_TITLE[slot]} slot` });
      else changes.push({ item_id: r.id, action: 'flag', field: 'group_name', from: r.group_name, reason: `Custom group “${r.group_name}” — proposed slot ${SLOT_TITLE[slot]}` });
    }
  }

  // Meals and drinks.
  for (const r of tops) {
    const t = r.display_name || '';
    if (r.category !== 'consume' && !['meal', 'snack', 'drink', 'beverage'].includes(r.subtype || '')) continue;
    if (isCalendarEntry(t) || isRuleLikeTitle(t)) continue;
    const kind = consumeKind(t);
    const linked = Boolean(r.catalog_recipe_id || r.catalog_ingredient_id);
    if (kind === 'slot') {
      const slot = t.replace(SLOT_ONLY, '$3');
      const name = slot[0].toUpperCase() + slot.slice(1).toLowerCase();
      if (name !== t) rename(r, name, 'Meal slot named by the slot');
      if (!linked) changes.push({ item_id: r.id, action: 'flag', reason: `Empty ${name.toLowerCase()} slot — link a recipe (never invented)` });
      continue;
    }
    if (kind === 'drink') {
      const name = t.replace(/^(drink|sip|have)\s+(a |some |your )?/i, '').replace(/^./, (c) => c.toUpperCase());
      if (name !== t) rename(r, name, 'Drink named by the drink');
      if (r.subtype !== 'drink') changes.push({ item_id: r.id, action: 'update', field: 'subtype', from: r.subtype, to: 'drink', reason: 'Drinks list, beside the meal' });
      continue;
    }
    const { meal, drink } = splitMealDrink(t);
    const dish = mealTitle(meal);
    if (dish !== t) rename(r, dish, drink ? 'Meal title without the drink' : 'Meal = dish name');
    if (drink) changes.push({ item_id: `drink:${r.id}`, action: 'insert', reason: 'Drink split out of the meal title', insert: { display_name: drink, category: 'consume', subtype: 'drink', kind: 'action', scheduled_time: r.scheduled_time, group_name: SLOT_TITLE[slotFromTitle(t) || slotFromGroupName(r.group_name) || mealSlotFor(r.scheduled_time)] } });
  }

  // Sets: repeated titles in a row → numbered rounds; untimed duplicates of timed items → hide.
  const byList = new Map<string, Row[]>();
  // Rounds only form inside one day (same day_number / date window) and only for fitness or wellness practice;
  // the same meal on seven days is seven days, not seven rounds.
  const setKey = (r: Row) => `${smartListOf(r)}|${norm(r.display_name || '')}|${r.day_number ?? ''}|${r.recurrence_start_date ?? ''}|${r.recurrence_end_date ?? ''}`;
  for (const r of tops) if (['fitness', 'wellness'].includes(smartListOf(r)) && consumeKind(r.display_name || '') !== 'drink' && !isCalendarEntry(r.display_name || '')) byList.set(setKey(r), [...(byList.get(setKey(r)) || []), r]);
  for (const group of byList.values()) {
    if (group.length < 2) continue;
    const timed = group.filter((r) => r.scheduled_time).sort((a, b) => (minsOf(a)! - minsOf(b)!));
    for (const u of group.filter((r) => !r.scheduled_time)) if (timed.length) changes.push({ item_id: u.id, action: 'hide', reason: 'Untimed duplicate of a timed item' });
    if (timed.length > 1) {
      const info = parseSetInfo(timed[0].display_name || '');
      const base = (timed[0].display_name || '').replace(/^\d+\s+/, '');
      const short = base[0].toUpperCase() + base.slice(1).toLowerCase();
      timed.forEach((r, i) => {
        rename(r, `${short}, round ${i + 1}/${timed.length}`, 'Repeated item becomes numbered rounds of one set');
        if (info.reps && r.reps == null) changes.push({ item_id: r.id, action: 'update', field: 'reps', from: null, to: info.reps, reason: 'Count parsed from the title' });
      });
    }
  }

  // Set info parsed from titles / notes (fitness + wellness only), missing values flagged.
  for (const r of tops) {
    const list = smartListOf(r);
    if (list !== 'fitness' && list !== 'wellness') continue;
    if (isCalendarEntry(r.display_name || '') || isRuleLikeTitle(r.display_name || '')) continue;
    // Notes count only when they are a short spec ("37–60 seconds to start"), not coaching prose.
    const notesSpec = (r.notes || '').trim().length <= 40 ? parseSetInfo(r.notes || '', false) : {};
    const info = { ...notesSpec, ...parseSetInfo(r.display_name || '') };
    for (const f of ['sets', 'reps', 'rounds', 'work_seconds', 'rest_seconds'] as const) {
      if (info[f] != null && (r as any)[f] == null && !changes.some((c) => c.item_id === r.id && c.field === f)) changes.push({ item_id: r.id, action: 'update', field: f, from: null, to: info[f], reason: `${f} parsed from ${parseSetInfo(r.display_name || '')[f] != null ? 'title' : 'notes'}${f === 'work_seconds' && info.work_seconds_max ? ` (range up to ${info.work_seconds_max}s)` : ''}` });
    }
    if (r.duration_minutes == null && info.duration_minutes == null && info.reps == null && info.work_seconds == null) changes.push({ item_id: r.id, action: 'flag', reason: 'No duration or set info' });
  }

  // Hygiene sets pegged to wake / bedtime.
  const hygiene = tops.filter((r) => smartListOf(r) === 'hygiene');
  const wakeMin = hhmm(wake?.scheduled_time), bedMin = hhmm(bed?.scheduled_time);
  const morningSet = hygiene.find((r) => /morning hygiene/i.test(r.display_name || '')) || (wakeMin != null ? hygiene.find((r) => (minsOf(r) ?? 9999) < (wakeMin + 120)) : null);
  const eveningSet = hygiene.find((r) => /evening hygiene/i.test(r.display_name || '')) || (bedMin != null ? hygiene.find((r) => r !== morningSet && (minsOf(r) ?? -1) > bedMin - 180) : null);
  for (const [set, to, base, label] of [[morningSet, 'wake', wakeMin, 'Morning hygiene'], [eveningSet, 'bedtime', bedMin, 'Evening hygiene']] as const) {
    if (set) {
      const m = minsOf(set);
      if (base != null && m != null && !set.filter?.anchor) changes.push({ item_id: set.id, action: 'update', field: 'filter.anchor', from: null, to: { to, offset_minutes: Math.abs(m - base) }, reason: `Pegged to ${to} so it moves with it` });
    } else if (!wantsHygiene) {
      continue; // not this routine's job: the website suggests hygiene beside it instead
    } else if (mode === 'new') {
      const steps = label === 'Morning hygiene' ? DEFAULT_MORNING_HYGIENE : DEFAULT_EVENING_HYGIENE;
      changes.push({ item_id: `new:${to}-hygiene`, action: 'insert', reason: `${label} set pegged to ${to}`, insert: { display_name: label, category: 'do', subtype: 'hygiene', kind: 'action', filter: { anchor: { to, offset_minutes: to === 'wake' ? 10 : 30 } } } });
      steps.forEach((s, i) => changes.push({ item_id: `new:${to}-hygiene:${i}`, action: 'insert', reason: 'Default step (to confirm)', insert: { parent_ref: `new:${to}-hygiene`, display_name: s, kind: 'action', sort_order: i + 1 } }));
    } else changes.push({ item_id: '-', action: 'flag', reason: `No ${label.toLowerCase()} set — proposal: ${(label === 'Morning hygiene' ? DEFAULT_MORNING_HYGIENE : DEFAULT_EVENING_HYGIENE).join(', ')}` });
  }
  return changes;
}

/* ───────── rule contradictions between Protocols (detection only; resolution per proposal §4) ───────── */
const SUBJECTS: Record<string, RegExp> = {
  caffeine: /\b(caffeine|coffee|espresso|pre-?workout|black tea|green tea|matcha|energy drink)\b/i,
  salt: /\b(salt|sodium|electrolytes?)\b/i, sugar: /\bsugar\b/i, alcohol: /\b(alcohol|wine|beer)\b/i,
  food: /\b(food|eat|eating|meal|fast(ing)?|breakfast|lunch|dinner|snack)\b/i, screens: /\b(screens?|phone|tv)\b/i,
};
export const subjectsOf = (text: string) => Object.keys(SUBJECTS).filter((k) => SUBJECTS[k].test(text) && !(k === 'caffeine' && /\bdecaf\b/i.test(text)));
export interface RuleRef { protocol_id: string; title: string; polarity: 'do' | 'dont' }
export function findContradictions(rules: RuleRef[], items: { protocol_id: string; title: string }[] = []): { subject: string; a: string; b: string }[] {
  const out: { subject: string; a: string; b: string }[] = [];
  for (const d of rules.filter((r) => r.polarity === 'dont')) for (const s of subjectsOf(d.title)) {
    for (const x of rules) if (x.polarity === 'do' && x.protocol_id !== d.protocol_id && subjectsOf(x.title).includes(s)) out.push({ subject: s, a: d.title, b: x.title });
    for (const it of items) if (it.protocol_id !== d.protocol_id && subjectsOf(it.title).includes(s)) out.push({ subject: s, a: d.title, b: it.title });
  }
  return out;
}
