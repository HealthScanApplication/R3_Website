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
  location?: import('./plannerSunrise').PlannerLocation;
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
export interface ActivityPick { id: string; name: string; image: string | null; category: string | null; minutes: number | null; bodyParts?: string[] }

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
export interface ExercisePick extends ActivityPick { sets: number | null; reps: string | null; rest_seconds: number | null }
export interface FitnessSession { day: number; time: string; anchor?: Anchor; offset?: number; rules?: string[]; title: string; minutes: number; intensity: 'low' | 'moderate' | 'high'; exercises: ExercisePick[] }
export interface FitnessConfig { goal: string; level: 'beginner' | 'intermediate' | 'advanced'; minutes: number; sessions: FitnessSession[]; rules?: string[] }
export const sessionTiming = (s: FitnessSession): Timing => ({ anchor: s.anchor || 'clock', time: s.time, offset: s.offset || 0 });

type Template = { title: string; categories: string[]; terms: string[]; muscles?: MuscleGroupId[]; intensity: FitnessSession['intensity'] };
export interface FitnessGoal { id: string; label: string; note: string; days: number[]; pattern: Template[] }

const STRENGTH_UPPER: Template = { title: 'Upper body day', categories: ['Strength', 'Gym', 'Calisthenics'], terms: [], muscles: ['chest', 'back', 'shoulders', 'arms', 'back'], intensity: 'moderate' };
const STRENGTH_LOWER: Template = { title: 'Leg day', categories: ['Strength', 'Gym', 'Calisthenics'], terms: [], muscles: ['legs', 'glutes', 'legs', 'core', 'glutes'], intensity: 'moderate' };
const FULL_BODY: Template = { title: 'Full body day', categories: ['Strength', 'Gym', 'Calisthenics'], terms: [], muscles: ['legs', 'chest', 'back', 'core', 'shoulders'], intensity: 'moderate' };
const CARDIO: Template = { title: 'Cardio day', categories: ['Cardio', 'Sports'], terms: ['walk', 'run', 'cycl', 'swim'], intensity: 'moderate' };
const HIIT: Template = { title: 'Intervals day', categories: ['Hiit', 'Cardio', 'Calisthenics'], terms: ['burpee', 'climber', 'jump', 'sprint'], intensity: 'high' };
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

const LEVEL = { beginner: { sets: 2, reps: '10', rest: 90, exercises: 3 }, intermediate: { sets: 3, reps: '8–12', rest: 75, exercises: 4 }, advanced: { sets: 4, reps: '6–10', rest: 60, exercises: 5 } };

export async function searchActivities(accessToken: string, opts: { query?: string; categories?: string[]; limit?: number; muscle?: MuscleGroupId | null }): Promise<ActivityPick[]> {
  const params = ['select=id,name,image_url,primary_image_url,category,default_duration_min,body_parts', 'is_group=not.is.true', `limit=${opts.limit || 12}`, 'order=health_score.desc.nullslast'];
  const group = opts.muscle ? MUSCLE_GROUPS.find((g) => g.id === opts.muscle) : null;
  if (group) {
    // body_parts is a jsonb array: match any of the group's parts; face also matches by name.
    const ors = group.parts.map((p) => `body_parts.cs.${encodeURIComponent(JSON.stringify([p]))}`);
    if (group.id === 'face') ors.push('name.ilike.*facial*', 'name.ilike.*face%20yoga*', 'name.ilike.*jaw*', 'name.ilike.*cheek*');
    params.push(`or=(${ors.join(',')})`);
    params.push('category=not.in.(Beauty,Hygiene,Supplement,Consume)'); // muscle work only, not face mists or flossing
  }
  if (opts.categories?.length) params.push(`category=in.(${opts.categories.map((c) => `"${c}"`).join(',')})`);
  const q = opts.query?.replace(/[%,()*]/g, ' ').trim();
  if (q) params.push(`name=ilike.*${encodeURIComponent(q)}*`);
  const res = await fetch(`${rest()}/catalog_activities?${params.join('&')}`, { headers: headers(accessToken) });
  if (!res.ok) throw new Error(`Activity search failed (${res.status})`);
  return ((await res.json()) as any[]).map((r) => ({ id: r.id, name: r.name, image: r.image_url || r.primary_image_url || null, category: r.category, minutes: r.default_duration_min ?? null, bodyParts: Array.isArray(r.body_parts) ? r.body_parts.map(String) : [] }));
}

/** Build the goal's weekly split, filling each session with catalog exercises that match its pattern. */
export async function draftFitnessWeek(accessToken: string, goalId: string, level: FitnessConfig['level'], minutes: number): Promise<FitnessSession[]> {
  const goal = FITNESS_GOALS.find((g) => g.id === goalId) || FITNESS_GOALS[0];
  const dose = LEVEL[level];
  const used = new Set<string>();
  const sessions: FitnessSession[] = [];
  for (const [index, day] of goal.days.entries()) {
    const t = goal.pattern[index % goal.pattern.length];
    const exercises: ExercisePick[] = [];
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
    sessions.push({ day, time: '07:00', anchor: 'wake', offset: 30, rules: t.intensity === 'low' ? [] : ['Warm up for 5 minutes'], title: dayNameFor(exercises) || t.title, minutes: t.muscles?.includes('face') ? Math.min(minutes, 15) : minutes, intensity: level === 'beginner' && t.intensity === 'high' ? 'moderate' : t.intensity, exercises });
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
      return [...meals,...drinks].map(item => ({ rule:'Fasting window',item,where:`${dayNameFor(day)} ${slot.label}`,reason:'Scheduled during a fasting period. Kept for review; move or remove it if required.' }));
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
      catalog_activity_id: s.exercises[0]?.id || null, media_image_url: s.exercises[0]?.image || null,
      has_children: s.exercises.length > 0 || !!(step?.dos.length || step?.donts.length), enabled: true, hidden: false,
      notes: [s.anchor && s.anchor !== 'clock' ? describeTiming(sessionTiming(s)) : '', s.exercises.map((e) => e.name).join(' · ')].filter(Boolean).join(' · '), ...weekly(s.day),
    } as Partial<AdminProtocolItem>);
    // Exercises are saved grouped by muscle (Legs, Glutes, Chest…), like a smart list inside the session.
    for (const e of sortByMuscle(s.exercises)) await createProtocolItem(accessToken, {
      protocol_id: protocol.id, parent_protocol_item_id: parent.id, display_name: e.name, kind: 'action', item_type: 'activity', category: 'do', subtype: 'exercise', group_name: muscleGroupOf(e),
      catalog_activity_id: e.id, sets: e.sets, reps: e.reps ? parseInt(e.reps, 10) || null : null, reps_display: e.reps, rest_seconds: e.rest_seconds,
      duration_minutes: e.minutes, day_number: 1, sort_order: order++, has_children: false, enabled: true, hidden: false, notes: '', ...weekly(s.day),
    } as Partial<AdminProtocolItem>);
    await addRules(accessToken, protocol.id, step ? { dos: step.dos, donts: step.donts } : s.rules, { parentId: parent.id, category: 'do', days: weekly(s.day).recurrence_days_of_week, next: () => order++ });
  }
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
