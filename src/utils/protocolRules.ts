/*
 * Protocol item rules — the single checker every AI builder (and the fix pass) runs before saving.
 *
 *  1. Every item is checkable at a time: a clock time, or an anchor (wake, bedtime, before/after a
 *     meal) resolved to one. Nothing floats as "All day".
 *  2. Do/don't guidance is never a step: it is rule_do / rule_dont children of the item it governs,
 *     or a top-level dated rule (the app's "Rules & Avoidances" tray). A group-level checklist
 *     attaches to the group's first item (no group checklist in the app yet).
 *  3. Sleep is exactly two items, "End Sleep" (wake) and "Start Sleep" (bedtime) — the names the app
 *     and the editor's "Sleep & wake" control already use (see utils/sleepWindow.ts).
 *  4. Actions are imperative verb + noun, measurable when possible ("Walk 20 minutes"). Meals are the
 *     dish name, no verb ("Vegetable soup"); a linked meal takes the recipe name only when the
 *     Guardian's title was blank or generic.
 *  5. Vague practices are rewritten to something linkable ("Practice light exercise" → "Walk 20 minutes").
 *  6. A thing to take is a step, never a rule: a supplement or drink named as a bare item ("Chlorella",
 *     "Drink Water") that was filed as a rule becomes a step with a time.
 */

export type Anchor = 'wake' | 'bedtime' | 'before_meal' | 'after_meal';
export interface RuleIssue { code: 'no_time' | 'vague' | 'not_verb' | 'renamed' | 'moved_to_rules' | 'rule_to_step'; message: string }

export const END_SLEEP = 'End Sleep';
export const START_SLEEP = 'Start Sleep';
const WAKE_RE = /^(wake|end[\s-]?sleep|rise|get[\s-]?up|morning[\s-]?wake)\b/i;
export const PLAIN_BEDTIME = /^(start[\s-]?sleep|bed(time)?|go to (bed|sleep)|sleep|lights[\s-]?out|time for bed)$/i;
export const isWakeTitle = (t: string) => WAKE_RE.test(t.trim());

const MEAL_VERB = /^(eat|have|enjoy|drink|cook|prepare|make|sip|take)\s+(a |an |some |your )?/i;
const GENERIC_MEAL = /^(breakfast|lunch|dinner|supper|snack|meal|a? ?light meal|main meal|food|eat|drink)$/i;
/** "Eat plain rice" → "Plain rice"; "Drink plenty of water" → "Plenty of water" → "Water". */
export function mealTitle(title: string): string {
  let t = title.trim().replace(MEAL_VERB, '').replace(/^(plenty of|lots of|a glass of|a bowl of|a cup of)\s+/i, '');
  t = t.replace(/\s+(at|for|with) (breakfast|lunch|dinner)$/i, '');
  return t ? t[0].toUpperCase() + t.slice(1) : title;
}
export const isGenericTitle = (title: string, query?: string) => !title.trim() || GENERIC_MEAL.test(title.trim()) || (!!query && title.trim().toLowerCase() === query.toLowerCase());

const VERBS = new Set(('add apply attend avoid bathe begin book breathe bring brush buy call check choose clean cleanse close complete cook cool cut cycle dance do drink dry eat end exfoliate fast file fill finish floss follow foam get go hike hold hydrate join journal jump keep lift light limit list listen log massage meditate mix moisturise moisturize move open pack pause plan play practise practice prepare put read record reduce rest review rinse row run scrub set shave shop shower sip sit skip sleep soak spend squat start stay stop stretch study swim take talk tidy track try turn visit wake walk wash watch wear weigh wind work write yoga').split(' '));
export const isVerbFirst = (title: string) => VERBS.has(title.trim().split(/\s+/)[0]?.toLowerCase() || '');

