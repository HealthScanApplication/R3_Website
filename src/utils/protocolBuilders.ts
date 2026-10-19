/*
 * Guardian Diet + Fitness builders.
 *
 * Both builders write ordinary `protocols` / `protocol_items` rows so the app, the editor and the
 * PDF read them like any other Protocol. Meals are recipe items, sessions are activity items with
 * their exercises as child items (sets/reps/rest), and each item repeats weekly on its weekday
 * (recurrence_days_of_week, 0 = Sun). Only the builder's own settings (framework, targets, goal,
 * the weekly plan) are kept on the protocol in builder_config / builder_kind.
 *
 * Nutrition is never estimated: catalog recipes use their stored nutrition_per_serving and guide
 * recipes the per-serving values the recipe builder calculated from catalog ingredients.
 */
import { projectId, publicAnonKey } from './supabase/info';
import {
  createProtocol, createProtocolItem, deleteProtocolItem, listProtocolItems, updateProtocol,
  type AdminProtocol, type AdminProtocolItem,
} from './protocolAdmin';
import type { GuideRecipe } from './guidePortal';
import type { PralTotal, TrustedPral } from './pral';
import type { HazardPer100, RecipeHazard } from './recipeNutrients';
import { cloneProtocolChild, ensureGuideRecipeCatalog, syncProtocolChild } from './protocolCopies';
import { isBedName, isWakeName } from './sleepWindow';
import { MEAL_SLOT_DEFAULT_TIMES, mealSlotName } from '../protocolDomain/mealSlot';
import { END_SLEEP, START_SLEEP, enforceProtocolRules, isRuleTitle, ruleGroupFor, ruleRowFields, type RuleIssue, type RuleStep } from './protocolRules';

const rest = () => `https://${projectId}.supabase.co/rest/v1`;
const headers = (accessToken: string, extra: Record<string, string> = {}) => ({
  apikey: publicAnonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...extra,
});

export type BuilderKind = 'diet' | 'fitness' | 'personal';

/* ── shared week ── */
export const WEEK = [
  { day: 1, short: 'Mon', dow: 1 }, { day: 2, short: 'Tue', dow: 2 }, { day: 3, short: 'Wed', dow: 3 },
  { day: 4, short: 'Thu', dow: 4 }, { day: 5, short: 'Fri', dow: 5 }, { day: 6, short: 'Sat', dow: 6 }, { day: 7, short: 'Sun', dow: 0 },
];

/* ── timing: every item is checked off at a clock time or relative to an anchor ── */
export type Anchor = 'clock' | 'wake' | 'bed';
export interface Timing { anchor: Anchor; time: string; offset: number } // offset minutes: + after wake, − before bed
export const DEFAULT_WAKE = '07:00';
export const DEFAULT_BED = '22:30';
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const toHHMM = (min: number) => { const v = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
/** The clock time the app shows; anchors resolve against the protocol's wake and bedtime. */
export function resolveTiming(t: Timing, wake = DEFAULT_WAKE, bed = DEFAULT_BED): string {
  if (t.anchor === 'wake') return toHHMM(toMin(wake) + Math.abs(t.offset));
  if (t.anchor === 'bed') return toHHMM(toMin(bed) - Math.abs(t.offset));
  return t.time;
}
export function describeTiming(t: Timing): string {
  if (t.anchor === 'wake') return `${Math.abs(t.offset)} min after waking`;
  if (t.anchor === 'bed') return `${Math.abs(t.offset)} min before bed`;
  return t.time;
}

/* ── diet ── */
export interface MealNutrition { energy_kcal: number; protein_g: number; carbohydrates_g: number; fats_g: number; fiber_g?: number; recorded?: string[]; nutrients?: Record<string, number> }
export interface MealPick { source: 'catalog' | 'guide'; id: string; name: string; image: string | null; nutrition: MealNutrition | null; category?: string | null; healthScore?: number | null; hazardFlags?: Array<{ label: string; level: string }>; servings?: number; micros?: Record<string, number>; hazards?: RecipeHazard[]; analysisComplete?: boolean; partialNutrients?: string[]; unknownHazards?: string[]; ingredients?: PlanIngredient[]; pral?: PralTotal }
/** Per-serving ingredient breakdown kept for the explorable nutrient/hazard readout. */
export interface PlanIngredient { name: string; grams: number | null; per100: Record<string, number>; hazards: HazardPer100[]; pral?: TrustedPral; pralRule?: boolean }
export const isDrinkPick = (pick: MealPick) => ['drink', 'beverage'].includes(pick.category?.trim().toLowerCase() || '');
export const selectedServings = (pick: MealPick) => typeof pick.servings === 'number' && Number.isFinite(pick.servings) && pick.servings > 0 ? pick.servings : 1;
export const mealPickKey = (pick: Pick<MealPick, 'source' | 'id'>) => `${pick.source}:${pick.id}`;
export function mealDrinks(cfg: DietConfig, key: string): Array<string | MealPick> {
  if (!cfg.plan[key] && cfg.drinkPlan?.[key] == null) return [];
  return cfg.drinkPlan?.[key] ?? cfg.drinks?.[key.split(':')[1]] ?? DEFAULT_DRINKS[key.split(':')[1]] ?? [];
}
export interface DietFramework { id: string; label: string; protein: number; carbs: number; fat: number; flag: string | null; note: string }

/** Macro splits are % of energy; `flag` is the catalog_recipes.dietary_info key a recipe must have set to true. */
export const DIET_FRAMEWORKS: DietFramework[] = [
  { id: 'balanced', label: 'Balanced', protein: 20, carbs: 50, fat: 30, flag: null, note: 'Whole-food plate, no exclusions.' },
  { id: 'mediterranean', label: 'Mediterranean', protein: 18, carbs: 47, fat: 35, flag: null, note: 'Olive oil, fish, legumes, vegetables, whole grains.' },
  { id: 'vegan', label: 'Vegan', protein: 18, carbs: 55, fat: 27, flag: 'vegan', note: 'Only recipes tagged vegan in the database.' },
  { id: 'vegetarian', label: 'Vegetarian', protein: 18, carbs: 52, fat: 30, flag: 'vegetarian', note: 'No meat or fish.' },
  { id: 'pescatarian', label: 'Pescatarian', protein: 22, carbs: 45, fat: 33, flag: 'pescatarian', note: 'Fish and seafood, no meat.' },
  { id: 'keto', label: 'Keto', protein: 20, carbs: 5, fat: 75, flag: 'keto', note: 'Carbohydrate ≤ 10% of energy per recipe.' },
  { id: 'low_carb', label: 'Low-carb', protein: 25, carbs: 20, fat: 55, flag: 'low_carb', note: 'Carbohydrate ≤ 26% of energy per recipe.' },
  { id: 'high_protein', label: 'High-protein', protein: 35, carbs: 40, fat: 25, flag: null, note: 'Recipes ranked by protein per kcal.' },
  { id: 'gluten_free', label: 'Gluten-free', protein: 20, carbs: 50, fat: 30, flag: 'gluten_free', note: 'Only recipes marked gluten-free.' },
  { id: 'dairy_free', label: 'Dairy-free', protein: 20, carbs: 50, fat: 30, flag: 'dairy_free', note: 'Only recipes marked dairy-free.' },
  { id: 'low_fodmap', label: 'Low-FODMAP', protein: 20, carbs: 48, fat: 32, flag: 'low_fodmap', note: 'Uses the low_fodmap flag; check each recipe until the catalog tags it everywhere.' },
];

// Slot times come from the shared mealSlot defaults (Breakfast < Lunch < Snack < Dinner), like the app.
export const MEAL_SLOTS = [
  { id: 'breakfast', label: 'Breakfast' as const, time: MEAL_SLOT_DEFAULT_TIMES.Breakfast, share: 0.25 },
  { id: 'lunch', label: 'Lunch' as const, time: MEAL_SLOT_DEFAULT_TIMES.Lunch, share: 0.35 },
  { id: 'snack', label: 'Snack' as const, time: MEAL_SLOT_DEFAULT_TIMES.Snack, share: 0.1 },
  { id: 'dinner', label: 'Dinner' as const, time: MEAL_SLOT_DEFAULT_TIMES.Dinner, share: 0.3 },
];
export const DEFAULT_DRINKS: Record<string, string[]> = { breakfast: ['Water'], lunch: ['Water'], dinner: ['Water'], snack: [] };

/** The slot a recipe's own name commits it to ("Kitchari Lunch Bowl" → lunch), or null when it fits any slot. */
export function nameSlotHint(name: string): 'breakfast' | 'lunch' | 'dinner' | 'snack' | null {
  if (/\bbreakfast\b/i.test(name)) return 'breakfast';
  if (/\blunch\b/i.test(name)) return 'lunch';
  if (/\b(dinner|supper)\b/i.test(name)) return 'dinner';
  if (/\bsnack\b/i.test(name)) return 'snack';
  return null;
}
export const fitsSlot = (name: string, slotId: string) => { const hint = nameSlotHint(name); return !hint || hint === slotId; };

/** A consume item's slot: its own group_name when it is a meal slot, else the slot its time falls in. */
export function slotForTime(time: string | null | undefined): 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' {
  const m = /^(\d{1,2}):(\d{2})/.exec(time || '');
  const min = m ? Number(m[1]) * 60 + Number(m[2]) : 12 * 60;
  if (min < 11 * 60) return 'Breakfast';
  if (min < 15 * 60) return 'Lunch';
  if (min < 17 * 60 + 30) return 'Snack';
  return 'Dinner';
}

export interface PlacementItem { display_name: string | null; category: string | null; item_type: string | null; subtype?: string | null; group_name: string | null; scheduled_time?: string | null; kind?: string | null; parent_protocol_item_id?: string | null }
export interface PlacementIssue { item: string; message: string; fix?: Partial<PlacementItem> }
const isConsume = (it: PlacementItem) => it.category === 'consume' || it.item_type === 'recipe' || it.item_type === 'consume';
/**
 * Meal placement rules: every consume step sits in its Breakfast/Lunch/Dinner/Snack slot (never Wellness
 * or another non-consume group), and a recipe named for one meal is not filed under another.
 */
export function mealPlacementIssues(items: PlacementItem[]): PlacementIssue[] {
  const out: PlacementIssue[] = [];
  for (const it of items) {
    if ((it.kind && it.kind !== 'action') || !isConsume(it)) continue;
    const name = it.display_name || 'Meal';
    const slot = mealSlotName(it.group_name);
    if (!slot) { const to = slotForTime(it.scheduled_time); out.push({ item: name, message: `${it.group_name ? `In “${it.group_name}”` : 'In no meal slot'}; belongs in ${to}`, fix: { group_name: to, category: 'consume' } }); continue; }
    const hint = nameSlotHint(name);
    if (hint && hint !== slot.toLowerCase() && !(hint === 'dinner' && slot === 'Dinner')) out.push({ item: name, message: `A ${hint} recipe filed under ${slot}` });
  }
  return out;
}

