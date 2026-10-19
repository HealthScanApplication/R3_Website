/*
 * Protocol variety: turn one repeated day into a cycle of day-specific steps (Day / Week / 2 weeks / Month).
 * Pure functions over protocol_items rows plus the recipe / activity catalogue — no network, no database.
 *
 *   - Meals linked to a catalogue recipe rotate between recipes of the same meal slot whose diet flags are a
 *     superset of the original's (a vegan dish only swaps for vegan dishes).
 *   - Exercises linked to a catalogue activity rotate between relatives: same parent activity, else the same
 *     subcategory and muscle group (muscleGroupOf, as in the Fitness planner).
 *   - Fitness weeks get a rest day (day 7) and a lighter day (day 4, 60 % volume); week 2+ progresses
 *     (+1 set, or +15 % minutes).
 *   - Everything else (supplements, hygiene, drinks, sleep anchors, rules) stays daily. Rules (children) are
 *     copied with their parent, so a rule always stays attached to the step it governs.
 *
 * Storage: the app shows an item with day_number on that day of the cycle only (protocols.total_days),
 * items without day_number every day. The original row becomes day 1; copies are inserted for days 2…N.
 */
import { muscleGroupOf } from './protocolBuilders';
import { consumeKind, mealSlotFor, type Row } from './routineStandard';

export const LENGTH_OPTIONS = [
  { days: 1, label: 'Day' },
  { days: 7, label: 'Week' },
  { days: 14, label: '2 weeks' },
  { days: 28, label: 'Month' },
] as const;
export const DEFAULT_LENGTH = 14;
/** The Length option a total_days value maps to (null / unknown → 2 weeks). */
export function lengthLabel(totalDays?: number | null): string {
  return LENGTH_OPTIONS.find((o) => o.days === totalDays)?.label || (totalDays && totalDays > 1 ? `${totalDays} days` : '2 weeks');
}

export interface Recipe { id: string; name_common: string; meal_slot: string | null; dietary_info?: Record<string, unknown> | null; health_score?: number | null }
export interface Activity { id: string; name: string; category: string | null; subcategory?: string | null; body_parts?: string[] | null; parent_activity_id?: string | null; parent_id?: string | null }
export type VRow = Row & { recurrence_type?: string | null };

export interface Insert { id: string; source_id: string; set: Partial<VRow> & { parent_protocol_item_id?: string | null } }
export interface Plan { total_days: number; updates: { id: string; set: Partial<VRow> }[]; inserts: Insert[]; notes: string[] }

const isRule = (r: Row) => !!r.kind?.startsWith('rule');
const slotKey = (s?: string | null) => (s || '').toLowerCase().trim();
const slotFromTitleOrTime = (r: Row) => { const t = (r.display_name || '').toLowerCase(); return /breakfast|brunch/.test(t) ? 'breakfast' : /lunch/.test(t) ? 'lunch' : /dinner|supper/.test(t) ? 'dinner' : /snack/.test(t) ? 'snack' : mealSlotFor(r.scheduled_time); };
const flagsOf = (r?: Recipe) => Object.entries(r?.dietary_info || {}).filter(([, v]) => v === true).map(([k]) => k);

/** Recipes that can stand in for `orig`: same slot, all its diet flags, best health score first. */
export function mealAlternatives(orig: Recipe | undefined, slot: string, recipes: Recipe[], dietFlags: string[] = []): Recipe[] {
  const need = [...new Set([...flagsOf(orig), ...dietFlags])];
  const pool = recipes.filter((r) => r.id !== orig?.id && slotKey(r.meal_slot) === slot && need.every((f) => r.dietary_info?.[f] === true));
  return pool.sort((a, b) => (b.health_score ?? 0) - (a.health_score ?? 0) || a.name_common.localeCompare(b.name_common));
}

/** Activities that can stand in for `orig`: siblings under the same parent, else same subcategory + muscle group. */
export function activityAlternatives(orig: Activity, activities: Activity[]): Activity[] {
  const parent = orig.parent_activity_id || orig.parent_id;
  const group = muscleGroupOf({ bodyParts: orig.body_parts || [], category: orig.category, name: orig.name });
  const sib = parent ? activities.filter((a) => a.id !== orig.id && (a.parent_activity_id || a.parent_id) === parent) : [];
  const pool = sib.length ? sib : activities.filter((a) => a.id !== orig.id && !!orig.subcategory && a.subcategory === orig.subcategory
    && muscleGroupOf({ bodyParts: a.body_parts || [], category: a.category, name: a.name }) === group);
  return pool.sort((a, b) => a.name.localeCompare(b.name));
}