/** Vague practice → concrete, linkable activity. */
const VAGUE: { re: RegExp; title: string; query: string; minutes: number }[] = [
  { re: /^(practi[cs]e |do |get )?(some |light |gentle |daily )?(exercise|activity|movement)$|^(be|stay) active$|^move (more|your body)$/i, title: 'Walk', query: 'walk', minutes: 20 },
  { re: /^(practi[cs]e |do )?(some |gentle )?(stretching|mobility)$/i, title: 'Stretch', query: 'stretch', minutes: 10 },
  { re: /^(relax|unwind|de-?stress|practi[cs]e (relaxation|mindfulness|self[- ]care))$/i, title: 'Breathe slowly', query: 'breath', minutes: 5 },
  { re: /^(get |go )?(outside|fresh air|some sun(light)?)$/i, title: 'Walk outdoors', query: 'walk', minutes: 15 },
];
export const AVOID_TITLE = /^(avoid|no|skip|don'?t|do not|cut out|cut|limit|reduce|abstain|refrain|follow the .*diet|practi[cs]e .*abstinence)\b/i;
export const isRuleTitle = (title: string) => AVOID_TITLE.test(title.trim());
/** Openings of a limit on eating or drinking ("Finish caffeine for the day", "Stop eating 3 hours before bed"), not of a thing to eat. */
const LIMIT_TITLE = /^(finish|stop|end|quit|cease|pause|delay|wait|last)\b/i;
/** A title in a meal list that limits what is eaten or drunk, so it is a rule for the meals and not a meal. */
export const isMealRuleTitle = (title: string) => AVOID_TITLE.test(title.trim()) || LIMIT_TITLE.test(title.trim());

/* ───────── a thing to take is a step, never a rule ───────── */
/** A rule is a constraint ("Avoid X", "Keep binders 2 h from food"); a named supplement or plain drink to take is a step. */
export const TAKE_VERB = /^(drink|take|have|eat|sip)\s+(a |an |some |your |the )?/i;
/** Words that make a title a constraint or a piece of guidance rather than a thing to take. */
export const CONSTRAINT_WORD = /\b(if|when|whenever|while|before|after|during|with|without|within|from|at|on|every|each|per|than|more|less|fewer|only|instead|no|not|never|always|avoid|limit|keep|stay|stop|pause|check|follow|for|until|unless|labels?|rules?|daily|weekly|twice|times|dose|doses|dosage|slowly|plenty)\b/i;
/** Negations inside a parenthesis ("Gentle Start (no greens yet)"); other parenthetical detail is just a description. */
export const NEGATION_WORD = /\b(no|not|never|avoid|without|stop|pause|limit|only|instead)\b/i;
/** Openings of advice, not of a thing to take. */
export const GUIDANCE_START = /^(quit|eliminate|steer|ditch|minimi[sz]e|prefer|choose|consult|seek|be|store|shake|hydrate|stay|start|try|aim|make sure|ensure|remember|consider|ask|tell|talk|speak|see|read|plan|prepare|wait|rest|reduce|use)\b/i;
/** Headings and advice words that sit in a supplements list without being a product. */
export const NOT_A_PRODUCT = /\b(supplements?|medications?|medicines?|drugs?|blood thinners?|binders?|safety|doctors?|clinicians?|physicians?|interactions?|timing|spacing|advice|warnings?|notes?|tips?|brands?|quality)\b/i;
/** Evidence that a supplement title is a product being dosed: an amount, or a pinch. */
export const DOSE = /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|iu|ml|l|caps?|capsules?|tablets?|tabs?|softgels?|drops?|scoops?|tsp|tbsp)\b|\bpinch\b/i;
/** Plain liquids only: "Water", "Lemon water", "Green tea". Not "Choose water over juice", "Extra water", "Herbal tea or water". */
export const PLAIN_DRINK = /^(?:(?:warm|hot|cold|iced|lemon|sparkling|mineral|coconut|herbal|green|black|white|mint|ginger|chamomile|rooibos|matcha|dandelion|vegetable|celery|bone) )?(?:water|tea|coffee|juice|broth|milk|kefir|kombucha)$/i;

const stripParens = (t: string) => t.replace(/\(.*?\)/g, '').trim();
/**
 * "Chlorella", "N-Acetyl Cysteine", "Drink Water", "Pinch of Whole Salt (Celtic / Himalayan)": the bare name of something to
 * take, with no constraint wording. Filed as a rule it shows as "Do: Chlorella" under that day's rules with no time and
 * nothing to tick off.
 */