export interface SlotChild { title: string; role: 'meal' | 'drink'; recipeId: string | null; image: string | null; notes: string; servings?: number; guideRecipeId?: string }
export interface SlotPlan { key: string; day: number; slotId: string; label: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'; time: string; timingNote: string; children: SlotChild[]; dos: string[]; donts: string[] }

/**
 * The saved shape of a diet week: one slot item per day × slot (in its consume smart list), with the meal
 * (recipe-linked, titled by the dish) and its drinks as separate checkable children. Titles and times pass
 * through the shared item checker.
 */
export function planMealItems(cfg: DietConfig): SlotPlan[] {
  const slots = MEAL_SLOTS.filter((x) => cfg.slots.includes(x.id));
  const steps: CheckedStep[] = [];
  const plans: SlotPlan[] = [];
  for (const { day } of WEEK) for (const slot of slots) {
    const pick = cfg.plan[`${day}:${slot.id}`];
    const key = `${day}:${slot.id}`;
    const drinks = mealDrinks(cfg, key);
    if (!pick && !cfg.drinkPlan?.[key]?.length) continue;
    const t = mealTiming(cfg, slot.id);
    const rules = splitRules(cfg.mealRules?.[slot.id] || []);
    if (pick) steps.push({ key: `${key}:meal`, mealSlot: slot.label, title: pick.name, group: 'meal', time: resolveTiming(t), notes: '', dos: rules.dos, donts: rules.donts, windowKey: String(day), link: { kind: 'food', query: pick.name } });
    drinks.forEach((d, i) => steps.push({ key: `${key}:drink:${i}`, mealSlot: slot.label, title: typeof d === 'string' ? d : d.name, group: 'meal', time: resolveTiming(t), notes: '', dos: [], donts: [], windowKey: String(day) }));
    const child = (p: MealPick, role: 'meal' | 'drink'): SlotChild => ({ title: p.name, role, recipeId: p.source === 'catalog' ? p.id : null, guideRecipeId: p.source === 'guide' ? p.id : undefined, image: p.image, servings: selectedServings(p), notes: `${selectedServings(p)} serving(s)${p.source === 'guide' ? ' · Guardian recipe' : ''}` });
    plans.push({ key, day, slotId: slot.id, label: slot.label, time: resolveTiming(t), timingNote: t.anchor !== 'clock' ? describeTiming(t) : '', dos: [], donts: [], children: [
      ...(pick ? [child(pick, 'meal')] : []),
      ...drinks.map((d) => typeof d === 'string' ? { title: d, role: 'drink' as const, recipeId: null, image: null, notes: 'Legacy drink: match a recipe to include nutrition.' } : child(d, 'drink')),
    ] });
  }
  const checked = new Map(enforceProtocolRules(steps).map((x) => [x.key, x]));
  for (const plan of plans) {
    const meal = checked.get(`${plan.key}:meal`);
    if (meal) { plan.children[0].title = meal.title; plan.time = meal.time || plan.time; plan.dos = meal.dos; plan.donts = meal.donts; }
    plan.children.filter((c) => c.role === 'drink').forEach((c, i) => { const d = checked.get(`${plan.key}:drink:${i}`); if (d) c.title = d.title; });
  }
  return plans;
}

export interface DietConfig {
  location?: import('./plannerSunrise').PlannerLocation | null; // null = the user cleared it (no default re-applied)
  framework: string;
  kcal: number;
  protein: number; carbs: number; fat: number; // % of energy
  slots: string[];
  plan: Record<string, MealPick | null>; // key `${day}:${slot}`
  timing?: Record<string, Timing>;         // per meal slot; default = the slot's clock time
  drinks?: Record<string, string[]>;       // drink children per slot (default DEFAULT_DRINKS)
  drinkPlan?: Record<string, Array<MealPick | string>>; // per day:slot, with unmatched legacy text retained
  rules?: string[];                        // the week's Meal group checklist (framework do's)
  mealRules?: Record<string, string[]>;    // do-checklist under every meal of that slot
  supplements?: Partial<Record<SupplementPeriod, Array<string | SupplementPick>>>;
  supplementTimes?: Partial<Record<SupplementPeriod, string>>;
  supplementPlan?: Record<string, { items: Array<string | SupplementPick>; time: string }>; // day:period overrides; empty items intentionally clear one day
  fasting?: FastingPlan;
}

export type SupplementPeriod = 'morning' | 'afternoon' | 'evening';
export interface SupplementPick {
  id: string; name: string; source: 'supplement' | 'product'; image: string | null;
  barcode?: string | null; brand?: string | null;
  elementCount?: number;
}
export type FastingType = 'none' | 'intermittent' | 'water' | 'dry' | 'daniel';
export interface FastingPlan { type: FastingType; start: string; end: string; days: number[]; fullDay?: boolean }
export interface DietSupportItem {
  title: string; time: string; category: 'supplement' | 'do'; itemType: 'supplement' | 'activity';
  group: 'Supplements' | 'Fasting'; days: number[] | null; notes: string;
  link?: Partial<AdminProtocolItem>;
}

export const SUPPLEMENT_PERIODS: Array<{ id: SupplementPeriod; label: string; time: string }> = [
  { id: 'morning', label: 'Morning', time: '08:00' }, { id: 'afternoon', label: 'Afternoon', time: '14:00' }, { id: 'evening', label: 'Evening', time: '20:00' },
];
export const FASTING_TYPES: Array<{ id: FastingType; label: string }> = [
  { id: 'none', label: 'None' }, { id: 'intermittent', label: 'Intermittent fast' }, { id: 'water', label: 'Water fast' }, { id: 'dry', label: 'Dry fast' }, { id: 'daniel', label: 'Daniel fast' },
];

export const defaultFasting = (): FastingPlan => ({ type:'none', start:'20:00', end:'12:00', days:WEEK.map(w => w.day), fullDay:false });
export const supplementCell = (cfg: DietConfig, day: number, period: SupplementPeriod) => cfg.supplementPlan?.[`${day}:${period}`] ?? { items:cfg.supplements?.[period] || [], time:cfg.supplementTimes?.[period] || SUPPLEMENT_PERIODS.find(p => p.id === period)!.time };
const validClock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
/** Half-open wall-clock intervals on this day; selected days are fast START days. */
export function fastingWindows(cfg: DietConfig, day: number): Array<[number,number]> {
  const f = cfg.fasting;
  if (!f || ['none','daniel'].includes(f.type)) return [];
  if (f.fullDay) return f.days.includes(day) ? [[0,1440]] : [];
  if (!validClock(f.start) || !validClock(f.end) || f.start === f.end) return [];
  const start = toMin(f.start), end = toMin(f.end);
  if (start < end) return f.days.includes(day) ? [[start,end]] : [];
  return [...(f.days.includes(day) ? [[start,1440] as [number,number]] : []), ...(f.days.includes(day === 1 ? 7 : day-1) ? [[0,end] as [number,number]] : [])].filter(([s,e]) => s < e);
}
export const isFastingAt = (cfg: DietConfig, day: number, time: string) => validClock(time) && fastingWindows(cfg,day).some(([start,end]) => toMin(time) >= start && toMin(time) < end);
export const mealIsFasting = (cfg: DietConfig, day: number, slot: string) => isFastingAt(cfg,day,resolveTiming(mealTiming(cfg,slot)));
export const fastingDrinkAllowed = (cfg: DietConfig, day: number, slot: string, drink: string | MealPick) => !mealIsFasting(cfg,day,slot) || (cfg.fasting?.type !== 'dry' && /^(?:(?:plain|still|sparkling|mineral|filtered|tap|bottled) )?water$/i.test(typeof drink === 'string' ? drink.trim() : drink.name.trim()));

const actionTitle = (value: string, verb: string) => /^(take|use|drink|apply|start|end|follow)\b/i.test(value.trim()) ? value.trim() : `${verb} ${value.trim()}`;
/** Supplement and fasting rows generated by the Diet builder, ready to save as Protocol items. */
export function dietSupportItems(cfg: DietConfig): DietSupportItem[] {
  const grouped = new Map<string,DietSupportItem>();
  for (const period of SUPPLEMENT_PERIODS) for (const w of WEEK) {
    const cell = supplementCell(cfg,w.day,period.id);
    for (const [index,pick] of cell.items.filter(x => (typeof x === 'string' ? x : x.name).trim()).entries()) {
      const link = typeof pick === 'string' ? undefined : { [pick.source === 'product' ? 'catalog_product_id' : 'supplement_id']:pick.id,media_image_url:pick.image };
      const item: DietSupportItem = { title:actionTitle(typeof pick === 'string' ? pick : pick.name,'Take'),time:cell.time,category:'supplement',itemType:'supplement',group:'Supplements',days:[],notes:`${period.label} supplement`, ...(link ? {link} : {}) };
      const key = JSON.stringify([period.id,index,item.title,item.time,link]);
      const current = grouped.get(key) || item;
      if (!current.days!.includes(w.dow)) current.days!.push(w.dow);
      grouped.set(key,current);
    }
  }
  const supplements = [...grouped.values()].map(item => ({ ...item,days:item.days?.length === 7 ? null : item.days }));
  const fasting = cfg.fasting;
  if (!fasting || fasting.type === 'none') return supplements;
  const label = FASTING_TYPES.find((x) => x.id === fasting.type)?.label || 'Fast';
  const days = [...new Set(fasting.days.filter((day) => WEEK.some((w) => w.day === day)).map((day) => WEEK.find((w) => w.day === day)!.dow))];
  if (!days.length) return supplements;
  const warning = fasting.type === 'dry' ? 'Dry fasting restricts fluids and can be dangerous. Use only with qualified medical guidance.' : '';
  const fullDay = fasting.fullDay && fasting.type !== 'daniel';
  const endDays = fullDay || fasting.end < fasting.start ? days.map((day) => (day + 1) % 7) : days;
  return [...supplements,
    { title: `Start ${label.toLowerCase()}`, time: fullDay ? '00:00' : fasting.start, category: 'do', itemType: 'activity', group: 'Fasting', days, notes: warning },
    { title: `End ${label.toLowerCase()}`, time: fullDay ? '00:00' : fasting.end, category: 'do', itemType: 'activity', group: 'Fasting', days: endDays, notes: warning },
  ];
}

export const FRAMEWORK_RULES: Record<string, string[]> = {
  mediterranean: ['Cook with extra-virgin olive oil', 'Eat fish twice this week', 'Fill half the plate with vegetables'],
  vegan: ['Take vitamin B12 as advised', 'Include a legume at lunch or dinner'],
  keto: ['Keep carbohydrate under 20–50 g a day', 'Salt food to taste and drink water'],
  low_carb: ['Choose vegetables over bread, pasta and rice'],
  high_protein: ['Include a protein source at every meal'],
  low_fodmap: ['Avoid onion and garlic', 'Check labels for high-FODMAP sweeteners'],
  gluten_free: ['Check labels for hidden gluten'],
};
export const mealTiming = (cfg: DietConfig, slotId: string): Timing => cfg.timing?.[slotId] || { anchor: 'clock', time: MEAL_SLOTS.find((s) => s.id === slotId)?.time || '12:00', offset: 0 };

export function macroGrams(cfg: Pick<DietConfig, 'kcal' | 'protein' | 'carbs' | 'fat'>) {
  return { energy_kcal: cfg.kcal, protein_g: Math.round(cfg.kcal * cfg.protein / 100 / 4), carbohydrates_g: Math.round(cfg.kcal * cfg.carbs / 100 / 4), fats_g: Math.round(cfg.kcal * cfg.fat / 100 / 9) };
}

const n = (v: unknown) => { const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(x) ? x : 0; };
export function toMealNutrition(raw: any): MealNutrition | null {
  if (!raw || typeof raw !== 'object') return null;
  const valid = (v: unknown) => v !== null && v !== '' && (typeof v === 'number' || typeof v === 'string') && Number.isFinite(Number(v)) && Number(v) >= 0;
  const values = { ...raw, energy_kcal: raw.energy_kcal ?? raw.calories, fats_g: raw.fats_g ?? raw.fat_g, carbohydrates_g: raw.carbohydrates_g ?? raw.carbs_g };
  const nutrients: Record<string, number> = {};
  for (const [k, v] of Object.entries({ ...values, ...(raw.micros || {}) })) if (valid(v) && /_(g|mg|mcg|ug|iu|kcal|kj)$/i.test(k)) nutrients[k] = Number(v);
  if (!Object.keys(nutrients).length) return null;
  return { energy_kcal: n(values.energy_kcal), protein_g: n(values.protein_g), carbohydrates_g: n(values.carbohydrates_g), fats_g: n(values.fats_g), fiber_g: n(values.fiber_g), recorded: Object.keys(nutrients), nutrients };
}

export function sumNutrition(picks: (MealPick | null | undefined)[]): MealNutrition {
  const out: MealNutrition = { energy_kcal: 0, protein_g: 0, carbohydrates_g: 0, fats_g: 0, fiber_g: 0 };
  for (const p of picks) if (p?.nutrition) for (const k of ['energy_kcal','protein_g','carbohydrates_g','fats_g','fiber_g'] as const) out[k] = (out[k] || 0) + (p.nutrition[k] || 0) * selectedServings(p);
  return out;
}

export function guideRecipeToPick(recipe: GuideRecipe): MealPick {
  return { source: 'guide', id: recipe.id, name: recipe.title, category: recipe.meal_slot, image: recipe.image_url || null, nutrition: toMealNutrition(recipe.nutrition_per_serving) };
}

/** Catalog recipes with stored per-serving nutrition that fit the framework, sized for the slot's kcal budget. */
export async function searchDietRecipes(accessToken: string, opts: { framework: DietFramework; query?: string; kcalTarget?: number; limit?: number; drinksOnly?: boolean }): Promise<MealPick[]> {
  const params = [
    'is_published=eq.true',
    'select=id,name_common,category,image_url,nutrition_per_serving,dietary_info,health_score',
    `and=(or(is_group.is.null,is_group.eq.false)${opts.drinksOnly ? ',or(category.ilike.drink,category.ilike.beverage)' : ''})`,
    'order=health_score.desc.nullslast',
    `limit=${opts.query ? 40 : 160}`,
  ];
  if (opts.framework.flag) params.push(`dietary_info->>${opts.framework.flag}=eq.true`);
  const q = opts.query?.replace(/[%,()*]/g, ' ').trim();
  if (q) params.push(`name_common=ilike.*${encodeURIComponent(q)}*`);
  const res = await fetch(`${rest()}/catalog_recipes?${params.join('&')}`, { headers: headers(accessToken) });
  if (!res.ok) throw new Error(`Recipe search failed (${res.status})`);
  const rows = (await res.json()) as any[];
  let picks = rows.map((r) => ({ source: 'catalog' as const, id: r.id, name: r.name_common || 'Recipe', category: r.category, image: r.image_url || null, nutrition: toMealNutrition(r.nutrition_per_serving) }));
  if (opts.drinksOnly) picks = picks.filter(isDrinkPick);
  if (opts.kcalTarget) {
    const t = opts.kcalTarget;
    const fit = (p: MealPick) => p.nutrition ? Math.abs((p.nutrition.energy_kcal - t) / t) - (opts.framework.id === 'high_protein' && p.nutrition.energy_kcal > 0 ? p.nutrition.protein_g * 4 / p.nutrition.energy_kcal : 0) : Number.MAX_VALUE;
    picks = picks.sort((a, b) => fit(a) - fit(b));
  }
  return picks.slice(0, opts.limit || 12);
}

/** Fill every empty day × slot with the best-fitting recipe, preferring variety (no repeat within 3 days). */
export async function autoFillDiet(accessToken: string, cfg: DietConfig, guideRecipes: GuideRecipe[]): Promise<Record<string, MealPick | null>> {
  const framework = DIET_FRAMEWORKS.find((f) => f.id === cfg.framework) || DIET_FRAMEWORKS[0];
  const plan = { ...cfg.plan };
  const slots = MEAL_SLOTS.filter((s) => cfg.slots.includes(s.id));
  const shareTotal = slots.reduce((sum, s) => sum + s.share, 0) || 1;
  const own = guideRecipes.map(guideRecipeToPick).filter((p) => p.nutrition);
  for (const slot of slots) {
    const target = cfg.kcal * slot.share / shareTotal;
    const pool = [...own.filter((p) => Math.abs(p.nutrition!.energy_kcal - target) / target < 0.35), ...await searchDietRecipes(accessToken, { framework, kcalTarget: target, limit: 40 })]
      .filter((p) => fitsSlot(p.name, slot.id)); // never a "Lunch Bowl" at breakfast
    if (!pool.length) continue;
    WEEK.forEach(({ day }, index) => {
      const key = `${day}:${slot.id}`;
      if (plan[key]) return;
      const recent = new Set([1, 2, 3].map((back) => plan[`${day - back}:${slot.id}`]?.id).filter(Boolean));
      plan[key] = pool.find((p, i) => i >= index % pool.length && !recent.has(p.id)) || pool.find((p) => !recent.has(p.id)) || pool[0];
    });
  }
  return plan;
}

/* ── fitness ── */
export interface ActivityPick { id: string; name: string; image: string | null; category: string | null; minutes: number | null; bodyParts?: string[]; description?: string | null; subcategory?: string | null; parentId?: string | null }

/* ── muscle groups (from catalog_activities.body_parts) ── */
export const MUSCLE_GROUPS = [
  { id: 'legs', label: 'Legs', parts: ['legs', 'quadriceps', 'hamstrings', 'calves', 'adductors', 'abductors', 'soleus', 'gastrocnemius', 'hip_flexors'] },
  { id: 'glutes', label: 'Glutes', parts: ['glutes', 'gluteus_maximus', 'gluteus_medius'] },
  { id: 'chest', label: 'Chest', parts: ['chest', 'upper_chest', 'pectorals'] },
  { id: 'back', label: 'Back', parts: ['back', 'latissimus_dorsi', 'rhomboids', 'lower_back', 'trapezius', 'upper_trapezius', 'middle_trapezius', 'erector_spinae', 'spine'] },
  { id: 'shoulders', label: 'Shoulders', parts: ['shoulders', 'deltoids', 'anterior_deltoids', 'rear_deltoids', 'medial_deltoids', 'rotator_cuff'] },
  { id: 'arms', label: 'Arms', parts: ['biceps', 'triceps', 'forearms', 'brachialis'] },
  { id: 'core', label: 'Core', parts: ['core', 'abdominals', 'abdomen', 'obliques', 'rectus_abdominis', 'diaphragm', 'intercostals'] },
  { id: 'neck', label: 'Neck', parts: ['neck', 'scalenes', 'cervical_spine'] },
  { id: 'face', label: 'Face', parts: ['face', 'jaw', 'cheeks', 'mouth', 'forehead', 'eyes', 'lips', 'facial_muscles'] },
  { id: 'full', label: 'Full body', parts: ['full_body'] },
] as const;
export type MuscleGroupId = typeof MUSCLE_GROUPS[number]['id'];
/** An exercise's main muscle group: the group most of its body parts belong to (first listed part breaks ties). */
export function muscleGroupOf(a: { bodyParts?: string[]; category?: string | null; name?: string }): string {
  const parts = (a.bodyParts || []).map((p) => p.toLowerCase());
  if (/\b(face|facial|jaw|cheek)\b/i.test(a.name || '') && !/pull/i.test(a.name || '')) return 'Face';
  let best: string | null = null, bestScore = 0;
  // The catalog lists the prime mover first (bench press: chest, then triceps/deltoids), so it weighs 3; others 1.
  for (const g of MUSCLE_GROUPS) { const score = parts.reduce((sum, p, i) => sum + ((g.parts as readonly string[]).includes(p) ? (i === 0 ? 3 : 1) : 0), 0); if (score > bestScore) { bestScore = score; best = g.label; } }
  if (best) return best;
  if (/cardio|sports|hiit/i.test(a.category || '')) return 'Cardio';
  if (/stretch|recovery|yoga|mobility/i.test(a.category || '')) return 'Mobility';
  return 'Other';
}
const GROUP_ORDER = [...MUSCLE_GROUPS.map((g) => g.label as string), 'Cardio', 'Mobility', 'Other'];
export const sortByMuscle = <T extends { bodyParts?: string[]; category?: string | null; name?: string }>(list: T[]) => [...list].sort((a, b) => GROUP_ORDER.indexOf(muscleGroupOf(a)) - GROUP_ORDER.indexOf(muscleGroupOf(b)));

/** A day name from what its exercises train ("Leg day", "Upper body day", "Face workout"…). */
export function dayNameFor(exercises: Array<{ bodyParts?: string[]; category?: string | null; name?: string }>): string | null {
  if (!exercises.length) return null;
  const groups = new Set(exercises.map(muscleGroupOf));
  const has = (...g: string[]) => g.some((x) => groups.has(x));
  const only = (...g: string[]) => [...groups].every((x) => g.includes(x));
  if (only('Face', 'Neck')) return 'Face workout';
  if (only('Cardio')) return 'Cardio day';
  if (only('Mobility', 'Neck')) return 'Mobility day';
  if (only('Legs', 'Glutes', 'Core')) return has('Legs', 'Glutes') ? 'Leg day' : 'Core day';
  if (only('Chest', 'Shoulders', 'Arms', 'Back', 'Core')) {
    if (only('Chest', 'Shoulders', 'Arms', 'Core') && has('Chest', 'Shoulders')) return 'Push day';
    if (only('Back', 'Arms', 'Core') && has('Back')) return 'Pull day';
    return 'Upper body day';
  }
  return 'Full body day';
}
export interface ExercisePick extends ActivityPick { sets: number | null; reps: string | null; rest_seconds: number | null; role?: 'warmup' | 'recovery' }
/** Warm-up first, then the training grouped by muscle, then recovery: the order a session is done in. */
export const orderedExercises = <T extends ExercisePick>(list: T[]) => [...list.filter((e) => e.role === 'warmup'), ...sortByMuscle(list.filter((e) => !e.role)), ...list.filter((e) => e.role === 'recovery')];
export const exerciseGroup = (e: ExercisePick) => (e.role === 'warmup' ? 'Warm-up' : e.role === 'recovery' ? 'Recovery' : muscleGroupOf(e));
export interface FitnessSession { day: number; time: string; anchor?: Anchor; offset?: number; rules?: string[]; title: string; minutes: number; intensity: 'low' | 'moderate' | 'high'; exercises: ExercisePick[] }
/** What the person likes doing: training types steer each session's catalog categories, sports become sessions. */
export interface FitnessLikes { types: string[]; sports: ActivityPick[]; muscles?: MuscleGroupId[]; exercises?: ActivityPick[] }
/** Training types that suit each goal: shown first and marked as suggested; the rest stay pickable. */
export const GOAL_TYPES: Record<string, string[]> = {
  weight_loss: ['strength', 'cardio', 'hiit'], muscle_gain: ['strength', 'calisthenics', 'recovery'], endurance: ['cardio', 'hiit', 'water'],
  mobility: ['stretching', 'yoga', 'recovery'], face: [], general: ['strength', 'cardio', 'stretching'],
};
/** Catalog categories of the picked training types (recovery excluded: it is added after sessions, not as one). */
export const likedCategories = (likes?: FitnessLikes) => [...new Set(TRAINING_TYPES.filter((t) => likes?.types.includes(t.id) && t.id !== 'recovery').flatMap((t) => t.categories))];
/** Food or supplements around every training session: free text or catalog picks, like Diet supplements. */
export type FuelItem = string | SupplementPick;
export interface TrainingFuel { pre: FuelItem[]; post: FuelItem[]; preMinutes: number; postMinutes: number }
export const defaultFuel = (): TrainingFuel => ({ pre: [], post: [], preMinutes: 30, postMinutes: 15 });
/** When the person trains: which days are workdays, the time of day on workdays and on other days, and rest days. */
export type TrainTime = 'morning' | 'lunch' | 'evening';
export interface FitnessSchedule { workdays: number[]; workday: TrainTime; other: TrainTime; restDays: number[] }
export const defaultSchedule = (): FitnessSchedule => ({ workdays: [1, 2, 3, 4, 5], workday: 'morning', other: 'morning', restDays: [] });
export const TRAIN_TIMES: Array<{ id: TrainTime; label: string; timing: Timing }> = [
  { id: 'morning', label: 'Morning', timing: { anchor: 'wake', time: '07:00', offset: 30 } },
  { id: 'lunch', label: 'Lunchtime', timing: { anchor: 'clock', time: '12:30', offset: 0 } },
  { id: 'evening', label: 'Evening', timing: { anchor: 'clock', time: '18:30', offset: 0 } },
];
/** A session's timing on this day under the schedule (morning = 30 min after waking when none is set). */
export function sessionTimeFor(day: number, schedule?: FitnessSchedule): Timing {
  const pref: TrainTime = !schedule ? 'morning' : schedule.workdays.includes(day) ? schedule.workday : schedule.other;
  return { ...TRAIN_TIMES.find((t) => t.id === pref)!.timing };
}
export interface FitnessConfig { goal: string; level: 'beginner' | 'intermediate' | 'advanced'; minutes: number; sessions: FitnessSession[]; rules?: string[]; likes?: FitnessLikes; fuel?: TrainingFuel; schedule?: FitnessSchedule }

export interface FuelSlot { day: number; session: string; when: 'pre' | 'post'; time: string; items: FuelItem[] }
export const fuelName = (item: FuelItem) => (typeof item === 'string' ? item : item.name).trim();
/** Each session's fuel, timed from the session: `preMinutes` before it starts, `postMinutes` after it ends. */
export function trainingFuel(cfg: FitnessConfig): FuelSlot[] {
  const f = cfg.fuel;
  if (!f) return [];
  const pre = f.pre.filter((i) => fuelName(i)), post = f.post.filter((i) => fuelName(i));
  return [...cfg.sessions].sort((a, b) => a.day - b.day).flatMap((s) => {
    const start = resolveTiming(sessionTiming(s));
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) return [];
    return [
      ...(pre.length ? [{ day: s.day, session: s.title, when: 'pre' as const, time: toHHMM(toMin(start) - Math.max(0, f.preMinutes || 0)), items: pre }] : []),
      ...(post.length ? [{ day: s.day, session: s.title, when: 'post' as const, time: toHHMM(toMin(start) + (s.minutes || 0) + Math.max(0, f.postMinutes || 0)), items: post }] : []),
    ];
  });
}
export const sessionTiming = (s: FitnessSession): Timing => ({ anchor: s.anchor || 'clock', time: s.time, offset: s.offset || 0 });