/** Activity categories that are training (rotate, rest, progress); beauty, hygiene, wellness, mindfulness stay daily. */
export const TRAINING = /^(strength|stretch|sports|cardio|gym|calisthenics|fitness|hiit|water sports|martial arts|yoga|dance)$/i;
export const isTraining = (a?: Activity) => !!a && TRAINING.test((a.category || '').trim());
/** A fitness protocol: its theme says so, or it carries at least two linked training activities. */
export const isFitnessProtocol = (rows: Row[], theme?: string | null, activityById?: Map<string, Activity>) =>
  /fitness|workout|training|strength|exercise/i.test(theme || '') || rows.filter((r) => !isRule(r) && r.catalog_activity_id && (!activityById || isTraining(activityById.get(r.catalog_activity_id)))).length >= 2;

export interface Options { totalDays?: number; theme?: string | null; uuid?: () => string; dietFlags?: string[] }

const DIET_WORDS: [RegExp, string][] = [[/\bvegan|plant-based\b/i, 'vegan'], [/\bvegetarian\b/i, 'vegetarian'], [/\bpescatarian\b/i, 'pescatarian'], [/\bketo(genic)?\b/i, 'keto'],
  [/\blow[- ]carb\b/i, 'low_carb'], [/\bgluten[- ]free|coeliac|celiac\b/i, 'gluten_free'], [/\bdairy[- ]free\b/i, 'dairy_free'], [/\blow[- ]fodmap\b/i, 'low_fodmap']];
/** catalog_recipes.dietary_info flags a protocol's own name/tags/description commit it to. */
export const dietFlagsOf = (p: { name: string; description?: string | null; tags?: string[] | null }) => {
  const text = `${p.name} ${(p.tags || []).join(' ')} ${p.description || ''}`;
  return DIET_WORDS.filter(([re]) => re.test(text)).map(([, f]) => f);
};

/**
 * Expand a protocol's daily items into a `totalDays` cycle. Items that already carry a day_number or a weekly
 * recurrence are left alone (someone scheduled them on purpose). Returns the row changes, never mutates.
 */