export function isBareItemTitle(title: string): boolean {
  const raw = title.trim().replace(/[’‘]/g, "'");
  if (!raw || /^(drink|take|have|eat|sip|add)$/i.test(raw) || AVOID_TITLE.test(raw) || GUIDANCE_START.test(raw)) return false;
  const name = raw.replace(TAKE_VERB, '');
  const words = stripParens(name);
  const inParens = (name.match(/\(.*?\)/g) || []).join(' ');
  return words.length > 0 && words.split(/\s+/).length <= 5 && !CONSTRAINT_WORD.test(words) && !NEGATION_WORD.test(inParens) && !/[.:;!?]/.test(words) && !/\d+\s*[x×]/i.test(words);
}
/** What a bare item of a supplements or consume group is. A supplement needs a sign it is a product: "Take …", an amount, or a product link. */
export function takeGroupOf(title: string, group?: string | null, evidence: { notes?: string | null; linked?: boolean } = {}): 'supplement' | 'drink' | null {
  if (!isBareItemTitle(title)) return null;
  const raw = title.trim().replace(/[’‘]/g, "'");
  const words = stripParens(raw.replace(TAKE_VERB, ''));
  if (group === 'supplements' || group === 'supplement') {
    if (NOT_A_PRODUCT.test(words)) return null;
    return TAKE_VERB.test(raw) || DOSE.test(`${raw} ${evidence.notes || ''}`) || evidence.linked ? 'supplement' : null;
  }
  return (group === 'consume' || group === 'meal') && PLAIN_DRINK.test(words) ? 'drink' : null;
}
/** Where a step with no time goes: a drink in the morning; a supplement by the meal or bedtime its text names, else the morning. */
export function itemDefaultTime(text: string, drink: boolean): string {
  if (drink) return '08:00';
  const t = text.replace(/\b(?:not|never|avoid|no)\b[^.;]{0,25}\b(?:bed|bedtime|night|evening|dinner|supper|lunch|noon|midday)\b/gi, ' ');
  if (/\b(bed|bedtime|before sleep|at night)\b/i.test(t)) return '21:30';
  if (/\b(dinner|supper|evening)\b/i.test(t)) return '18:30';
  if (/\b(lunch|midday|noon|with (food|meals?))\b/i.test(t)) return '12:30';
  return '08:00';
}

const hm = (min: number) => `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((min % 60) + 60) % 60).padStart(2, '0')}`;
const mins = (t: string | null | undefined) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const DEFAULT_TIME: Record<string, string> = { meal: '12:30', consume: '12:30', supplements: '08:00', supplement: '08:00', fitness: '07:30', hygiene: '07:15', beauty: '07:30', wellness: '09:00', do: '09:00', work: '09:30', home: '18:00', tasks: '18:00' };

/** The fields the checker reads/writes; both the Guardian draft steps and the event planner map onto it. */
export interface RuleStep {
  title: string;
  group: string;                 // smart group or category ('sleep', 'meal'/'consume', 'wellness', …)
  time: string | null;
  anchor?: Anchor | null;
  offsetMinutes?: number | null;
  durationMinutes?: number | null;
  notes: string;
  dos: string[];
  donts: string[];
  link?: { kind: 'food' | 'activity'; query: string } | null;
  /** 'rule' = becomes top-level dated rule rows (no time, no done state). */
  kind?: 'action' | 'rule';
  /** Meals and drinks: their consume slot (Breakfast / Lunch / Dinner / Snack), saved as group_name. */
  mealSlot?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
  /** For rules: which list it governs — Drinks, Consume (food), or general. */
  ruleGroup?: RuleGroup;
  /** Window key: steps only interact (anchors, group checklists) inside the same window. */
  windowKey?: string;
  /** Smart-list parent (has action sub-steps): titled as a group ("Workout 1", "Morning hygiene"); its children are the actions. */
  isParent?: boolean;
  issues?: RuleIssue[];
}
export type RuleGroup = 'drinks' | 'consume' | 'supplements' | 'general';
const DRINK_SUBJECT = /\b(caffeine|coffee|espresso|tea|matcha|alcohol|wine|beer|spirits|soda|fizzy|soft drinks?|juice|energy drinks?|drinks?|water)\b/i;
const FOOD_SUBJECT = /\b(food|foods|sugar|salt|sodium|meat|pork|dairy|gluten|wheat|soy|cheese|fried|processed|snacks?|carbs?|bread|diet|meals?|eat|eating|tyramine|spicy|pickled|canned|vinegar|chocolate)\b/i;
/** Which smart list a category rule belongs to. Drink subjects (caffeine, alcohol, tea…) → Drinks; food → Consume. */
/** Rules about taking a product (a binder, capsules, the label's dose) belong with the supplements. */
const SUPPLEMENT_SUBJECT = /\b(supplements?|binders?|capsules?|tablets?|pills?|softgels?|doses?|dosage|charcoal|supplies)\b/i;
/** "Follow every label" is about a product; "Check food labels for added sugar" is about food, so it goes to its food group. */
const PRODUCT_LABEL = /\blabels?\b/i;
export function ruleGroupFor(text: string, group?: string): RuleGroup {
  if (group === 'supplements' || SUPPLEMENT_SUBJECT.test(text) || (PRODUCT_LABEL.test(text) && !FOOD_SUBJECT.test(text) && !DRINK_SUBJECT.test(text))) return 'supplements';
  const drink = DRINK_SUBJECT.test(text), food = FOOD_SUBJECT.test(text);
  if (drink && !food) return 'drinks';
  if (food) return 'consume';
  return group === 'meal' || group === 'consume' ? 'consume' : 'general';
}
/** Storage for a group-level rule: top-level rule row, scope + subtype name the list it governs. */
export function ruleRowFields(group: RuleGroup): { scope: string; subtype: string | null; category: string } {
  if (group === 'drinks') return { scope: 'consume', subtype: 'drink', category: 'consume' };
  if (group === 'consume') return { scope: 'consume', subtype: 'meal', category: 'consume' };
  if (group === 'supplements') return { scope: 'supplement', subtype: 'supplement', category: 'supplement' };
  return { scope: 'outside', subtype: null, category: 'do' };
}
const isMeal = (s: RuleStep) => s.group === 'meal' || s.group === 'consume';