type Template = { title: string; categories: string[]; terms: string[]; muscles?: MuscleGroupId[]; intensity: FitnessSession['intensity'] };
export interface FitnessGoal { id: string; label: string; note: string; days: number[]; pattern: Template[] }

const STRENGTH_UPPER: Template = { title: 'Upper body day', categories: ['Strength', 'Gym', 'Calisthenics'], terms: [], muscles: ['chest', 'back', 'shoulders', 'arms', 'back'], intensity: 'moderate' };
const STRENGTH_LOWER: Template = { title: 'Leg day', categories: ['Strength', 'Gym', 'Calisthenics'], terms: [], muscles: ['legs', 'glutes', 'legs', 'core', 'glutes'], intensity: 'moderate' };
const FULL_BODY: Template = { title: 'Full body day', categories: ['Strength', 'Gym', 'Calisthenics'], terms: [], muscles: ['legs', 'chest', 'back', 'core', 'shoulders'], intensity: 'moderate' };
const CARDIO: Template = { title: 'Cardio day', categories: ['Cardio', 'Sports', 'Water Sports'], terms: ['walk', 'run', 'cycl', 'swim'], intensity: 'moderate' };
const HIIT: Template = { title: 'Intervals day', categories: ['Hiit', 'Cardio', 'Calisthenics', 'Martial Arts'], terms: ['burpee', 'climber', 'jump', 'sprint'], intensity: 'high' };
const MOBILITY: Template = { title: 'Mobility day', categories: ['Stretch', 'Recovery', 'Yoga'], terms: ['hip', 'hamstring', 'shoulder', 'spine'], intensity: 'low' };

/** Weekly splits per goal; days are WEEK.day numbers (1 = Mon). */
export const FITNESS_GOALS: FitnessGoal[] = [
  { id: 'weight_loss', label: 'Weight loss', note: 'Strength to keep muscle plus regular cardio for energy use.', days: [1, 2, 4, 5, 6], pattern: [FULL_BODY, CARDIO, FULL_BODY, HIIT, CARDIO] },
  { id: 'muscle_gain', label: 'Muscle gain', note: 'Upper/lower split with progressive load and recovery days.', days: [1, 2, 4, 5], pattern: [STRENGTH_UPPER, STRENGTH_LOWER, STRENGTH_UPPER, STRENGTH_LOWER] },
  { id: 'endurance', label: 'Endurance', note: 'Mostly easy aerobic volume, one interval day, one strength day.', days: [1, 3, 4, 6], pattern: [CARDIO, HIIT, FULL_BODY, { ...CARDIO, title: 'Long easy cardio day' }] },
  { id: 'mobility', label: 'Mobility', note: 'Daily short mobility with gentle strength twice a week.', days: [1, 2, 3, 4, 5, 6], pattern: [MOBILITY, FULL_BODY, MOBILITY, MOBILITY, FULL_BODY, MOBILITY] },
  { id: 'face', label: 'Face', note: 'Short facial muscle and jaw sessions, most days. Add your own face exercises where the catalog has none yet.', days: [1, 2, 3, 4, 5, 6], pattern: [{ title: 'Face workout', categories: [], terms: [], muscles: ['face', 'face', 'face', 'neck'], intensity: 'low' }] },
  { id: 'general', label: 'General fitness', note: 'Balanced week: strength, cardio and mobility.', days: [1, 3, 5], pattern: [FULL_BODY, CARDIO, MOBILITY] },
];

/** Training types a person can pick; each maps to catalog_activities categories. */
export const TRAINING_TYPES: Array<{ id: string; label: string; categories: string[] }> = [
  { id: 'strength', label: 'Strength', categories: ['Strength', 'Gym', 'Fitness'] },
  { id: 'calisthenics', label: 'Calisthenics', categories: ['Calisthenics'] },
  { id: 'cardio', label: 'Cardio', categories: ['Cardio'] },
  { id: 'hiit', label: 'HIIT', categories: ['Hiit'] },
  { id: 'stretching', label: 'Stretching & mobility', categories: ['Stretch'] },
  { id: 'yoga', label: 'Yoga', categories: ['Yoga'] },
  { id: 'martial_arts', label: 'Martial arts', categories: ['Martial Arts'] },
  { id: 'water', label: 'Water sports', categories: ['Water Sports'] },
  { id: 'recovery', label: 'Recovery', categories: ['Recovery'] },
];

/** Recovery activities that belong straight after training (ice bath, sauna, foam rolling…), not sleep or light hygiene. */
export const isPostWorkoutRecovery = (name: string) =>
  /ice bath|cold water|cryo|contrast|sauna|steam|foam roll|massage|compression|normatec|percussion|theragun|float tank|red light|active recovery|cool-down|easy spin|gentle walk|light walk|progressive muscle relaxation|recovery breath/i.test(name);

export interface PlannedSession { day: number; template: Template; sport?: ActivityPick }
const isCardioDay = (t: Template) => t.categories.includes('Cardio') && !t.categories.includes('Hiit');

/**
 * Which template each training day gets, adjusted to what the person likes. Picked training types narrow a
 * session's catalog categories (kept as-is when none of them fit that session). Picked sports take over the
 * cardio days in turn; a goal without cardio days gets one sports day on the first free day from Saturday.
 */