export function planVariety(rows: VRow[], recipes: Recipe[], activities: Activity[], opts: Options = {}): Plan {
  const total = opts.totalDays ?? DEFAULT_LENGTH;
  const uuid = opts.uuid || (() => crypto.randomUUID());
  const plan: Plan = { total_days: total, updates: [], inserts: [], notes: [] };
  if (total <= 1) return plan;
  const live = rows.filter((r) => !r.hidden);
  const isDrinkName = (n: string) => consumeKind(n) === 'drink';
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const children = new Map<string, VRow[]>();
  for (const r of live) if (r.parent_protocol_item_id) children.set(r.parent_protocol_item_id, [...(children.get(r.parent_protocol_item_id) || []), r]);
  const fitness = isFitnessProtocol(live, opts.theme, activityById);
  const daily = (r: VRow) => r.day_number == null && (!r.recurrence_type || r.recurrence_type === 'daily');

  /** Copy `r` (and its rule children) onto `day` with overrides. */
  const copy = (r: VRow, day: number, set: Partial<VRow>, parentId?: string | null) => {
    const id = uuid();
    plan.inserts.push({ id, source_id: r.id, set: { day_number: day, ...set, ...(parentId !== undefined ? { parent_protocol_item_id: parentId } : {}) } });
    for (const c of (children.get(r.id) || []).filter(isRule)) plan.inserts.push({ id: uuid(), source_id: c.id, set: { day_number: day, parent_protocol_item_id: id } });
  };
  const pin = (r: VRow) => {
    plan.updates.push({ id: r.id, set: { day_number: 1 } });
    for (const c of (children.get(r.id) || []).filter(isRule)) plan.updates.push({ id: c.id, set: { day_number: 1 } });
  };

  // Names already on each day: every original step, then each pick. A swap never lands on a step the day
  // already has, so two exercises can't both become the same alternative.
  const key = (t?: string | null) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const originals = new Set(live.filter((r) => !isRule(r)).map((r) => key(r.display_name)));
  const used = new Map<number, Set<string>>();
  const usedOn = (d: number) => used.get(d) || used.set(d, new Set(originals)).get(d)!;
  /** First candidate from `start` (wrapping) not yet on day `d`, or null to keep the original. */
  const choose = <T extends { name: string }>(d: number, list: T[], start: number): T | null => {
    for (let k = 0; k < list.length; k++) { const c = list[(start + k) % list.length]; if (!usedOn(d).has(key(c.name))) { usedOn(d).add(key(c.name)); return c; } }
    return null;
  };
  let idx = 0;

  for (const r of live) {
    if (isRule(r) || !daily(r)) continue;
    idx++;
    // A meal linked to a recipe rotates.
    // A generic slot ("Breakfast", "Lunch") with no recipe gets real catalogue recipes that fit the protocol's diet.
    const generic = !r.catalog_recipe_id && r.category === 'consume' && consumeKind(r.display_name || '') === 'slot';
    if ((r.catalog_recipe_id && consumeKind(r.display_name || '') !== 'drink') || generic) {
      const orig = r.catalog_recipe_id ? recipeById.get(r.catalog_recipe_id) : undefined;
      const slot = slotKey(orig?.meal_slot) || slotFromTitleOrTime(r);
      const alts = mealAlternatives(orig, slot, recipes, opts.dietFlags).filter((a) => !isDrinkName(a.name_common));
      if (!alts.length) { plan.notes.push(`${r.display_name}: no other ${slot} recipe fits ${[...flagsOf(orig), ...(opts.dietFlags || [])].join(', ') || 'this diet'} — stays daily`); continue; }
      const pool = alts.slice(0, 12).map((a) => ({ ...a, name: a.name_common }));
      pin(r);
      const first = orig ? null : choose(1, pool, idx);
      if (!orig) { if (!first) { plan.updates.pop(); continue; } plan.updates[plan.updates.findIndex((u) => u.id === r.id)].set = { day_number: 1, catalog_recipe_id: first.id, display_name: first.name }; }
      for (let d = 2; d <= total; d++) {
        // A 7-dish week: the same dish comes back a week later, never two days running.
        const pick = (d - 1) % 7 === 0 && orig ? null : choose(d, pool, idx + d);
        if (!pick && !orig) { copy(r, d, { catalog_recipe_id: first!.id, display_name: first!.name }); continue; }
        copy(r, d, pick ? { catalog_recipe_id: pick.id, display_name: pick.name } : {});
      }
      continue;
    }
    // An exercise linked to an activity rotates; fitness weeks rest and progress.
    if (r.catalog_activity_id && fitness && isTraining(activityById.get(r.catalog_activity_id))) {
      const orig = activityById.get(r.catalog_activity_id);
      const alts = orig ? activityAlternatives(orig, activities.filter(isTraining)).slice(0, 8) : [];
      pin(r);
      for (let d = 2; d <= total; d++) {
        const dow = ((d - 1) % 7) + 1;
        if (dow === 7) continue; // rest day
        const week = Math.floor((d - 1) / 7);
        // Every third training day is the original; others swap for a relative not already on that day.
        const pick = (d - 1) % 3 === 0 ? null : choose(d, alts, idx + d);
        const light = dow === 4;
        const set: Partial<VRow> = pick ? { catalog_activity_id: pick.id, display_name: pick.name } : {};
        if (r.sets) set.sets = Math.max(1, (light ? Math.round(r.sets * 0.6) : r.sets) + week);
        else if (r.duration_minutes) set.duration_minutes = Math.max(5, Math.round(r.duration_minutes * (light ? 0.6 : 1) * (1 + 0.15 * week)));
        copy(r, d, set);
      }
      if (!alts.length) plan.notes.push(`${r.display_name}: no catalogue alternative — same exercise, with rest/lighter days and progression`);
      continue;
    }
  }
  return plan;
}

/* ───────── rule fit (flag only) ───────── */
const SLEEP_RULE = /\b(sleep|bed|bedtime|screens?|blue light|caffeine after|lights? out|melatonin)\b/i;
const PLANT_RULE = /\bplants? on (the )?plate\b|\b\d+\s*% plants?\b/i;
const BARE = /^(meal|drink|consume|food|eat|snack)$/i;

export interface RuleFlag { item: string; rule: string; reason: string }
/** Rules that don't fit the protocol or the step they hang under. */
export function ruleFitFlags(rows: Row[], protocol: { name: string; description?: string | null; tags?: string[] | null }): RuleFlag[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const kids = /\b(toddler|kids?|child|children|infant|baby|preschool)\b/i.test(`${protocol.name} ${(protocol.tags || []).join(' ')}`);
  const out: RuleFlag[] = [];
  for (const r of rows.filter((x) => isRule(x) && !x.hidden)) {
    const t = (r.display_name || '').trim();
    const parent = r.parent_protocol_item_id ? byId.get(r.parent_protocol_item_id) : undefined;
    const item = parent?.display_name || '(top level)';
    if (BARE.test(t)) out.push({ item, rule: t, reason: 'Bare rule name — says nothing to follow' });
    if (kids && PLANT_RULE.test(t)) out.push({ item, rule: t, reason: 'Adult plant-ratio rule on a child/toddler protocol' });
    if (parent && SLEEP_RULE.test(t) && parent.category !== 'sleep' && !/sleep|bed|wind/i.test(parent.display_name || '')) out.push({ item, rule: t, reason: 'Sleep rule hanging under a non-sleep step' });
  }
  for (const r of rows.filter((x) => !isRule(x) && !x.hidden && BARE.test((x.display_name || '').trim()))) out.push({ item: r.display_name || '', rule: '—', reason: 'Bare step name' });
  return out;
}