/**
 * Apply rules 1–5 in place-safe fashion and return the fixed list. Never drops guidance: a rule-style
 * step either moves onto the first item of its group (as children) or becomes kind 'rule'.
 */
export function enforceProtocolRules<T extends RuleStep>(steps: T[]): T[] {
  let out: T[] = steps.map((s) => ({ ...s, dos: [...(s.dos || [])], donts: [...(s.donts || [])], issues: [...(s.issues || [])] }));
  const note = (s: T, code: RuleIssue['code'], message: string) => { s.issues!.push({ code, message }); };

  // 3. Sleep: one End Sleep, one Start Sleep per window; other sleep advice folds into Start Sleep.
  const windows = Array.from(new Set(out.map((s) => s.windowKey || '')));
  for (const w of windows) {
    const sleep = out.filter((s) => s.group === 'sleep' && (s.windowKey || '') === w);
    if (!sleep.length) continue;
    const wake = sleep.find((s) => isWakeTitle(s.title)) || null;
    const rest = sleep.filter((s) => s !== wake);
    const bed = rest.sort((a, b) => (mins(b.time) ?? -1) - (mins(a.time) ?? -1))[0] || null;
    for (const s of rest) if (s !== bed) { bed!.dos.push(s.title); if (s.notes) bed!.notes = [bed!.notes, s.notes].filter(Boolean).join(' '); }
    out = out.filter((s) => !(rest.includes(s) && s !== bed));
    if (wake && wake.title !== END_SLEEP) { note(wake, 'renamed', `Renamed from “${wake.title}”`); wake.title = END_SLEEP; }
    if (bed && bed.title !== START_SLEEP) {
      // "Sleep in complete darkness" as the only bedtime item: keep its advice as a do on Start Sleep.
      if (!PLAIN_BEDTIME.test(bed.title.trim())) bed.dos.unshift(bed.title);
      note(bed, 'renamed', `Renamed from “${bed.title}”`); bed.title = START_SLEEP;
    }
  }

  // 6. A supplement or drink named as a bare item and filed as a rule is a step ("Do: Chlorella" has no time and nothing to tick off).
  // A rule that lists Don'ts is a constraint list, never converted; its Do's become the step's checklist.
  for (const s of out) {
    if (s.kind !== 'rule' || s.group === 'sleep' || s.isParent || s.donts.length) continue;
    const what = takeGroupOf(s.title, s.group, { notes: s.notes });
    if (!what) continue;
    s.kind = 'action'; s.ruleGroup = undefined;
    if (!s.time && !s.anchor) s.time = itemDefaultTime(`${s.title} ${s.notes}`, what === 'drink');
    note(s, 'rule_to_step', `“${s.title}” is something to take, so it is a step with a time, not a rule`);
  }

  for (const s of out) {
    if (s.group === 'sleep' || s.kind === 'rule' || s.isParent) continue;
    // 4. Meals: dish name, no verb.
    if (isMeal(s) && !isRuleTitle(s.title) && !/^stop\b/i.test(s.title)) {
      const t = mealTitle(s.title);
      if (t !== s.title) s.title = t;
      // The slot named in the title wins ("Kitchari lunch bowl" → Lunch, moved into the lunch window).
      const named = /\b(breakfast|brunch|lunch|dinner|supper|snack)\b/i.exec(s.title)?.[1].toLowerCase();
      const slot = named ? ({ brunch: 'Breakfast', supper: 'Dinner' } as Record<string, string>)[named] || named[0].toUpperCase() + named.slice(1) : null;
      const m = mins(s.time);
      const window: Record<string, [number, number, string]> = { Breakfast: [300, 659, '08:00'], Lunch: [660, 959, '12:30'], Dinner: [990, 1319, '18:30'], Snack: [0, 1440, '15:30'] };
      if (slot && m != null && (m < window[slot][0] || m > window[slot][1])) { note(s, 'no_time', `Moved into the ${slot.toLowerCase()} window`); s.time = window[slot][2]; }
      s.mealSlot = (slot || (m == null ? null : m < 660 ? 'Breakfast' : m < 960 ? 'Lunch' : 'Dinner')) as RuleStep['mealSlot'];
      continue;
    }
    // 5. Vague practice → concrete linked activity.
    const v = VAGUE.find((x) => x.re.test(s.title.trim()));
    if (v) {
      const m = s.durationMinutes || v.minutes;
      note(s, 'vague', `Was “${s.title}”`);
      s.title = `${v.title} ${m} minutes`; s.durationMinutes = m; s.link = s.link || { kind: 'activity', query: v.query };
      continue;
    }
    // 4. Actions: verb first, with the amount when we know it.
    if (!isVerbFirst(s.title)) note(s, 'not_verb', 'Title should start with a verb');
    else if (s.durationMinutes && !/\d/.test(s.title) && s.link?.kind === 'activity' && !isRuleTitle(s.title)) s.title = `${s.title} ${s.durationMinutes} minutes`;
  }

  // 2. Rule-style steps ("Avoid tyramine foods", "Skip caffeine", "Follow the clean diet", "Practise abstinence").
  for (const s of [...out]) {
    if (s.kind === 'rule' || s.group === 'sleep' || !isRuleTitle(s.title)) continue;
    const list = { dos: s.dos, donts: s.donts.length || s.dos.length ? s.donts : [s.title.replace(/^(avoid|no|skip|don'?t|do not)\s+/i, '').replace(/^./, (c) => c.toUpperCase())] };
    // Guidance about a category of food or drink ("Limit caffeine", "No added sugar", "Avoid alcohol") is a
    // group-level rule on the Drinks or Consume list for its window, never pinned to one item. Other guidance is
    // a dated top-level rule too. (The app lists top-level rules in "Rules & Avoidances", grouped by scope.)
    s.kind = 'rule'; s.dos = list.dos; s.donts = list.donts; s.time = null;
    s.ruleGroup = ruleGroupFor(`${s.title} ${[...list.dos, ...list.donts].join(' ')}`, s.group);
  }

  // 1. Every action gets a time: anchor → clock time, else a group default (flagged).
  const anchorTime = (s: T): string | null => {
    const same = out.filter((x) => (x.windowKey || '') === (s.windowKey || ''));
    const off = s.offsetMinutes || 0;
    if (s.anchor === 'wake') { const w = same.find((x) => x.title === END_SLEEP); return hm((mins(w?.time) ?? 420) + off); }
    if (s.anchor === 'bedtime') { const b = same.find((x) => x.title === START_SLEEP); return hm((mins(b?.time) ?? 1320) - Math.abs(off)); }
    if (s.anchor === 'before_meal' || s.anchor === 'after_meal') {
      const meals = same.filter((x) => isMeal(x) && x !== s && x.kind !== 'rule' && mins(x.time) != null).map((x) => mins(x.time)!).sort((a, b) => a - b);
      const meal = meals[0] ?? 750;
      return hm(s.anchor === 'before_meal' ? meal - Math.abs(off || 15) : meal + Math.abs(off || 30));
    }
    return null;
  };
  for (const s of out) {
    if (s.kind === 'rule') continue;
    if (!s.time && s.anchor) s.time = anchorTime(s);
    if (!s.time) {
      s.time = s.group === 'sleep' ? (isWakeTitle(s.title) || s.title === END_SLEEP ? '07:00' : '22:00') : DEFAULT_TIME[s.group] || '09:00';
      note(s, 'no_time', `No time given — placed at ${s.time}`);
    }
  }
  for (const s of out) if (isMeal(s) && s.kind !== 'rule' && !s.mealSlot && s.time) { const m = mins(s.time)!; s.mealSlot = m < 660 ? 'Breakfast' : m < 960 ? 'Lunch' : 'Dinner'; }
  for (const s of out) { s.dos = Array.from(new Set(s.dos)); s.donts = Array.from(new Set(s.donts)); }
  return out;
}