export function planFitnessWeek(goal: FitnessGoal, likes?: FitnessLikes, schedule?: FitnessSchedule): PlannedSession[] {
  const rest = new Set(schedule?.restDays || []);
  const chosen = new Set(TRAINING_TYPES.filter((t) => likes?.types.includes(t.id) && t.id !== 'recovery').flatMap((t) => t.categories));
  const narrow = (t: Template): Template => {
    if (!chosen.size || !t.categories.length) return focus(t);
    const kept = t.categories.filter((c) => chosen.has(c));
    return focus({ ...t, categories: kept.length ? kept : t.categories });
  };
  // Muscle focus: strength days train only the picked muscles (in turn), when any of them fit that day.
  const muscles = likes?.muscles || [];
  const focus = (t: Template): Template => {
    if (!muscles.length || !t.muscles?.length || t.muscles.includes('face')) return t;
    const fit = t.muscles.filter((m) => muscles.includes(m));
    const list = fit.length ? fit : muscles;
    return { ...t, muscles: t.muscles.map((_, i) => list[i % list.length]) };
  };
  const sports = likes?.sports || [];
  let next = 0;
  const plan: PlannedSession[] = goal.days.map((day, i) => {
    const t = goal.pattern[i % goal.pattern.length];
    if (sports.length && isCardioDay(t)) { const sport = sports[next++ % sports.length]; return { day, sport, template: { title: sport.name, categories: ['Sports'], terms: [], intensity: 'moderate' } }; }
    return { day, template: narrow(t) };
  });
  if (sports.length && next === 0) {
    const free = [6, 7, 3, 5, 2, 4, 1].find((d) => !goal.days.includes(d) && !rest.has(d));
    if (free) plan.push({ day: free, sport: sports[0], template: { title: sports[0].name, categories: ['Sports'], terms: [], intensity: 'moderate' } });
  }
  // Rest days: move a session to the nearest free day (next day first, then the day before…); keep it if none is free.
  if (rest.size) {
    const taken = new Set(plan.filter((p) => !rest.has(p.day)).map((p) => p.day));
    for (const p of plan) if (rest.has(p.day)) {
      const to = [1, 2, 3, 4, 5, 6].flatMap((d) => [p.day + d, p.day - d]).find((d) => d >= 1 && d <= 7 && !rest.has(d) && !taken.has(d));
      if (to) { taken.add(to); p.day = to; }
    }
  }
  return plan.sort((a, b) => a.day - b.day);
}

const LEVEL = { beginner: { sets: 2, reps: '10', rest: 90, exercises: 3 }, intermediate: { sets: 3, reps: '8–12', rest: 75, exercises: 4 }, advanced: { sets: 4, reps: '6–10', rest: 60, exercises: 5 } };

export async function searchActivities(accessToken: string, opts: { query?: string; categories?: string[]; excludeCategories?: string[]; limit?: number; offset?: number; muscle?: MuscleGroupId | null }): Promise<ActivityPick[]> {
  const params = [`select=${ACTIVITY_SELECT}`, 'is_group=not.is.true', `limit=${opts.limit || 12}`, `offset=${opts.offset || 0}`, 'order=health_score.desc.nullslast,name.asc,id.asc'];
  const group = opts.muscle ? MUSCLE_GROUPS.find((g) => g.id === opts.muscle) : null;
  if (group) {
    // body_parts is a jsonb array: match any of the group's parts; face also matches by name.
    const ors = group.parts.map((p) => `body_parts.cs.${encodeURIComponent(JSON.stringify([p]))}`);
    if (group.id === 'face') ors.push('name.ilike.*facial*', 'name.ilike.*face%20yoga*', 'name.ilike.*jaw*', 'name.ilike.*cheek*');
    params.push(`or=(${ors.join(',')})`);
    params.push('category=not.in.(Beauty,Hygiene,Supplement,Consume)'); // muscle work only, not face mists or flossing
  }
  if (opts.categories?.length) params.push(`category=in.(${opts.categories.map((c) => `"${c}"`).join(',')})`);
  else if (opts.excludeCategories?.length && !group) params.push(`category=not.in.(${opts.excludeCategories.map((c) => `"${c}"`).join(',')})`);
  const q = opts.query?.replace(/[%,()*]/g, ' ').trim();
  if (q) params.push(`name=ilike.*${encodeURIComponent(q)}*`);
  const res = await fetch(`${rest()}/catalog_activities?${params.join('&')}`, { headers: headers(accessToken) });
  if (!res.ok) throw new Error(`Activity search failed (${res.status})`);
  return ((await res.json()) as any[]).map((r) => ({ id: r.id, name: r.name, image: r.image_url || r.primary_image_url || null, category: r.category, minutes: r.default_duration_min ?? null, bodyParts: Array.isArray(r.body_parts) ? r.body_parts.map(String) : [], ...activityExtras(r) }));
}

const ACTIVITY_SELECT = 'id,name,image_url,primary_image_url,category,default_duration_min,body_parts,description,subcategory,parent_activity_id,parent_id';
const activityExtras = (r: any) => ({ description: typeof r.description === 'string' ? r.description : null, subcategory: r.subcategory ?? null, parentId: r.parent_activity_id || r.parent_id || null });
const toPick = (r: any): ActivityPick => ({ id: r.id, name: r.name, image: r.image_url || r.primary_image_url || null, category: r.category, minutes: r.default_duration_min ?? null, bodyParts: Array.isArray(r.body_parts) ? r.body_parts.map(String) : [], ...activityExtras(r) });

/**
 * Sub-activities of an activity: the others under the same parent group and subcategory (Treadmill Run, Trail
 * Running, Long Run…), most similar names first. Empty when the activity has no parent in the catalogue.
 */
export async function activityRelatives(accessToken: string, a: ActivityPick, limit = 24): Promise<ActivityPick[]> {
  if (!a.parentId) return [];
  const params = [`select=${ACTIVITY_SELECT}`, 'is_group=not.is.true', `or=(parent_activity_id.eq.${a.parentId},parent_id.eq.${a.parentId})`, `id=neq.${a.id}`, `limit=${limit * 2}`];
  if (a.subcategory) params.push(`subcategory=eq.${encodeURIComponent(a.subcategory)}`);
  const res = await fetch(`${rest()}/catalog_activities?${params.join('&')}`, { headers: headers(accessToken) });
  if (!res.ok) throw new Error(`Could not load related activities (${res.status})`);
  const words = new Set(a.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2));
  const shared = (x: ActivityPick) => x.name.toLowerCase().split(/[^a-z]+/).filter((w) => words.has(w) || [...words].some((v) => w.startsWith(v.slice(0, 4)))).length;
  return ((await res.json()) as any[]).map(toPick).sort((x, y) => shared(y) - shared(x) || x.name.localeCompare(y.name)).slice(0, limit);
}

/** Indoor or outdoor, when the name says so (treadmill, gym, pool… / trail, road, open water…). */
export function activitySetting(name: string): 'Indoor' | 'Outdoor' | null {
  if (/\b(treadmill|indoor|machine|gym|studio|stationary|rower|elliptical|pool|spin|sauna|cable)\b/i.test(name)) return 'Indoor';
  if (/\b(trail|outdoor|road|hik(e|ing)|open water|mountain|beach|track|park|forest|sea|ski|surf)\b/i.test(name)) return 'Outdoor';
  return null;
}

/** Everything the app's activity detail shows, for one catalog activity. */
export interface ActivityDetail {
  id: string; name: string; image: string | null; emoji: string | null; category: string | null; description: string | null;
  steps: string[]; benefits: string[]; rules: string[]; tips: string | null; bodyParts: string[];
  caloriesPerHour: number | null; intensity: string | null; sweat: string | null; minutes: number | null;
}
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === 'string' && v.trim() ? [v] : []);
export async function getActivityDetail(accessToken: string, id: string): Promise<ActivityDetail | null> {
  const res = await fetch(`${rest()}/catalog_activities?id=eq.${encodeURIComponent(id)}&select=id,name,image_url,primary_image_url,emoji_icon,category,description,instructions,steps,benefits,health_benefits,rules,tips,body_parts,calories_per_hour,intensity,sweat_level,default_duration_min&limit=1`, { headers: headers(accessToken) });
  if (!res.ok) throw new Error(`Activity lookup failed (${res.status})`);
  const r = ((await res.json()) as any[])[0];
  if (!r) return null;
  // Steps: the curated list, else the numbered instructions split into lines.
  const steps = list(r.steps).length ? list(r.steps) : String(r.instructions || '').split('\n').map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
  return {
    id: r.id, name: r.name, image: r.image_url || r.primary_image_url || null, emoji: r.emoji_icon || null, category: r.category || null, description: r.description || null,
    steps, benefits: [...new Set([...list(r.health_benefits), ...list(r.benefits)])], rules: list(r.rules), tips: r.tips || null, bodyParts: list(r.body_parts),
    caloriesPerHour: num(r.calories_per_hour), intensity: r.intensity || null, sweat: r.sweat_level || null, minutes: num(r.default_duration_min),
  };
}

/** Build the goal's weekly split, filling each session with catalog exercises that match its pattern. */
/**
 * Warm-up stretches for a session: the stretches that cover most of the body parts it trains, preferring ones not
 * used earlier in the week. Each is a short timed hold done before the training.
 */
export function pickWarmups(trained: Array<{ bodyParts?: string[] }>, stretches: ActivityPick[], usedThisWeek: Set<string>, count = 2): ExercisePick[] {
  const parts = new Set(trained.flatMap((e) => e.bodyParts || []));
  const score = (s: ActivityPick) => (s.bodyParts || []).filter((p) => parts.has(p)).length;
  const ranked = [...stretches].sort((a, b) => score(b) - score(a) || Number(usedThisWeek.has(a.id)) - Number(usedThisWeek.has(b.id)));
  const chosen = ranked.filter((s) => score(s) > 0).slice(0, count);
  for (const s of ranked) if (chosen.length < count && !chosen.includes(s)) chosen.push(s); // no match: general stretches
  chosen.forEach((s) => usedThisWeek.add(s.id));
  return chosen.map((s) => ({ ...s, sets: null, reps: null, rest_seconds: null, minutes: 2, role: 'warmup' as const }));
}

export async function draftFitnessWeek(accessToken: string, goalId: string, level: FitnessConfig['level'], minutes: number, likes?: FitnessLikes, schedule?: FitnessSchedule): Promise<FitnessSession[]> {
  const goal = FITNESS_GOALS.find((g) => g.id === goalId) || FITNESS_GOALS[0];
  const dose = LEVEL[level];
  const used = new Set<string>();
  const sessions: FitnessSession[] = [];
  // Recovery picked: each moderate/high session ends with a different post-workout recovery activity.
  const recovery = likes?.types.includes('recovery')
    ? (await searchActivities(accessToken, { categories: ['Recovery'], limit: 60 }).catch(() => [])).filter((a) => isPostWorkoutRecovery(a.name))
    : [];
  // Every training session starts with stretches for the muscles it works.
  const stretches = await searchActivities(accessToken, { categories: ['Stretch'], limit: 80 }).catch(() => []);
  const warmedUp = new Set<string>();
  let nextRecovery = 0;
  for (const { day, template: t, sport } of planFitnessWeek(goal, likes, schedule)) {
    const when = sessionTimeFor(day, schedule);
    if (sport) {
      const warmups = pickWarmups([sport], stretches, warmedUp);
      const after = recovery.length ? [{ ...recovery[nextRecovery++ % recovery.length], sets: null, reps: null, rest_seconds: null, role: 'recovery' as const }] : [];
      sessions.push({ day, ...when, rules: warmups.length ? [] : ['Warm up for 5 minutes'], title: sport.name, minutes, intensity: 'moderate', exercises: [...warmups, { ...sport, sets: null, reps: null, rest_seconds: null, minutes }, ...after.map((r) => ({ ...r, minutes: r.minutes || 10 }))] });
      continue;
    }
    const exercises: ExercisePick[] = [];
    // Exercises the person picked go first in every session whose categories they belong to.
    for (const f of likes?.exercises || []) {
      if (exercises.length >= dose.exercises || !t.categories.includes(f.category || '') || exercises.some((e) => e.id === f.id)) continue;
      // On a muscle day only exercises for that day's muscles: a chest pick stays out of a leg day.
      if (t.muscles?.length) { const parts = new Set(MUSCLE_GROUPS.filter((g) => t.muscles!.includes(g.id)).flatMap((g) => g.parts as readonly string[])); if (!(f.bodyParts || []).some((b) => parts.has(b))) continue; }
      const timed = /cardio|sports|stretch|recovery|yoga/i.test(f.category || '');
      exercises.push({ ...f, sets: timed ? null : dose.sets, reps: timed ? null : dose.reps, rest_seconds: timed ? null : dose.rest, minutes: timed ? Math.max(5, Math.round(minutes / dose.exercises)) : null });
      used.add(f.id);
    }
    const picks: Array<{ term?: string; muscle?: MuscleGroupId }> = t.muscles?.length ? t.muscles.map((muscle) => ({ muscle })) : t.terms.map((term) => ({ term }));
    for (const pick of picks) {
      if (exercises.length >= dose.exercises) break;
      const hits = await searchActivities(accessToken, { query: pick.term, muscle: pick.muscle, categories: t.categories.length ? t.categories : undefined, limit: 8 }).catch(() => []);
      const hit = hits.find((h) => !used.has(h.id) && !exercises.some((e) => e.id === h.id)) || hits.find((h) => !exercises.some((e) => e.id === h.id));
      if (!hit) continue;
      used.add(hit.id);
      const timed = /cardio|sports|stretch|recovery|yoga/i.test(hit.category || '') || muscleGroupOf(hit) === 'Face';
      exercises.push({ ...hit, sets: timed ? null : dose.sets, reps: timed ? null : dose.reps, rest_seconds: timed ? null : dose.rest, minutes: timed ? Math.max(2, Math.round(minutes / Math.max(1, picks.length))) : null });
    }
    const title = dayNameFor(exercises) || t.title; // named from the training, before warm-up and recovery are added
    // Mobility days are stretching already; everything else opens with matching stretches.
    const warmups = t.intensity === 'low' ? [] : pickWarmups(exercises, stretches, warmedUp);
    if (recovery.length && t.intensity !== 'low') { const r = recovery[nextRecovery++ % recovery.length]; exercises.push({ ...r, sets: null, reps: null, rest_seconds: null, minutes: r.minutes || 10, role: 'recovery' }); }
    exercises.unshift(...warmups);
    sessions.push({ day, ...when, rules: t.intensity === 'low' || warmups.length ? [] : ['Warm up for 5 minutes'], title, minutes: t.muscles?.includes('face') ? Math.min(minutes, 15) : minutes, intensity: level === 'beginner' && t.intensity === 'high' ? 'moderate' : t.intensity, exercises });
  }
  return sessions;
}

/* ── saving ── */
const hhmmss = (t: string) => (t.length === 5 ? `${t}:00` : t);
// Weekly items carry no cycle day: in a 7-day Protocol the app also filters by day_number, so day_number 1 would show a
// Tuesday meal only when cycle day 1 is a Tuesday. Empty day_number = every cycle day; the weekday decides.
const weekly = (day: number) => ({ recurrence_type: 'weekly', recurrence_days_of_week: [WEEK.find((w) => w.day === day)?.dow ?? 1], day_number: null });

async function clearItems(accessToken: string, protocolId: string) {
  const items = await listProtocolItems(accessToken, protocolId);
  // Children first so no parent is deleted under a live child.
  for (const it of [...items].sort((a, b) => Number(!!b.parent_protocol_item_id) - Number(!!a.parent_protocol_item_id))) await deleteProtocolItem(accessToken, it.id);
}

/** Store builder settings; older databases without the columns still get the items (settings live in memory only). */
async function saveBuilderMeta(accessToken: string, id: string, patch: Record<string, unknown>): Promise<boolean> {
  try { await updateProtocol(accessToken, id, patch as Partial<AdminProtocol>); return true; } catch (error) {
    if (/builder_|source_protocol_ids|42703|PGRST204/.test(String((error as Error).message))) return false;
    throw error;
  }
}

/* ── shared item rules + review (protocolRules.ts is the single checker; conflicts are flagged, never auto-resolved) ── */
export interface RuleList { dos: string[]; donts: string[] }
/** "Avoid added sugar" / "No coffee after 2pm" → don't ("Added sugar"); anything else → do. Uses the shared isRuleTitle. */
export function splitRules(lines: string[]): RuleList {
  const out: RuleList = { dos: [], donts: [] };
  for (const raw of lines.map((x) => x.trim()).filter(Boolean)) {
    if (isRuleTitle(raw)) out.donts.push(raw.replace(/^(avoid|no|skip|don'?t|do not|cut out|cut)\s+/i, '').replace(/^./, (c) => c.toUpperCase()));
    else out.dos.push(raw);
  }
  return out;
}

export interface Conflict { rule: string; item: string; where: string; reason: string }
export interface ReviewNote { where: string; message: string }
export interface CheckedStep extends RuleStep { key: string }
/** notes = auto-fixes applied on save; blocking = must be fixed before saving (the hard gate); conflicts = contradictions, flagged only. */
export interface Review { steps: Record<string, CheckedStep>; notes: ReviewNote[]; blocking: ReviewNote[]; conflicts: Conflict[]; weekRules: RuleList }

// Interim subject tags for flagging only. Replace with the shared resolveConflicts once it is approved and built.
const SUBJECTS: { tag: string; rule: RegExp; item: RegExp }[] = [
  { tag: 'sugar', rule: /sugar|sweet/i, item: /sugar|honey|syrup|cake|cookie|biscuit|candy|chocolate|dessert|brownie|jam|caramel/i },
  { tag: 'caffeine', rule: /caffeine|coffee/i, item: /coffee|espresso|latte|cappuccino|\btea\b|matcha|cola|energy drink/i },
  { tag: 'alcohol', rule: /alcohol|wine|beer/i, item: /\b(wine|beer|cocktails?|spirits|liqueur|gin|vodka|rum|whisky|cider)\b/i },
  { tag: 'meat', rule: /\bmeat|red meat|pork|beef/i, item: /\b(beef|pork|lamb|bacon|ham|sausages?|chicken|turkey|veal|mince|steak|faggots?|liver|salami|chorizo)\b/i },
  { tag: 'dairy', rule: /dairy|milk|cheese/i, item: /milk|cheese|yog(h)?urt|cream|butter|paneer|kefir/i },
  { tag: 'gluten', rule: /gluten|wheat|bread/i, item: /bread|baguette|pasta|wheat|couscous|bulgur|pizza|wrap|bagel|cake/i },
  { tag: 'fried food', rule: /fried|deep[- ]fr/i, item: /fried|nugget|chips|fries|tempura|crispy/i },
  { tag: 'processed food', rule: /processed|ultra[- ]processed|fast food/i, item: /\b(nuggets?|sausages?|bacon|ham|crisps|instant)\b/i },
];
const DAYS_RE: [RegExp, number][] = [[/\bmon(day)?s?\b/i, 1], [/\btue(s(day)?)?s?\b/i, 2], [/\bwed(nesday)?s?\b/i, 3], [/\bthu(rs(day)?)?s?\b/i, 4], [/\bfri(day)?s?\b/i, 5], [/\bsat(urday)?s?\b/i, 6], [/\bsun(day)?s?\b/i, 7]];

/** A don't (or a "rest on Sunday" do) that an item in the same plan breaks. Flags only — the Guardian decides. */
export function findConflicts(rules: { text: string; scope: string; isDont: boolean }[], items: { title: string; where: string; day?: number; kind: 'meal' | 'session' | 'item' }[]): Conflict[] {
  const out: Conflict[] = [];
  for (const rule of rules) {
    // Any other don't: its own words against item names ("Avoid treadmill" vs "Treadmill Walk").
    const known = SUBJECTS.some((x) => x.rule.test(rule.text));
    if (rule.isDont && !known) {
      const words = rule.text.toLowerCase().replace(/^(avoid|no|skip|don'?t|do not|cut out|cut|limit|reduce)\s+/, '').split(/[^a-z]+/).filter((w) => w.length >= 4 && !/^(after|before|during|with|from|than|more|less|every|food|foods)$/.test(w));
      for (const it of items) if (words.some((w) => new RegExp(`\\b${w}`, 'i').test(it.title))) out.push({ rule: `Avoid ${rule.text.replace(/^avoid\s+/i, '').replace(/^./, (c) => c.toLowerCase())}`, item: it.title, where: it.where, reason: `${it.title} matches “${rule.text}” (${rule.scope})` });
    }
    if (rule.isDont) for (const subject of SUBJECTS) {
      if (!subject.rule.test(rule.text)) continue;
      for (const it of items) if (subject.item.test(it.title)) out.push({ rule: `Avoid ${rule.text.replace(/^avoid\s+/i, '').replace(/^./, (c) => c.toLowerCase())}`, item: it.title, where: it.where, reason: `${it.title} may contain ${subject.tag} (${rule.scope})` });
    }
    if (/\b(rest|recover|no (training|exercise|workout))\b/i.test(rule.text)) {
      const days = DAYS_RE.filter(([re]) => re.test(rule.text)).map(([, d]) => d);
      for (const it of items) if (it.kind === 'session' && it.day && days.includes(it.day)) out.push({ rule: rule.text, item: it.title, where: it.where, reason: `${it.title} is scheduled on a rest day` });
    }
  }
  return out.filter((c, i) => out.findIndex((x) => x.rule === c.rule && x.item === c.item && x.where === c.where) === i);
}

const ruleRows = (list: RuleList, scope: string) => [...list.dos.map((text) => ({ text, scope, isDont: false })), ...list.donts.map((text) => ({ text, scope, isDont: true }))];
const notesOf = (steps: CheckedStep[], where: (s: CheckedStep) => string): ReviewNote[] =>
  steps.flatMap((s) => (s.issues || []).filter((i) => i.code !== 'not_verb').map((i: RuleIssue) => ({ where: where(s), message: i.code === 'renamed' || i.code === 'vague' ? `${i.message} → “${s.title}”` : i.message })));
/** The hard gate: an action whose title still is not verb + noun after the checker's fixes cannot be saved. */
const blockingOf = (steps: CheckedStep[], where: (s: CheckedStep) => string): ReviewNote[] =>
  steps.filter((s) => !s.isParent && s.kind !== 'rule' && s.group !== 'sleep' && s.group !== 'meal' && (s.issues || []).some((i) => i.code === 'not_verb'))
    .map((s) => ({ where: where(s), message: `“${s.title}” must start with a verb (e.g. “Walk 20 minutes”)` }));

/** Exercises save with set info: sets × reps for strength, minutes for timed work; gaps are filled from the level. */
export function withSetInfo(cfg: FitnessConfig): { cfg: FitnessConfig; notes: ReviewNote[] } {
  const dose = LEVEL[cfg.level] || LEVEL.beginner;
  const notes: ReviewNote[] = [];
  const sessions = cfg.sessions.map((s) => ({ ...s, minutes: s.minutes || cfg.minutes || 30, exercises: s.exercises.map((e) => {
    if ((e.sets && e.reps) || e.minutes) return e;
    const timed = /cardio|sports|stretch|recovery|yoga|hiit/i.test(e.category || '');
    const fixed = timed ? { ...e, minutes: 10 } : { ...e, sets: e.sets || dose.sets, reps: e.reps || dose.reps, rest_seconds: e.rest_seconds ?? dose.rest };
    notes.push({ where: `${WEEK.find((w) => w.day === s.day)?.short} ${s.title}`, message: `${e.name}: set info added (${timed ? '10 min' : `${fixed.sets} × ${fixed.reps}`})` });
    return fixed;
  }) }));
  return { cfg: { ...cfg, sessions }, notes };
}

/** Every diet meal through the shared checker: dish name, a time, rule children; plus flagged contradictions. */
export function reviewDiet(cfg: DietConfig): Review {
  const slots = MEAL_SLOTS.filter((x) => cfg.slots.includes(x.id));
  const steps: CheckedStep[] = [];
  for (const { day } of WEEK) for (const slot of slots) {
    const pick = cfg.plan[`${day}:${slot.id}`];
    const t = mealTiming(cfg, slot.id);
    const rules = splitRules(cfg.mealRules?.[slot.id] || []);
    if (pick) steps.push({ key: `${day}:${slot.id}`, title: pick.name, group: 'meal', time: resolveTiming(t), notes: '', dos: rules.dos, donts: rules.donts, windowKey: String(day), link: { kind: 'food', query: pick.name } });
    mealDrinks(cfg,`${day}:${slot.id}`).forEach((drink,i) => steps.push({ key: `${day}:${slot.id}:drink:${i}`, title: typeof drink === 'string' ? drink : drink.name, group: 'meal', time: resolveTiming(t), notes: '', dos: [], donts: [], windowKey: String(day) }));
  }
  const checked = enforceProtocolRules(steps);
  const label = (s: CheckedStep) => { const [d, slot] = s.key.split(':'); return `${WEEK.find((w) => w.day === Number(d))?.short} ${MEAL_SLOTS.find((m) => m.id === slot)?.label}`; };
  const weekRules = splitRules(cfg.rules || []);
  const items = checked.map((s) => ({ title: s.title, where: label(s), day: Number(s.key.split(':')[0]), kind: 'meal' as const }));
  const conflicts = [
    ...WEEK.flatMap(({day}) => slots.flatMap(slot => {
      const key = `${day}:${slot.id}`;
      if (!mealIsFasting(cfg,day,slot.id)) return [];
      const meals = cfg.plan[key] ? [cfg.plan[key]!.name] : [];
      const drinks = mealDrinks(cfg,key).filter(d => !fastingDrinkAllowed(cfg,day,slot.id,d)).map(d => typeof d === 'string' ? d : d.name);
      return [...meals,...drinks].map(item => ({ rule:'Fasting window',item,where:`${WEEK.find(w=>w.day===day)?.short ?? `Day ${day}`} ${slot.label}`,reason:'Scheduled during a fasting period. Kept for review; move or remove it if required.' }));
    })),
    ...findConflicts(ruleRows(weekRules, 'week Meal checklist'), items),
    ...slots.flatMap((slot) => findConflicts(ruleRows(splitRules(cfg.mealRules?.[slot.id] || []), `${slot.label} checklist`), items.filter((i) => i.where.endsWith(slot.label)))),
  ];
  const placement = mealPlacementIssues(checked.map((x) => ({ display_name: x.title, category: 'consume', item_type: 'recipe', group_name: MEAL_SLOTS.find((m) => m.id === x.key.split(':')[1])?.label || null, scheduled_time: x.time })))
    .map((i) => ({ rule: 'Meal slots', item: i.item, where: 'Meal placement', reason: i.message }));
  return { steps: Object.fromEntries(checked.map((s) => [s.key, s])), notes: notesOf(checked, label),
    blocking: [...blockingOf(checked, label),
      ...(cfg.fasting && cfg.fasting.type !== 'none' && !cfg.fasting.fullDay && (!validClock(cfg.fasting.start) || !validClock(cfg.fasting.end) || cfg.fasting.start === cfg.fasting.end) ? [{where:'Fasting',message:'Choose valid, different start/end times or select a full-day fast.'}] : []),
      ...dietSupportItems(cfg).filter(i => !validClock(i.time)).map(i => ({where:i.title,message:'Choose a valid supplement/fasting time.'})),
      ...placement.map((p) => ({ where: p.item, message: `${p.reason}. Swap the meal or move it to its slot.` })),
      ...[...Object.values(cfg.plan), ...Object.values(cfg.drinkPlan || {}).flat()].filter((p): p is MealPick => !!p && typeof p !== 'string' && p.servings != null && (!Number.isFinite(p.servings) || p.servings <= 0)).map((p) => ({ where: p.name, message: 'Serving quantity must be a positive finite number.' }))], conflicts, weekRules };
}

/** Every fitness session through the shared checker: verb + noun title, a time, rule children; plus flagged contradictions. */
export function reviewFitness(input: FitnessConfig): Review {
  const { cfg, notes: setNotes } = withSetInfo(input);
  const steps: CheckedStep[] = cfg.sessions.map((s, i) => {
    const rules = splitRules(s.rules || []);
    const anchor = s.anchor === 'wake' ? 'wake' : s.anchor === 'bed' ? 'bedtime' : null;
    return { key: String(i), title: s.title, group: 'fitness', time: anchor ? null : s.time, anchor, offsetMinutes: anchor ? (s.offset || 0) : null, durationMinutes: s.minutes, notes: '', dos: rules.dos, donts: rules.donts, windowKey: String(s.day), link: s.exercises[0] ? { kind: 'activity', query: s.exercises[0].name } : null, isParent: s.exercises.length > 0 };
  });
  const checked = enforceProtocolRules(steps);
  const label = (s: CheckedStep) => { const session = cfg.sessions[Number(s.key)]; return `${WEEK.find((w) => w.day === session.day)?.short} ${session.title}`; };
  const weekRules = splitRules(cfg.rules || []);
  const items = cfg.sessions.flatMap((s) => [{ title: s.title, where: WEEK.find((w) => w.day === s.day)!.short, day: s.day, kind: 'session' as const }, ...s.exercises.map((e) => ({ title: e.name, where: `${WEEK.find((w) => w.day === s.day)!.short} ${s.title}`, day: s.day, kind: 'item' as const }))]);
  const conflicts = [
    ...findConflicts(ruleRows(weekRules, 'week Fitness checklist'), items),
    ...cfg.sessions.flatMap((s) => findConflicts(ruleRows(splitRules(s.rules || []), `${s.title} checklist`), items.filter((i) => i.day === s.day))),
  ];
  return { steps: Object.fromEntries(checked.map((s) => [s.key, s])), notes: [...notesOf(checked, label), ...setNotes], blocking: blockingOf(checked, label), conflicts, weekRules };
}

/** Combine review: the chosen protocols' top-level steps through the checker (notes only, nothing rewritten) plus rule-vs-item conflicts across protocols. */
export function reviewCombined(itemsByProtocol: { name: string; items: AdminProtocolItem[] }[]): { notes: ReviewNote[]; blocking: ReviewNote[]; conflicts: Conflict[]; fixes: Record<string, { title: string; time: string | null }> } {
  const groupOf = (it: AdminProtocolItem) => it.category === 'sleep' ? 'sleep' : it.category === 'consume' ? 'meal' : it.subtype === 'exercise' ? 'fitness' : it.category || 'do';
  const steps: CheckedStep[] = itemsByProtocol.flatMap(({ name, items }) => items.filter((it) => !it.parent_protocol_item_id && it.kind === 'action').map((it) => ({
    key: `${name}|${it.id}`, title: it.display_name || '', group: groupOf(it), time: it.scheduled_time?.slice(0, 5) || null, notes: '', dos: [], donts: [], windowKey: name,
    isParent: items.some((c) => c.parent_protocol_item_id === it.id && c.kind === 'action'),
  })));
  // Sleep is checked across the combined plan (one window) so duplicate wake/bed items show up.
  const checked = enforceProtocolRules(steps.map((s) => s.group === 'sleep' ? { ...s, windowKey: 'all' } : s));
  const notes = notesOf(checked, (s) => s.key.split('|')[0]);
  const rules = itemsByProtocol.flatMap(({ name, items }) => items.filter((it) => it.kind === 'rule_dont' || it.kind === 'rule_do').map((it) => ({ text: it.display_name || '', scope: name, isDont: it.kind === 'rule_dont' || isRuleTitle(it.display_name || '') })));
  const actions = itemsByProtocol.flatMap(({ name, items }) => items.filter((it) => it.kind === 'action').map((it) => ({ title: it.display_name || '', where: name, day: it.recurrence_days_of_week?.length === 1 ? (WEEK.find((w) => w.dow === it.recurrence_days_of_week![0])?.day) : undefined, kind: (it.subtype === 'exercise' && !it.parent_protocol_item_id ? 'session' : it.category === 'consume' ? 'meal' : 'item') as 'session' | 'meal' | 'item' })));
  const placement = itemsByProtocol.flatMap(({ name, items }) => mealPlacementIssues(items.filter((it) => !it.parent_protocol_item_id))
    .map((i) => ({ where: name, message: `${i.item}: ${i.message}${i.fix ? ' (moved on combine)' : ''}` })));
  const fixes = Object.fromEntries(checked.map((c) => [c.key.split('|')[1], { title: c.title, time: c.time }]));
  // Sources are existing Protocols: the shared verb list is closed ("Pay bills", "Reflect…" read as not verb-first), so a
  // missing verb is a note to fix in the editor here, not a block. Builder-authored titles stay hard-gated.
  const verbNotes = blockingOf(checked, (s) => s.key.split('|')[0]).map((b) => ({ ...b, message: `${b.message.replace(' must start', ' should start')} (check in the editor)` }));
  return { notes: [...placement, ...notes, ...verbNotes], blocking: [], conflicts: findConflicts(rules, actions), fixes };
}

/** Do's as checkable rule_do items: under a parent item (its do-checklist) or top-level in a group (that group's checklist). */
async function addRules(accessToken: string, protocolId: string, rules: string[] | RuleList | undefined, opts: { parentId?: string | null; group?: string | null; category: string; days?: number[]; next: () => number }) {
  const list: RuleList = Array.isArray(rules) ? splitRules(rules) : rules || { dos: [], donts: [] };
  const all = [...list.dos.map((t) => ['rule_do', t]), ...list.donts.map((t) => ['rule_dont', t])];
  for (const [kind, rule] of all) await createProtocolItem(accessToken, {
    protocol_id: protocolId, display_name: rule, kind, item_type: 'activity', category: opts.category, subtype: null,
    parent_protocol_item_id: opts.parentId || null, group_name: opts.parentId ? null : opts.group || null, scheduled_time: null, day_number: 1,
    sort_order: opts.next() , has_children: false, enabled: true, hidden: false, notes: '',
    ...(opts.days ? { recurrence_type: 'weekly', recurrence_days_of_week: opts.days, day_number: null } : { recurrence_type: 'daily' }),
  } as Partial<AdminProtocolItem>);
}

/** Week checklists as top-level rule rows, filed by the shared ruleGroupFor/ruleRowFields (Drinks, Consume, general) like the AI builder. */
async function addGroupRules(accessToken: string, protocolId: string, list: RuleList, fallback: string, next: () => number) {
  for (const [kind, text] of [...list.dos.map((t) => ['rule_do', t]), ...list.donts.map((t) => ['rule_dont', t])]) {
    const row = ruleRowFields(ruleGroupFor(text, fallback));
    await createProtocolItem(accessToken, {
      protocol_id: protocolId, display_name: text, kind, ...row, item_type: row.category === 'consume' ? 'consume' : 'activity', group_name: null,
      parent_protocol_item_id: null, scheduled_time: null, day_number: 1, sort_order: next(), has_children: false, enabled: true, hidden: false, notes: '', recurrence_type: 'daily',
    } as Partial<AdminProtocolItem>);
  }
}

function assertGate(review: Pick<Review, 'blocking'>) {
  if (review.blocking.length) throw new Error(`Fix before saving: ${review.blocking.map((b) => `${b.where}: ${b.message}`).join('; ')}`);
}

/** Run the item writes; on failure the error carries the protocol id so a retry updates the same protocol. */
async function withProtocol<T>(protocol: AdminProtocol, work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) { throw Object.assign(error as Error, { protocolId: protocol.id }); }
}

async function ensureProtocol(accessToken: string, ownerId: string, existingId: string | null, name: string, extra: Partial<AdminProtocol>) {
  if (existingId) return updateProtocol(accessToken, existingId, { name, ...extra });
  return createProtocol(accessToken, { user_id: ownerId, name, total_days: 7, ...extra });
}

export async function saveDietProtocol(accessToken: string, ownerId: string, existingId: string | null, name: string, cfg: DietConfig) {
  assertGate(reviewDiet(cfg)); // hard gate before anything is written
  const guideIds = [...new Set([...Object.values(cfg.plan), ...Object.values(cfg.drinkPlan || {}).flat()].filter((pick): pick is MealPick => !!pick && typeof pick !== 'string' && pick.source === 'guide').map((pick) => pick.id))];
  const guideCatalog = new Map(await Promise.all(guideIds.map(async (id) => [id, await ensureGuideRecipeCatalog(accessToken, id)] as const)));
  const framework = DIET_FRAMEWORKS.find((f) => f.id === cfg.framework) || DIET_FRAMEWORKS[0];
  const t = macroGrams(cfg);
  const protocol = await ensureProtocol(accessToken, ownerId, existingId, name, { category: 'Nutrition', description: `${framework.label} · ${t.energy_kcal} kcal/day · P ${t.protein_g} g · C ${t.carbohydrates_g} g · F ${t.fats_g} g` });
  return withProtocol(protocol, async () => {
  await clearItems(accessToken, protocol.id);
  const review = reviewDiet(cfg);
  let order = 0;
  // Slot item (Breakfast/Lunch/Dinner/Snack smart list) → meal + drinks as checkable children, rules under the slot.
  for (const plan of planMealItems(cfg)) {
    const days = weekly(plan.day);
    const slotItem = await createProtocolItem(accessToken, {
      protocol_id: protocol.id, display_name: plan.label, kind: 'action', item_type: 'recipe', category: 'consume', subtype: plan.label === 'Snack' ? 'snack' : 'meal',
      group_name: plan.label, scheduled_time: hhmmss(plan.time), day_number: 1, sort_order: order++, enabled: true, hidden: false, has_children: true,
      notes: plan.timingNote, ...days,
    } as Partial<AdminProtocolItem>);
    for (const child of plan.children) await createProtocolItem(accessToken, {
      protocol_id: protocol.id, parent_protocol_item_id: slotItem.id, display_name: child.title, kind: 'action',
      item_type: child.role === 'meal' ? 'recipe' : 'consume', category: 'consume', subtype: child.role === 'meal' ? (plan.label === 'Snack' ? 'snack' : 'meal') : 'drink',
      group_name: plan.label, scheduled_time: hhmmss(plan.time), day_number: 1, sort_order: order++, enabled: true, hidden: false, has_children: false,
      catalog_recipe_id: child.recipeId || guideCatalog.get(child.guideRecipeId || '') || null, amount: child.servings ?? null, amount_unit: child.servings ? 'serving' : null, media_image_url: child.image, notes: child.notes, ...days,
    } as Partial<AdminProtocolItem>);
    await addRules(accessToken, protocol.id, { dos: plan.dos, donts: plan.donts }, { parentId: slotItem.id, category: 'consume', days: days.recurrence_days_of_week, next: () => order++ });
  }
  for (const item of dietSupportItems(cfg)) await createProtocolItem(accessToken, {
    protocol_id: protocol.id, display_name: item.title, kind: 'action', item_type: item.itemType, category: item.category,
    subtype: item.category === 'supplement' ? 'supplement' : 'wellness', group_name: item.group, scheduled_time: hhmmss(item.time),
    day_number: item.days ? null : 1, sort_order: order++, enabled: true, hidden: false, has_children: false, notes: item.notes,
    ...item.link,
    ...(item.days ? { recurrence_type: 'weekly', recurrence_days_of_week: item.days } : { recurrence_type: 'daily' }),
  } as Partial<AdminProtocolItem>);
  await addGroupRules(accessToken, protocol.id, review.weekRules, 'meal', () => order++);
  const saved = await saveBuilderMeta(accessToken, protocol.id, { builder_kind: 'diet', builder_config: cfg });
  await syncProtocolChild(accessToken, protocol.id);
  return { protocol, metaSaved: saved };
  });
}

export async function saveFitnessProtocol(accessToken: string, ownerId: string, existingId: string | null, name: string, cfg: FitnessConfig) {
  assertGate(reviewFitness(cfg)); // hard gate before anything is written
  const goal = FITNESS_GOALS.find((g) => g.id === cfg.goal) || FITNESS_GOALS[0];
  const protocol = await ensureProtocol(accessToken, ownerId, existingId, name, { category: 'Fitness', description: `${goal.label} · ${cfg.level} · ${cfg.sessions.length} sessions/week` });
  return withProtocol(protocol, async () => {
  await clearItems(accessToken, protocol.id);
  const review = reviewFitness(cfg);
  cfg = withSetInfo(cfg).cfg;
  let order = 0;
  for (const [index, s] of cfg.sessions.map((x, i) => [i, x] as const).sort((a, b) => a[1].day - b[1].day)) {
    const step = review.steps[String(index)];
    const parent = await createProtocolItem(accessToken, {
      protocol_id: protocol.id, display_name: step?.title || s.title, kind: 'action', item_type: 'activity', category: 'do', subtype: 'exercise',
      scheduled_time: hhmmss(step?.time || resolveTiming(sessionTiming(s))), duration_minutes: s.minutes, intensity: s.intensity, day_number: 1, sort_order: order++,
      catalog_activity_id: (s.exercises.find((e) => !e.role) || s.exercises[0])?.id || null, media_image_url: (s.exercises.find((e) => !e.role) || s.exercises[0])?.image || null,
      has_children: s.exercises.length > 0 || !!(step?.dos.length || step?.donts.length), enabled: true, hidden: false,
      notes: [s.anchor && s.anchor !== 'clock' ? describeTiming(sessionTiming(s)) : '', s.exercises.map((e) => e.name).join(' · ')].filter(Boolean).join(' · '), ...weekly(s.day),
    } as Partial<AdminProtocolItem>);
    // Exercises are saved in the order they are done: warm-up stretches, the training grouped by muscle (Legs, Glutes,
    // Chest…), then recovery, like a smart list inside the session.
    for (const e of orderedExercises(s.exercises)) await createProtocolItem(accessToken, {
      protocol_id: protocol.id, parent_protocol_item_id: parent.id, display_name: e.name, kind: 'action', item_type: 'activity', category: 'do', subtype: 'exercise', group_name: exerciseGroup(e),
      catalog_activity_id: e.id, sets: e.sets, reps: e.reps ? parseInt(e.reps, 10) || null : null, reps_display: e.reps, rest_seconds: e.rest_seconds,
      duration_minutes: e.minutes, day_number: 1, sort_order: order++, has_children: false, enabled: true, hidden: false, notes: '', ...weekly(s.day),
    } as Partial<AdminProtocolItem>);
    await addRules(accessToken, protocol.id, step ? { dos: step.dos, donts: step.donts } : s.rules, { parentId: parent.id, category: 'do', days: weekly(s.day).recurrence_days_of_week, next: () => order++ });
  }
  // Training fuel: one timed item per food/supplement before or after each session, linked to the catalog like Diet supplements.
  for (const slot of trainingFuel(cfg)) for (const pick of slot.items) await createProtocolItem(accessToken, {
    protocol_id: protocol.id, display_name: actionTitle(fuelName(pick), 'Take'), kind: 'action', item_type: 'supplement', category: 'supplement', subtype: 'supplement',
    group_name: 'Training fuel', scheduled_time: hhmmss(slot.time), day_number: null, sort_order: order++, enabled: true, hidden: false, has_children: false,
    notes: `${slot.when === 'pre' ? 'Before' : 'After'} ${slot.session}`,
    ...(typeof pick === 'string' ? {} : { [pick.source === 'product' ? 'catalog_product_id' : 'supplement_id']: pick.id, media_image_url: pick.image }),
    ...weekly(slot.day),
  } as Partial<AdminProtocolItem>);
  await addGroupRules(accessToken, protocol.id, review.weekRules, 'fitness', () => order++);
  const saved = await saveBuilderMeta(accessToken, protocol.id, { builder_kind: 'fitness', builder_config: cfg });
  await syncProtocolChild(accessToken, protocol.id);
  return { protocol, metaSaved: saved };
  });
}

/* ── combine ── */
export interface Clash { day: string; time: string; names: string[] }

/** Items that start at the same time on the same weekday across the chosen protocols. */
export function findClashes(itemsByProtocol: AdminProtocolItem[][]): Clash[] {
  const slots = new Map<string, string[]>();
  for (const items of itemsByProtocol) for (const it of items) {
    if (it.parent_protocol_item_id || !it.scheduled_time) continue;
    const days = it.recurrence_type === 'weekly' && it.recurrence_days_of_week?.length ? it.recurrence_days_of_week : [0, 1, 2, 3, 4, 5, 6];
    for (const d of days) {
      const key = `${d}|${it.scheduled_time.slice(0, 5)}`;
      slots.set(key, [...(slots.get(key) || []), it.display_name || 'Step']);
    }
  }
  return [...slots.entries()].filter(([, names]) => names.length > 1)
    .map(([key, names]) => { const [d, time] = key.split('|'); return { day: WEEK.find((w) => w.dow === Number(d))!.short, time, names }; })
    .sort((a, b) => WEEK.findIndex((w) => w.short === a.day) - WEEK.findIndex((w) => w.short === b.day) || a.time.localeCompare(b.time));
}

const COPY_SKIP = new Set(['id', 'protocol_id', 'parent_protocol_item_id', 'created_at', 'updated_at']);

/** One personal Protocol that holds a copy of every chosen protocol's steps (children keep their parent). */
export async function combineProtocols(accessToken: string, ownerId: string, person: { name: string; lead_id?: string | null }, sources: AdminProtocol[]) {
  const builderMeta = await listBuilderMeta(accessToken, ownerId);
  // Hard gate: the combined steps pass the shared checker (fixes applied below) or nothing is created.
  const sourceItems = await Promise.all(sources.map(async (s) => ({ name: s.name, items: await listProtocolItems(accessToken, s.id) })));
  const gate = reviewCombined(sourceItems);
  if (gate.blocking.length) throw new Error(`Fix before combining: ${gate.blocking.map((b) => `${b.where}: ${b.message}`).join('; ')}`);
  const protocol = await createProtocol(accessToken, {
    user_id: ownerId, name: `${person.name} · Personal Protocol`, category: 'Health', total_days: Math.max(7, ...sources.map((s) => s.total_days || 7)),
    description: `Combined from ${sources.map((s) => s.name).join(' + ')}`,
  });
  let order = 0;
  // One sleep pair: the first protocol's Start/End sleep wins; later ones (and their rules) are skipped.
  const sleepRole = (it: AdminProtocolItem) => it.parent_protocol_item_id || it.kind !== 'action' ? null
    : isWakeName(it.display_name || '') ? 'wake' : (it.category === 'sleep' || isBedName(it.display_name || '')) ? 'bed' : null;
  const haveSleep = new Set<string>();
  for (const source of sources) {
    const kind = builderMeta[source.id]?.builder_kind;
    if (kind === 'diet' || kind === 'fitness') {
      await cloneProtocolChild(accessToken, protocol.id, source.id);
      order = (await listProtocolItems(accessToken, protocol.id)).reduce((n, item) => Math.max(n, (item.sort_order || 0) + 1), order);
      continue;
    }
    const items = sourceItems[sources.indexOf(source)].items;
    const idMap = new Map<string, string>();
    const skipped = new Set<string>();
    const parentsFirst = [...items].sort((a, b) => Number(!!a.parent_protocol_item_id) - Number(!!b.parent_protocol_item_id));
    const sourceRoles = new Set(items.map(sleepRole).filter(Boolean) as string[]);
    for (const it of parentsFirst) {
      const role = sleepRole(it);
      if (role && haveSleep.has(role)) { skipped.add(it.id); continue; }
      if (it.parent_protocol_item_id && skipped.has(it.parent_protocol_item_id)) { skipped.add(it.id); continue; }
      const copy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(it)) if (!COPY_SKIP.has(k)) copy[k] = v;
      const created = await createProtocolItem(accessToken, {
        ...copy, protocol_id: protocol.id,
        ...(gate.fixes[it.id] ? { display_name: gate.fixes[it.id].title, ...(gate.fixes[it.id].time ? { scheduled_time: hhmmss(gate.fixes[it.id].time!) } : {}) } : {}), // shared checker fixes
        ...(role ? { display_name: role === 'wake' ? END_SLEEP : START_SLEEP } : {}), // shared sleep names
        ...(!it.parent_protocol_item_id ? mealPlacementIssues([it]).find((x) => x.fix)?.fix || {} : {}), // meals into their consume slot
        parent_protocol_item_id: it.parent_protocol_item_id ? idMap.get(it.parent_protocol_item_id) || null : null,
        sort_order: order++, // unique per protocol (idx_protocol_items_no_dupes includes sort_order)
      } as Partial<AdminProtocolItem>);
      idMap.set(it.id, created.id);
    }
    sourceRoles.forEach((role) => haveSleep.add(role));
  }
  const sleepItem = (name: string, time: string) => createProtocolItem(accessToken, {
    protocol_id: protocol.id, display_name: name, kind: 'action', item_type: 'activity', category: 'sleep', subtype: 'sleep', scheduled_time: hhmmss(time),
    day_number: 1, sort_order: order++, has_children: false, enabled: true, hidden: false, notes: '', recurrence_type: 'daily',
  } as Partial<AdminProtocolItem>);
  if (!haveSleep.has('wake')) await sleepItem(END_SLEEP, DEFAULT_WAKE);
  if (!haveSleep.has('bed')) await sleepItem(START_SLEEP, DEFAULT_BED);
  const metaSaved = await saveBuilderMeta(accessToken, protocol.id, { builder_kind: 'personal', builder_config: { person }, source_protocol_ids: sources.map((s) => s.id) });
  return { protocol, metaSaved };
}

/** The builder settings of the owner's protocols (empty when the columns are not on this database yet). */
export async function listBuilderMeta(accessToken: string, ownerId: string): Promise<Record<string, { builder_kind: BuilderKind | null; builder_config: any; source_protocol_ids?: string[] }>> {
  const res = await fetch(`${rest()}/protocols?user_id=eq.${ownerId}&builder_kind=not.is.null&select=id,builder_kind,builder_config,source_protocol_ids`, { headers: headers(accessToken) });
  if (!res.ok) return {};
  return Object.fromEntries(((await res.json()) as any[]).map((r) => [r.id, { builder_kind: r.builder_kind, builder_config: r.builder_config, source_protocol_ids: r.source_protocol_ids }]));
}

/* ── cooking methods and kitchen equipment (Diet section) ── */
export interface CookingMethod { id: string; name: string; category: string | null; description: string | null; temperature: string | null; medium: string | null; typicalTime: string | null; nutrientEffect: string | null; bestFor: string | null; image: string | null; equipmentIds: string[] }
export interface KitchenEquipment { id: string; name: string; category: string | null; description: string | null; image: string | null; useCase: string | null; material: string | null; methodsUsedWith: string[] }
/** Equipment categories that belong in a kitchen (the table also holds gym kit). */
export const KITCHEN_EQUIPMENT_CATEGORIES = ['Cookware', 'Appliances', 'Prep', 'Utensils', 'Cutting', 'Baking', 'Measuring'];
const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
/** nutrient_effect is plain text or a JSON record of hazards formed / nutrients affected; show it as a sentence. */
export function nutrientEffectText(v: unknown): string | null {
  const raw = txt(v); if (!raw) return null;
  if (!raw.startsWith('{')) return raw;
  try {
    const j = JSON.parse(raw) as { elements_hazardous?: Array<{ name?: string; likelihood?: string }>; elements_beneficial?: Array<{ name?: string; effect?: string }> };
    const list = (xs?: Array<{ name?: string; likelihood?: string; effect?: string }>) => (xs || []).filter((x) => x.name).map((x) => `${x.name!.toLowerCase()}${x.likelihood || x.effect ? ` (${x.likelihood || x.effect})` : ''}`).join(', ');
    const parts = [list(j.elements_hazardous) && `Can form: ${list(j.elements_hazardous)}`, list(j.elements_beneficial) && `Can raise: ${list(j.elements_beneficial)}`].filter(Boolean);
    return parts.length ? parts.join('. ') : null;
  } catch { return null; }
}
export async function listCookingMethods(accessToken: string): Promise<CookingMethod[]> {
  const res = await fetch(`${rest()}/catalog_cooking_methods?select=id,name,category,description,temperature,medium,typical_time,nutrient_effect,best_for,image_url,equipment_ids&order=name`, { headers: headers(accessToken) });
  if (!res.ok) throw new Error(`Could not load cooking techniques (${res.status})`);
  return ((await res.json()) as any[]).map((r) => ({ id: r.id, name: r.name, category: txt(r.category), description: txt(r.description), temperature: txt(r.temperature), medium: txt(r.medium), typicalTime: txt(r.typical_time), nutrientEffect: nutrientEffectText(r.nutrient_effect), bestFor: txt(r.best_for), image: txt(r.image_url), equipmentIds: arr(r.equipment_ids) }));
}
export async function listKitchenEquipment(accessToken: string): Promise<KitchenEquipment[]> {
  const cats = KITCHEN_EQUIPMENT_CATEGORIES.map((c) => `"${c}"`).join(',');
  const res = await fetch(`${rest()}/catalog_equipment?select=id,name,category,description,image_url,use_case,material,cooking_methods_used_with&category=in.(${cats})&order=name`, { headers: headers(accessToken) });
  if (!res.ok) throw new Error(`Could not load cooking equipment (${res.status})`);
  return ((await res.json()) as any[]).map((r) => ({ id: r.id, name: r.name, category: txt(r.category), description: txt(r.description), image: txt(r.image_url), useCase: txt(r.use_case), material: txt(r.material), methodsUsedWith: arr(r.cooking_methods_used_with) }));
}

/* ── catalogue browsing: ROUTINE³ recipes, ingredients, fitness routines ── */
export interface CatalogHazard { key: string; level: string }
export interface CatalogFood { form?: 'raw' | 'processed' | null; processing?: string | null; id: string; name: string; image: string | null; category: string | null; description: string | null; healthScore: number | null; per100: Record<string, number>; hazards: CatalogHazard[]; meta: Array<[string, string | null]>; diets: string[] }
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** Flat numeric keys of a nutrition_per_100g record (provenance keys starting with "_" are skipped). */
export function per100Of(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => !k.startsWith('_') && num(x) !== null) as Array<[string, number]>);
}
/** elements_hazardous is keyed by hazard ({ lead: { level } }); highest level first. */
export function hazardsOf(v: unknown): CatalogHazard[] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  const rank: Record<string, number> = { high: 0, moderate: 1, medium: 1, low: 2, trace: 3 };
  return Object.entries(v as Record<string, any>).map(([key, x]) => ({ key, level: String(x?.level || 'trace') })).sort((a, b) => (rank[a.level] ?? 4) - (rank[b.level] ?? 4) || a.key.localeCompare(b.key));
}
const DIET_FLAGS: Array<[string, string]> = [['vegan', 'Vegan'], ['vegetarian', 'Vegetarian'], ['pescatarian', 'Pescatarian'], ['keto', 'Keto'], ['low_carb', 'Low-carb'], ['gluten_free', 'Gluten-free'], ['dairy_free', 'Dairy-free'], ['nut_free', 'Nut-free'], ['egg_free', 'Egg-free']];
export const RECIPE_DIETS = DIET_FLAGS;
const dietsOf = (d: unknown) => (d && typeof d === 'object' ? DIET_FLAGS.filter(([k]) => (d as any)[k] === true).map(([, l]) => l) : []);
const q = (s: string) => encodeURIComponent(s.replace(/[%,()*]/g, ' ').trim());

/**
 * The diet a Protocol's own rules and description ask for, to pick meals that follow it: a dietary_info flag
 * (vegan, keto…) and name words to leave out ("no added sugar" → no cakes or cookies, "no fried" → no fries).
 */
export function protocolDiet(rules: string[], description = ''): { diet: string | null; avoid: RegExp | null } {
  const t = `${rules.join(' · ')} · ${description}`.toLowerCase();
  const diet = /\bvegan\b|plant foods only|whole plant foods|no meat, fish, dairy or eggs/.test(t) ? 'vegan'
    : /\bvegetarian\b|no meat\b/.test(t) ? 'vegetarian'
    : /\bketo|ketogenic/.test(t) ? 'keto'
    : /low[- ]carb/.test(t) ? 'low_carb'
    : /gluten[- ]free|no gluten/.test(t) ? 'gluten_free'
    : /dairy[- ]free|no dairy/.test(t) ? 'dairy_free' : null;
  const words: string[] = [];
  if (/no (added )?sugar|no sweet|sugar[- ]free|low sugar/.test(t)) words.push('cake', 'cookie', 'donut', 'doughnut', 'brownie', 'muffin', 'candy', 'chocolate', 'syrup', 'pancake', 'sundae', 'ice cream', 'milkshake', 'pie');
  if (/no (deep[- ])?fried|no processed|ultra-processed|whole foods?/.test(t)) words.push('fried', 'fries', 'nugget', 'burger', 'pizza', 'hot dog', 'crisps', 'chips');
  if (/no alcohol/.test(t)) words.push('wine', 'beer', 'cocktail');
  if (/yeast|leavened/.test(t)) words.push('bread', 'bun', 'bagel', 'toast', 'sandwich', 'pizza');
  return { diet, avoid: words.length ? new RegExp(`\\b(${words.join('|')})`, 'i') : null };
}
/** A meal step's slot for recipe suggestions, from its title, group or time. */
export function mealSlotOf(name: string, group: string | null, time: string | null): 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | null {
  const t = `${name} ${group || ''}`;
  if (/breakfast/i.test(t)) return 'Breakfast';
  if (/lunch/i.test(t)) return 'Lunch';
  if (/dinner|supper/i.test(t)) return 'Dinner';
  if (/snack/i.test(t)) return 'Snack';
  const m = /^(\d\d):/.exec(time || ''); if (!m) return null;
  const h = +m[1]; return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 17 ? 'Snack' : 'Dinner';
}
export async function browseRecipes(accessToken: string, f: { ids?: string[]; offset?: number; query?: string; cuisine?: string; meal?: string; diet?: string; limit?: number }): Promise<CatalogFood[]> {
  const p = ['select=id,name_common,image_primary_url,image_url,meal_slot,cuisine,description_simple,description,health_score,prep_time,cook_time,servings,nutrition_per_100g,elements_hazardous,dietary_info', 'is_published=is.true', 'order=health_score.desc.nullslast,name_common.asc,id.asc', `limit=${f.limit || 60}`, `offset=${f.offset || 0}`];
  if (f.ids?.length) p.push(`id=in.(${f.ids.map((i) => `"${i.replace(/"/g, '')}"`).join(',')})`);
  if (f.query?.trim()) p.push(`name_common=ilike.*${q(f.query)}*`);
  if (f.cuisine) p.push(`cuisine=eq.${encodeURIComponent(f.cuisine)}`);
  if (f.meal) p.push(`meal_slot=ilike.${encodeURIComponent(f.meal)}`);
  if (f.diet) p.push(`dietary_info->>${f.diet}=eq.true`);
  const res = await fetch(`${rest()}/catalog_recipes?${p.join('&')}`, { headers: headers(accessToken) });
  if (!res.ok) throw new Error(`Could not load recipes (${res.status})`);
  return ((await res.json()) as any[]).map((r) => ({ id: r.id, name: r.name_common, image: r.image_primary_url || r.image_url || null, category: r.meal_slot || null, description: txt(r.description_simple) || txt(r.description), healthScore: num(r.health_score), per100: per100Of(r.nutrition_per_100g), hazards: hazardsOf(r.elements_hazardous), diets: dietsOf(r.dietary_info),
    meta: [['Cuisine', txt(r.cuisine)], ['Meal', txt(r.meal_slot)], ['Prep', r.prep_time ? `${r.prep_time} min` : null], ['Cook', r.cook_time ? `${r.cook_time} min` : null], ['Serves', r.servings ? String(r.servings) : null]] }));
}
export async function recipeIngredientNames(accessToken: string, recipeId: string): Promise<Array<{ name: string; grams: number | null }>> {
  const res = await fetch(`${rest()}/catalog_recipe_ingredients?select=ingredient_name,amount_g,sort_order&recipe_id=eq.${recipeId}&order=sort_order.asc.nullslast`, { headers: headers(accessToken) });
  if (!res.ok) return [];
  return ((await res.json()) as any[]).map((r) => ({ name: String(r.ingredient_name || ''), grams: num(r.amount_g) })).filter((r) => r.name);
}
/** Whole/raw or processed, and how: from the name and sub-category (juice, powder, oil…), else processed-by-nature categories. */
const PROCESS_WORDS: Array<[RegExp, string]> = [[/\bjuice\b/i, 'Juice'], [/\bpowder(ed)?\b/i, 'Powder'], [/\boil\b/i, 'Oil'], [/\bflour\b/i, 'Flour'], [/\b(dried|dehydrated)\b/i, 'Dried'], [/\b(ground|milled)\b/i, 'Ground'], [/\b(extract|concentrate)\b/i, 'Extract'], [/\b(paste|puree|purée)(?![\p{L}\d_])/iu, 'Paste'], [/\b(bread|pasta|noodles?|crackers?|biscuits?|cakes?|cereal|granola|tortillas?|bagels?|muffins?|pastry|wafers?)\b/i, 'Baked'], [/\b(canned|tinned)\b/i, 'Canned'], [/\bsmoked\b/i, 'Smoked'], [/\b(cured)\b/i, 'Cured'], [/\bpickled\b/i, 'Pickled'], [/\bfermented\b/i, 'Fermented'], [/\b(cooked|boiled|roasted|fried)\b/i, 'Cooked'], [/\bfrozen\b/i, 'Frozen'], [/\b(refined|processed)\b/i, 'Refined']];
const PROCESSED_CATEGORIES: Record<string, string> = { 'Additives': 'Additive', 'Oils & fats': 'Oil', 'Condiments & sauces': 'Condiment', 'Sweeteners': 'Sweetener', 'Confectionery & snacks': 'Snack', 'Prepared foods': 'Prepared', 'Supplements & other': 'Supplement' };
/** Categories whose items are whole foods unless their name says otherwise. */
const WHOLE_CATEGORIES = new Set(['Vegetables', 'Fruit', 'Meat', 'Fish & seafood', 'Legumes, nuts & seeds', 'Herbs & spices', 'Dairy & eggs']);
/** form null = not known: neither filter shows it as raw or processed. */
export function ingredientForm(name: string, sub: string | null, category: string | null): { form: 'raw' | 'processed' | null; processing: string | null } {
  const text = `${name} ${sub || ''}`;
  if (/\b(raw|fresh)\b/i.test(text) && !PROCESS_WORDS.some(([re]) => re.test(text))) return { form: 'raw', processing: null };
  const hit = PROCESS_WORDS.find(([re]) => re.test(text));
  if (hit) return { form: 'processed', processing: hit[1] };
  if (category && PROCESSED_CATEGORIES[category]) return { form: 'processed', processing: PROCESSED_CATEGORIES[category] };
  if (category && WHOLE_CATEGORIES.has(category)) return { form: 'raw', processing: null };
  return { form: null, processing: null };
}
export async function browseIngredients(accessToken: string, f: { offset?: number; query?: string; category?: string; limit?: number }): Promise<CatalogFood[]> {
  const p = ['select=id,name_common,image_primary_url,image_url,category,category_sub,description_simple,description,health_score,nutrition_per_100g,elements_hazardous,season,origin_region', 'is_published=is.true', 'is_group=not.is.true', 'order=health_score.desc.nullslast,name_common.asc,id.asc', `limit=${f.limit || 60}`, `offset=${f.offset || 0}`];
  if (f.query?.trim()) p.push(`name_common=ilike.*${q(f.query)}*`);
  if (f.category) p.push(`category=eq.${encodeURIComponent(f.category)}`);
  const res = await fetch(`${rest()}/catalog_ingredients?${p.join('&')}`, { headers: headers(accessToken) });
  if (!res.ok) throw new Error(`Could not load ingredients (${res.status})`);
  return ((await res.json()) as any[]).map((r) => ({ ...ingredientForm(String(r.name_common || ''), txt(r.category_sub), r.category || null), id: r.id, name: r.name_common, image: r.image_primary_url || r.image_url || null, category: r.category || null, description: txt(r.description_simple) || txt(r.description), healthScore: num(r.health_score), per100: per100Of(r.nutrition_per_100g), hazards: hazardsOf(r.elements_hazardous), diets: [],
    meta: [['Type', txt(r.category_sub)], ['Season', Array.isArray(r.season) ? r.season.join(', ') : txt(r.season)], ['Origin', Array.isArray(r.origin_region) ? r.origin_region.join(', ') : txt(r.origin_region)]] }));
}

export interface FitnessRoutine { id: string; name: string; description: string | null; image: string | null; category: string | null; tags: string[]; totalDays?: number | null }
/**
 * What span a routine covers, for its card tag: a part of the day (Morning, Midday, Evening, Night), a whole Day,
 * or a Week / N weeks / Month / N days programme. From total_days, then the name, description and tags.
 */
/** Names and images of the catalogue activities / recipes a routine's steps link to, keyed "a:<id>" / "r:<id>". */
export async function stepMedia(accessToken: string, kind: 'activity' | 'recipe', ids: string[]): Promise<Record<string, { name: string; image: string | null }>> {
  const out: Record<string, { name: string; image: string | null }> = {};
  const clean = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < clean.length; i += 60) {
    const list = clean.slice(i, i + 60).map((x) => `"${x.replace(/"/g, '')}"`).join(',');
    const sel = kind === 'activity' ? 'id,name,image_url,primary_image_url' : 'id,name_common,image_primary_url,image_url';
    const res = await fetch(`${rest()}/${kind === 'activity' ? 'catalog_activities' : 'catalog_recipes'}?select=${sel}&id=in.(${encodeURIComponent(list)})`, { headers: headers(accessToken) }).catch(() => null);
    if (!res?.ok) continue;
    for (const r of (await res.json()) as any[]) out[`${kind === 'activity' ? 'a' : 'r'}:${r.id}`] = { name: String(r.name || r.name_common || ''), image: (kind === 'activity' ? r.image_url || r.primary_image_url : r.image_primary_url || r.image_url) || null };
  }
  return out;
}
/** The signed-in Guardian's own saved diet plans (Diet planner → Protocols), newest first. */
export async function listMyDietPlans(accessToken: string): Promise<FitnessRoutine[]> {
  let uid = '';
  try { uid = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || ''; } catch { return []; }
  if (!uid) return [];
  const res = await fetch(`${rest()}/protocols?select=id,name,description,image_url,category,tags,total_days&user_id=eq.${uid}&builder_kind=eq.diet&order=updated_at.desc.nullslast`, { headers: headers(accessToken) });
  if (!res.ok) return [];
  return ((await res.json()) as any[]).map((r) => ({ id: r.id, name: r.name, description: txt(r.description), image: txt(r.image_url), category: r.category || 'Diet', tags: Array.isArray(r.tags) ? r.tags.map(String) : [], totalDays: num(r.total_days) }));
}
export function routinePeriod(r: Pick<FitnessRoutine, 'name' | 'description' | 'tags' | 'totalDays'>): string {
  const name = r.name || '', all = `${name} ${(r.tags || []).join(' ')} ${r.description || ''}`;
  if (/\b(morning|am routine|wake|sunrise)\b/i.test(name)) return 'Morning';
  if (/\b(midday|lunch|afternoon)\b/i.test(name)) return 'Midday';
  if (/\b(evening|pm routine|wind[- ]down)\b/i.test(name)) return 'Evening';
  if (/\b(night|bedtime|sleep)\b/i.test(name) && !/\bprotocol\b/i.test(name)) return 'Night';
  const n = r.totalDays && r.totalDays > 1 ? r.totalDays : null;
  const span = (days: number) => (days % 30 === 0 || days === 28 || days === 31 ? (days <= 31 ? 'Month' : `${Math.round(days / 30)} months`) : days % 7 === 0 ? (days === 7 ? 'Week' : `${days / 7} weeks`) : `${days} days`);
  const m = /(\d+)[- ](day|week|month)s?\b/i.exec(all);
  if (m) { const k = +m[1], u = m[2].toLowerCase(); return u === 'month' ? (k === 1 ? 'Month' : `${k} months`) : u === 'week' ? (k === 1 ? 'Week' : `${k} weeks`) : k === 1 ? 'Day' : span(k); }
  if (n) return span(n);
  if (/\b(weekly|week)\b/i.test(name)) return 'Week';
  if (/\b(monthly|month)\b/i.test(name)) return 'Month';
  return 'Day';
}
/** The app's published fitness routines: catalogue Protocols in fitness categories. */
export async function listFitnessRoutines(accessToken: string, categories: string[] = ['fitness', 'strength', 'recovery', 'mobility', 'cardio', 'hiit'], nameTerms: string[] = []): Promise<FitnessRoutine[]> {
  // Catalogue categories are not consistently cased ("Beauty", "wellness"), so match case-insensitively; a section may also match by name at the start of a word ("fast" finds Fasting, not Breakfast).
  const or = [...categories.map((c) => `category.ilike.${encodeURIComponent(c)}`), ...nameTerms.map((t) => `name.imatch.%5Cm${encodeURIComponent(t.replace(/[^\w ]/g, ''))}`)].join(',');
  const res = await fetch(`${rest()}/protocols?select=id,name,description,image_url,category,tags,total_days&user_id=is.null&is_public=not.is.false&is_active=not.is.false&or=(${or})&order=name`, { headers: headers(accessToken) });
  if (!res.ok) throw new Error(`Could not load fitness routines (${res.status})`);
  return ((await res.json()) as any[]).map((r) => ({ id: r.id, name: r.name, description: txt(r.description), image: txt(r.image_url), category: r.category, tags: Array.isArray(r.tags) ? r.tags.map(String) : [], totalDays: num(r.total_days) }));
}
export interface RoutineStep { id?: string; parentId?: string | null; recipeId?: string | null; activityId?: string | null; dows?: number[] | null; name: string; time: string | null; group: string | null; day: number | null; kind: string | null; itemType: string | null; scope: string | null; recurrenceType?: string | null; category: string | null; subtype: string | null; minutes: number | null; sets: number | null; reps: number | null; weight: string | null }
export async function routineSteps(accessToken: string, protocolId: string): Promise<RoutineStep[]> {
  const res = await fetch(`${rest()}/protocol_items?select=id,parent_protocol_item_id,catalog_recipe_id,catalog_activity_id,display_name,scheduled_time,group_name,day_number,sort_order,kind,item_type,scope,recurrence_type,recurrence_days_of_week,category,subtype,duration_minutes,sets,reps,weight_display,hidden&hidden=not.is.true&protocol_id=eq.${protocolId}&order=day_number.asc.nullsfirst,scheduled_time.asc.nullslast,sort_order.asc&limit=200`, { headers: headers(accessToken) });
  if (!res.ok) return [];
  return ((await res.json()) as any[]).map((r) => ({ id: String(r.id), parentId: r.parent_protocol_item_id || null, recipeId: r.catalog_recipe_id || null, activityId: r.catalog_activity_id || null, name: String(r.display_name || ''), time: r.scheduled_time ? String(r.scheduled_time).slice(0, 5) : null, group: r.group_name || null, day: num(r.day_number), kind: r.kind || null, itemType: r.item_type || null, scope: r.scope || null, recurrenceType: r.recurrence_type || null, dows: Array.isArray(r.recurrence_days_of_week) ? r.recurrence_days_of_week.map(Number) : null, category: r.category || null, subtype: r.subtype || null, minutes: num(r.duration_minutes), sets: num(r.sets), reps: num(r.reps), weight: txt(r.weight_display) })).filter((r) => r.name);
}
