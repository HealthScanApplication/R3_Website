import { Fragment, useEffect, useMemo, useState } from 'react';
import { Pill, CalendarDays, ClipboardCheck, CupSoda, Croissant, Droplet, Drumstick, Eraser, Hourglass, Layers, LayoutGrid, CircleDot, ListChecks, SquarePen, UtensilsCrossed, Dumbbell, Loader2, Plus, Search, Sparkles, Trash2, Utensils, Users, X, Combine, AlertTriangle, Apple, Bean, Beef, Carrot, Egg, Fish, Grape, Leaf, MilkOff, Moon, Salad, Scale, Sun, Sunrise, WheatOff, Activity, Bike, Flame, Flower2, Footprints, HeartPulse, Medal, Mountain, PersonStanding, SignalHigh, SignalLow, SignalMedium, Smile, Snowflake, StretchHorizontal, Swords, Target, Trophy, Volleyball, Waves, Zap, type LucideIcon } from 'lucide-react';
import { listProtocolItems, type AdminProtocol, type AdminProtocolItem } from '../../utils/protocolAdmin';
import type { GuideLead, GuideRecipe } from '../../utils/guidePortal';
import { smartFill, type RecipeIdea } from '../../utils/dietPlanner';
import { nutrientsForTier, type Tier } from '../../utils/recipeNutrients';
import { TIERS, tierLabel, useEssential90 } from './RecipeInsights';
import { DietFastingControls, FastingDayCell, SupplementEditor, addTag, fastHatch } from './DietSchedule';
import { DietNutritionPanel } from './DietNutritionPanel';
import { DietLocationHeader } from './DietLocationHeader';
import { SupplementPicker } from './SupplementPicker';
import { LinkedDiet, LinkedTraining } from './LinkedRoutine';
import { ActivityDetailPreview } from './ActivityDetailPreview';
import { defaultHomeCity, plannerWeek, saveHomeCity, sunriseForDate, validPlannerLocation } from '../../utils/plannerSunrise';
import { aggregateDiet, dietSelections, loadDietAnalysis, type DietAnalysis } from '../../utils/dietNutrition';
import { PRAL_DISPLAY } from '../../utils/pral';
import {
  MUSCLE_GROUPS, dayNameFor, muscleGroupOf, type MuscleGroupId, mealDrinks, mealPickKey, selectedServings, fitsSlot, DIET_FRAMEWORKS, FITNESS_GOALS, FRAMEWORK_RULES, mealTiming, resolveTiming, sessionTiming, mealIsFasting, fastingDrinkAllowed, type Anchor, type Timing, MEAL_SLOTS, WEEK, combineProtocols, draftFitnessWeek, TRAINING_TYPES, GOAL_TYPES, likedCategories, planFitnessWeek, type FitnessLikes, defaultFuel, type TrainingFuel, defaultSchedule, TRAIN_TIMES, exerciseGroup, sessionTimeFor, type FitnessSchedule, type TrainTime, findClashes, guideRecipeToPick,
  dietSupportItems, isDrinkPick, SUPPLEMENT_PERIODS, supplementCell, type SupplementPeriod, listBuilderMeta, macroGrams, saveDietProtocol, saveFitnessProtocol, searchActivities, searchDietRecipes, sumNutrition,
  reviewCombined, reviewDiet, reviewFitness, type Conflict, type Review, type ReviewNote, type ActivityPick, type BuilderKind, type Clash, type DietConfig, type FitnessConfig, type FitnessSession, type MealPick,
} from '../../utils/protocolBuilders';

// Guardian dark tokens (same values as GuidePortal.tsx).
const ink = '#F5F2EA';
const muted = '#B8B6AF';
const line = 'rgba(245,242,234,0.24)';
const black = '#090A08';
const panel = '#11120F';
const acid = '#C7D8A3';
const warn = '#E8B07A';
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const input: React.CSSProperties = { width: '100%', height: 40, boxSizing: 'border-box', border: `1px solid ${line}`, background: '#0D0E0C', color: ink, borderRadius: 2, padding: '0 11px', fontFamily: sans, fontSize: 13, outline: 'none' };
const label: React.CSSProperties = { display: 'block', color: muted, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7, lineHeight: 1.35 };
const btn: React.CSSProperties = { minHeight: 40, border: `1px solid ${line}`, background: ink, color: black, padding: '0 16px', borderRadius: 4, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 };
const ghost: React.CSSProperties = { ...btn, background: 'transparent', color: ink };
const chip = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? acid : line}`, background: on ? 'rgba(199,216,163,.14)' : 'transparent', color: on ? acid : ink, borderRadius: 999, padding: '7px 12px', fontFamily: sans, fontSize: 11, fontWeight: 700, cursor: 'pointer' });
// Leading icons for the diet framework and meal chips.
const FRAMEWORK_ICON: Record<string, LucideIcon> = { balanced: Scale, mediterranean: Grape, vegan: Leaf, vegetarian: Carrot, pescatarian: Fish, keto: Egg, low_carb: Salad, high_protein: Beef, gluten_free: WheatOff, dairy_free: MilkOff, low_fodmap: Bean };
const MEAL_ICON: Record<string, LucideIcon> = { breakfast: Sunrise, lunch: Sun, snack: Apple, dinner: Moon };
/** What each diet framework means, in plain words, shown under the chips when it is selected. */
const FRAMEWORK_ABOUT: Record<string, string> = {
  balanced: 'An everyday whole-food diet with nothing excluded: vegetables, fruit, whole grains, protein and healthy fats in sensible portions.',
  mediterranean: 'The traditional eating pattern of the Mediterranean coast: plenty of vegetables, legumes, whole grains, fruit, nuts and extra-virgin olive oil, fish a few times a week, and little red meat or sugar.',
  vegan: 'Fully plant-based: no meat, fish, dairy, eggs or honey. Protein comes from legumes, soy, nuts and seeds; vitamin B12 needs a fortified food or a supplement.',
  vegetarian: 'No meat or fish, but dairy and eggs are in. Protein comes from eggs, dairy, legumes, soy, nuts and seeds.',
  pescatarian: 'Vegetarian plus fish and seafood: protein and omega-3 without meat.',
  keto: 'Very low carbohydrate and high fat, so the body runs on fat (ketosis). Grains, sugar, most fruit and starchy vegetables are out.',
  low_carb: 'Fewer carbohydrates than usual (under about a quarter of energy), with more protein and fat: less bread, pasta, rice and sugar.',
  high_protein: 'Protein makes up about a third of energy, from lean meat, fish, eggs, dairy and legumes, to support muscle and fullness.',
  gluten_free: 'No wheat, barley, rye or anything made from them, for coeliac disease or gluten sensitivity. Rice, potatoes, corn, quinoa and certified oats are fine.',
  dairy_free: 'No milk, cheese, butter, yogurt or cream, for lactose intolerance or a milk allergy. Calcium comes from fortified plant milks, greens and tofu.',
  low_fodmap: 'Limits fermentable carbohydrates (FODMAPs) that can upset sensitive guts, such as onion, garlic, wheat, beans and some fruit. Often used short-term for IBS, with a dietitian.',
};
const PERIOD_ICON: Record<string, LucideIcon> = { morning: Sunrise, afternoon: Sun, evening: Moon };
const TIER_ICON: Record<number, LucideIcon> = { 15: CircleDot, 30: Layers, 90: LayoutGrid };
const MACRO_CARD_ICON: Record<string, LucideIcon> = { energy_kcal: Flame, protein_g: Drumstick, carbohydrates_g: Croissant, fats_g: Droplet };
const ico = (Icon: LucideIcon, size = 12) => <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
const iconLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
// Day timeline, as in the app's Home timeline: a rail with a node per entry, tinted like the app (dark theme).
const TL = { consume: '#6FCF77', supplements: '#4DD0E1' };
const toMins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const tlNode = (color: string, Icon: LucideIcon) => <span aria-hidden="true" style={{ position: 'absolute', left: -19, top: 0, width: 14, height: 14, borderRadius: 99, background: panel, border: `1.5px solid ${color}`, display: 'grid', placeItems: 'center', color }}><Icon size={8} strokeWidth={2.4} /></span>;
const tlHead = (color: string): React.CSSProperties => ({ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color, marginBottom: 4, lineHeight: '14px' });
const iconChip = (on: boolean): React.CSSProperties => ({ ...chip(on), display: 'inline-flex', alignItems: 'center', gap: 6 });
// Leading icons for the fitness goal, level, training-type and sport chips.
const GOAL_ICON: Record<string, LucideIcon> = { weight_loss: Flame, muscle_gain: Dumbbell, endurance: Activity, mobility: StretchHorizontal, face: Smile, general: Target };
const LEVEL_ICON: Record<string, LucideIcon> = { beginner: SignalLow, intermediate: SignalMedium, advanced: SignalHigh };
const TYPE_ICON: Record<string, LucideIcon> = { strength: Dumbbell, calisthenics: PersonStanding, cardio: HeartPulse, hiit: Zap, stretching: StretchHorizontal, yoga: Flower2, martial_arts: Swords, water: Waves, recovery: Snowflake };
const SPORT_ICONS: Array<[RegExp, LucideIcon]> = [
  [/run|walk|hik|jog|triathlon|parkour/i, Footprints], [/cycl|bik/i, Bike], [/swim|surf|kayak|canoe|row|sail|paddle|scuba|water polo|pool/i, Waves],
  [/box|kick|muay|judo|karate|jiu|taekwondo|wrestl|fenc|martial|sparring/i, Swords], [/climb|boulder/i, Mountain], [/ski|snow|ice skat/i, Snowflake],
  [/volleyball/i, Volleyball], [/ball|hockey|cricket|tennis|padel|squash|badminton|racquet|pickle|golf|lacrosse|rugby/i, Trophy],
];
const sportIcon = (name: string) => SPORT_ICONS.find(([re]) => re.test(name))?.[1] || Medal;
const IconLabel = ({ Icon, size = 13, children }: { Icon?: LucideIcon; size?: number; children: React.ReactNode }) => <>{Icon && <Icon size={size} strokeWidth={1.8} aria-hidden="true" />}{children}</>;
const card: React.CSSProperties = { border: `1px solid ${line}`, background: panel, padding: 16 };
const iconBtn: React.CSSProperties = { border: 0, background: 'transparent', color: muted, cursor: 'pointer', padding: 2, display: 'inline-flex' };

type SavedMeta = Record<string, { builder_kind: BuilderKind | null; builder_config: any }>;

interface CommonProps { accessToken: string; ownerId: string; protocols: AdminProtocol[]; initialProtocolId?: string | null; onSaved: (protocol: AdminProtocol) => void; onOpen: (protocolId: string) => void }

export function Header({ kicker, title, copy, Icon }: { kicker: string; title: string; copy: string; Icon: typeof Users }) {
  return <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 26 }}>
    <div style={{ width: 64, height: 64, border: `1px solid ${line}`, display: 'grid', placeItems: 'center' }}><Icon size={26} color={acid} /></div>
    <div><div style={{ ...label, color: acid, margin: 0 }}>{kicker}</div><h1 style={{ fontFamily: serif, fontSize: 52, fontWeight: 300, margin: '6px 0 4px' }}>{title}</h1><p style={{ color: muted, margin: 0, fontSize: 13, maxWidth: 640, lineHeight: 1.5 }}>{copy}</p></div>
  </div>;
}

function Status({ busy, message }: { busy: boolean; message: string }) {
  if (!busy && !message) return null;
  return <span style={{ color: /fail|error|could not/i.test(message) ? warn : muted, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{busy && <Loader2 size={13} className="animate-spin" />}{message}</span>;
}

function SavedList({ kind, protocols, meta, activeId, onPick, onOpen }: { kind: BuilderKind; protocols: AdminProtocol[]; meta: SavedMeta; activeId: string | null; onPick: (p: AdminProtocol) => void; onOpen: (id: string) => void }) {
  const mine = protocols.filter((p) => meta[p.id]?.builder_kind === kind);
  if (!mine.length) return null;
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
    <span style={{ ...label, margin: 0 }}>Saved</span>
    {mine.map((p) => <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><button type="button" onClick={() => onPick(p)} style={chip(activeId === p.id)}>{p.name}</button><button type="button" title="Open in Protocol editor" onClick={() => onOpen(p.id)} style={{ ...iconBtn, fontSize: 10 }}>↗</button></span>)}
  </div>;
}

/** One rule per line; saved as checkable rule_do items (an item's do-checklist or a group's). */
function RulesEditor({ title, rules, onChange, placeholder, compact, Icon = ListChecks }: { title: string; rules: string[]; onChange: (rules: string[]) => void; placeholder: string; compact?: boolean; Icon?: LucideIcon }) {
  const [text, setText] = useState(rules.join('\n'));
  useEffect(() => { if (text.split('\n').map((x) => x.trim()).filter(Boolean).join('\n') !== rules.join('\n')) setText(rules.join('\n')); }, [rules.join('\n')]); // eslint-disable-line react-hooks/exhaustive-deps
  return <label style={{ display: 'block' }}><span style={{ ...label, ...iconLabel, gap: 5, marginBottom: compact ? 3 : 7, fontSize: compact ? 9 : 10 }}>{ico(Icon, compact ? 10 : 11)}{title}</span>
    <textarea value={text} placeholder={placeholder} rows={compact ? 2 : 3} onChange={(e) => { setText(e.target.value); onChange(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean)); }}
      style={{ ...input, height: 'auto', padding: compact ? 5 : 9, fontSize: compact ? 10 : 12, lineHeight: 1.4, resize: 'vertical' }} /></label>;
}

/** Clock time, or minutes after waking / before bed. */
function TimingField({ value, onChange, compact }: { value: Timing; onChange: (t: Timing) => void; compact?: boolean }) {
  const h = compact ? 26 : 32; const f = compact ? 10 : 11;
  return <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
    <select value={value.anchor} onChange={(e) => onChange({ ...value, anchor: e.target.value as Anchor, offset: value.offset || 30 })} style={{ ...input, height: h, fontSize: f, padding: '0 3px', width: compact ? 74 : 98 }}>
      <option value="clock">At time</option><option value="wake">After wake</option><option value="bed">Before bed</option>
    </select>
    {value.anchor === 'clock'
      ? <input type="time" value={value.time} onChange={(e) => onChange({ ...value, time: e.target.value })} style={{ ...input, height: h, fontSize: f, padding: '0 3px' }} />
      : <><input type="number" min={0} step={5} value={value.offset} onChange={(e) => onChange({ ...value, offset: Number(e.target.value) || 0 })} style={{ ...input, height: h, fontSize: f, padding: '0 3px', width: 46 }} /><span style={{ color: muted, fontSize: f - 1 }}>min</span></>}
  </div>;
}

/** Shared-checker notes + flagged contradictions, shown before anything is saved. Conflicts are never auto-resolved. */
function ReviewPanel({ notes, conflicts, blocking = [], onSave, onClose, busy, saveLabel, notesTitle = 'The shared Protocol rules will adjust these on save:' }: { notes: ReviewNote[]; conflicts: Conflict[]; blocking?: ReviewNote[]; onSave?: () => void; onClose?: () => void; busy?: boolean; saveLabel?: string; notesTitle?: string }) {
  return <div style={{ ...card, margin: '0 0 14px', borderColor: conflicts.length ? warn : line }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ ...label, margin: 0, color: conflicts.length ? warn : acid }}>Review · {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} · {notes.length} rule note{notes.length === 1 ? '' : 's'}</span>
      {onClose && <button type="button" style={iconBtn} onClick={onClose}><X size={14} /></button>}
    </div>
    {blocking.length > 0 && <div style={{ marginBottom: 10 }}>
      <div style={{ color: '#E88A7A', fontSize: 12, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}><AlertTriangle size={13} /> Fix {blocking.length === 1 ? 'this' : `these ${blocking.length}`} before saving:</div>
      {blocking.slice(0, 12).map((b, i) => <div key={i} style={{ fontSize: 12, marginTop: 4 }}><span style={{ color: ink }}>{b.where}</span><span style={{ color: muted }}> · {b.message}</span></div>)}
    </div>}
    {conflicts.length > 0 && <div style={{ marginBottom: 10 }}>
      <div style={{ color: warn, fontSize: 12, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}><AlertTriangle size={13} /> Contradictions to decide. They are saved as they are; change the meal, session or rule if you want them gone.</div>
      {conflicts.slice(0, 12).map((c, i) => <div key={i} style={{ fontSize: 12, marginTop: 4 }}><span style={{ color: ink }}>{c.where}: {c.item}</span><span style={{ color: muted }}> vs “{c.rule}” · {c.reason}</span></div>)}
      {conflicts.length > 12 && <div style={{ color: muted, fontSize: 11, marginTop: 4 }}>+{conflicts.length - 12} more</div>}
    </div>}
    {notes.length > 0 && <div style={{ marginBottom: 10 }}>
      <div style={{ color: muted, fontSize: 11, marginBottom: 3 }}>{notesTitle}</div>
      {notes.slice(0, 10).map((n, i) => <div key={i} style={{ fontSize: 11, color: muted }}>{n.where}: {n.message}</div>)}
      {notes.length > 10 && <div style={{ color: muted, fontSize: 11 }}>+{notes.length - 10} more</div>}
    </div>}
    {!notes.length && !conflicts.length && !blocking.length && <p style={{ color: acid, fontSize: 12, margin: '0 0 10px' }}>Every item follows the Protocol rules and nothing contradicts.</p>}
    {onSave && <button type="button" style={{ ...btn, opacity: blocking.length ? .4 : 1 }} disabled={busy || blocking.length > 0} onClick={onSave}>{blocking.length ? 'Fix the items above to save' : saveLabel || 'Save'}</button>}
  </div>;
}

/* ───────────────────────── Diet ───────────────────────── */

const emptyDiet = (): DietConfig => ({ framework: 'mediterranean', kcal: 2000, protein: 18, carbs: 47, fat: 35, slots: ['breakfast', 'lunch', 'dinner'], plan: {}, drinks: { breakfast: [], lunch: [], snack: [], dinner: [] }, timing: { breakfast: { anchor: 'wake', time: '08:00', offset: 60 } }, rules: FRAMEWORK_RULES.mediterranean, mealRules: {}, supplements: {}, supplementTimes: { morning: '08:00', afternoon: '14:00', evening: '20:00' }, fasting: { type: 'none', start: '20:00', end: '12:00', days: [1, 2, 3, 4, 5, 6, 7] } });

function Bar({ value, target }: { value: number; target: number }) {
  const ratio = target ? value / target : 0;
  const ok = ratio >= 0.9 && ratio <= 1.1;
  return <div style={{ height: 4, background: 'rgba(245,242,234,.1)', marginTop: 5 }}><div style={{ height: 4, width: `${Math.min(100, ratio * 100)}%`, background: ok ? acid : warn }} /></div>;
}

export function DietBuilder({ accessToken, ownerId, protocols, recipes, initialProtocolId, onSaved, onOpen }: CommonProps & { recipes: GuideRecipe[] }) {
  const [cfg, setCfg] = useState<DietConfig>(emptyDiet);
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer);},[]);
  const city=validPlannerLocation(cfg.location)?cfg.location:undefined;
  // A plan without a city uses the home city (last chosen on this device, else the device timezone's largest city).
  // Only a never-set location (undefined) gets the default; null means the user cleared it and is kept.
  useEffect(() => { if (cfg.location !== undefined) return; let live = true; defaultHomeCity().then((home) => { if (live && home) setCfg((c) => c.location === undefined ? { ...c, location: home } : c); }); return () => { live = false; }; }, [cfg.location]);
  const weekDates=city?plannerWeek(city.timezone,now):[];
  const [name, setName] = useState('Mediterranean week');
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [meta, setMeta] = useState<SavedMeta>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [suppEditing, setSuppEditing] = useState<{ day: number; period: SupplementPeriod } | null>(null);
  const [drinkIndex, setDrinkIndex] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<DietAnalysis>({});
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [searching, setSearching] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [tier, setTier] = useState<Tier>(15);
  const [ideas, setIdeas] = useState<RecipeIdea[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MealPick[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const framework = DIET_FRAMEWORKS.find((f) => f.id === cfg.framework) || DIET_FRAMEWORKS[0];
  const targets = macroGrams(cfg);
  const slots = MEAL_SLOTS.filter((s) => cfg.slots.includes(s.id));
  const ownPicks = useMemo(() => recipes.map(guideRecipeToPick), [recipes]);
  const selections = dietSelections(cfg).filter((p): p is MealPick => typeof p !== 'string');
  const selectedIds = [...new Set(selections.map(mealPickKey))].sort().join('|');
  useEffect(() => {
    const controller = new AbortController(); let live = true;
    setAnalysis({}); setAnalysisError(''); setAnalysisBusy(selections.length > 0);
    loadDietAnalysis(accessToken, selections, recipes, controller.signal, PRAL_DISPLAY).then((next) => { if (live) setAnalysis(next); })
      .catch((e) => { if (live) setAnalysisError(e.message); }).finally(() => { if (live) setAnalysisBusy(false); });
    return () => { live = false; controller.abort(); };
  }, [selectedIds, accessToken, recipes]); // Refresh IDs, not serving quantity edits.

  useEffect(() => { listBuilderMeta(accessToken, ownerId).then(setMeta).catch(() => {}); }, [accessToken, ownerId]);
  useEffect(() => {
    if (!initialProtocolId || !meta[initialProtocolId]?.builder_config) return;
    setCfg({ ...emptyDiet(), ...structuredClone(meta[initialProtocolId].builder_config), drinks: meta[initialProtocolId].builder_config.drinks });
    setName(protocols.find((p) => p.id === initialProtocolId)?.name || 'Diet plan');
    setProtocolId(initialProtocolId);
  }, [initialProtocolId, meta]);
  useEffect(() => {
    if (!picking) return;
    let live = true; setResults([]); setSearching(true);
    const slot = MEAL_SLOTS.find((s) => s.id === picking.split(':')[1]);
    const share = slots.reduce((sum, s) => sum + s.share, 0) || 1;
    const timer = setTimeout(() => {
      searchDietRecipes(accessToken, { framework, query, drinksOnly: drinkIndex != null, kcalTarget: drinkIndex == null && slot ? cfg.kcal * slot.share / share : undefined, limit: 24 })
        .then((hits) => { if (!live) return; const all = [...ownPicks.filter((p) => (drinkIndex == null || isDrinkPick(p)) && (!query || p.name.toLowerCase().includes(query.toLowerCase()))), ...hits]; const slotId = picking.split(':')[1]; setResults([...all.filter((p) => fitsSlot(p.name, slotId)), ...all.filter((p) => !fitsSlot(p.name, slotId))]); })
        .catch((e) => { if (live) setMessage(String(e.message || e)); }).finally(() => { if (live) setSearching(false); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [picking, query, cfg.framework, cfg.kcal, accessToken, ownPicks, drinkIndex]);

  const pickFramework = (id: string) => { const f = DIET_FRAMEWORKS.find((x) => x.id === id)!; setCfg({ ...cfg, framework: id, protein: f.protein, carbs: f.carbs, fat: f.fat, rules: FRAMEWORK_RULES[id] || [] }); if (!protocolId) setName(`${f.label} week`); };
  const setPick = (key: string, pick: MealPick | null) => setCfg((c) => ({ ...c, plan: { ...c.plan, [key]: pick } }));
  const setDrinks = (key: string, drinks: Array<MealPick | string>) => setCfg((c) => ({ ...c, drinkPlan: { ...c.drinkPlan, [key]: drinks } }));
  const nutritionReport = aggregateDiet(cfg, analysis);
  const refreshed = (p: MealPick) => ({ ...p, ...analysis[mealPickKey(p)], servings: p.servings });
  const dayTotals = WEEK.map(({ day }) => sumNutrition(dietSelections(cfg, day).filter((p): p is MealPick => typeof p !== 'string').map(refreshed)));
  const week = sumNutrition(selections.map(refreshed));
  const macroSum = cfg.protein + cfg.carbs + cfg.fat;

  const run = async (label: string, work: () => Promise<void>) => { setBusy(true); setMessage(label); try { await work(); } catch (e) { const failedId = (e as { protocolId?: string }).protocolId; if (failedId) setProtocolId(failedId); setMessage(`Failed: ${(e as Error).message}`); setBusy(false); return; } setBusy(false); };
  const autoFill = () => run('Choosing recipes from the database…', async () => {
    const res = await smartFill(accessToken, cfg, recipes, tier, setMessage, catalogNutrients);
    setCfg({ ...cfg, plan: res.plan }); setIdeas(res.ideas);
    const filled = Object.values(res.plan).filter(Boolean).length;
    setMessage(`Week filled with ${new Set(Object.values(res.plan).filter(Boolean).map((p) => p!.id)).size} different recipes across ${filled} meals. Ranked by health score and ${tierLabel(tier)} coverage, gaps first.`);
  });
  const catalogNutrients = useEssential90();
  const defs = nutrientsForTier(tier,catalogNutrients);
  const reports = nutritionReport.days.map((day) => {
    const measured = defs.filter((d) => d.dv && day.nutrients[d.key]?.amount != null);
    return { coverage: Math.round(measured.reduce((sum,d) => sum + Math.min(1,day.nutrients[d.key].amount! / d.dv!),0) / (defs.filter((d) => d.dv).length || 1)*100), gaps: measured.filter((d) => day.nutrients[d.key].amount! < d.dv!*.5), incomplete: defs.some((d) => day.nutrients[d.key]?.known !== day.count || day.nutrients[d.key]?.partial) };
  });
  const save = () => run('Saving to Protocols…', async () => {
    const { protocol, metaSaved } = await saveDietProtocol(accessToken, ownerId, protocolId, name.trim() || `${framework.label} week`, cfg);
    setProtocolId(protocol.id); setMeta((m) => ({ ...m, [protocol.id]: { builder_kind: 'diet', builder_config: cfg } })); onSaved(protocol);
    setMessage(metaSaved ? 'Saved as a Protocol.' : 'Saved the meals. The diet settings could not be stored on this database yet.');
  });
  const load = (p: AdminProtocol) => { const c = meta[p.id]?.builder_config; if (c) { setCfg({ ...emptyDiet(), ...c, drinks: c.drinks }); setName(p.name); setProtocolId(p.id); setMessage(''); } };
  const shownResults = results.filter(r => !picking || drinkIndex == null || (isDrinkPick(r) && fastingDrinkAllowed(cfg,Number(picking.split(':')[0]),picking.split(':')[1],r)));

  return <div>
    <Header Icon={Utensils} kicker="Build" title="Diet planner" copy="Plan meals and drinks from your recipes and the published recipe database. Daily and weekly macros, micronutrients and hazards use recorded nutrition and selected servings; missing data stays unknown." />
    <SavedList kind="diet" protocols={initialProtocolId ? protocols.filter((p) => p.id === initialProtocolId) : protocols} meta={meta} activeId={protocolId} onPick={load} onOpen={onOpen} />
    <div style={{ ...card, marginBottom: 14 }}>
      <span style={{ ...label, ...iconLabel }}>{ico(Salad, 11)}Diet framework</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{DIET_FRAMEWORKS.map((f) => { const Icon = FRAMEWORK_ICON[f.id]; return <button key={f.id} type="button" onClick={() => pickFramework(f.id)} style={iconChip(f.id === cfg.framework)}>{Icon && <Icon size={13} strokeWidth={1.8} aria-hidden="true" />}{f.label}</button>; })}</div>
      <div style={{ borderLeft: `2px solid ${acid}`, padding: '2px 0 2px 10px', margin: '12px 0 0' }}>
        <p style={{ color: ink, fontSize: 12, lineHeight: 1.5, margin: 0 }}><strong>{framework.label}:</strong> {FRAMEWORK_ABOUT[framework.id] || framework.note}</p>
        <p style={{ color: muted, fontSize: 11, margin: '4px 0 0' }}>{framework.protein}% protein · {framework.carbs}% carbs · {framework.fat}% fat · Planner: {framework.note}</p>
      </div>
    </div>
    <div style={{ ...card, marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, alignItems: 'end' }}>
      <label><span style={label}>Name</span><input style={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label><span style={label}>kcal / day</span><input style={input} type="number" min={1000} step={50} value={cfg.kcal} onChange={(e) => setCfg({ ...cfg, kcal: Number(e.target.value) || 0 })} /></label>
      {(['protein', 'carbs', 'fat'] as const).map((k) => <label key={k}><span style={label}>{k} %</span><input style={input} type="number" min={0} max={100} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) || 0 })} /></label>)}
      <div><span style={{ ...label, ...iconLabel }}>{ico(Utensils, 11)}Meals</span><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{MEAL_SLOTS.map((s) => <button key={s.id} type="button" onClick={() => setCfg({ ...cfg, slots: cfg.slots.includes(s.id) ? cfg.slots.filter((x) => x !== s.id) : [...cfg.slots, s.id] })} style={{ ...iconChip(cfg.slots.includes(s.id)), padding: '5px 9px', fontSize: 10, gap: 5 }}>{(() => { const Icon = MEAL_ICON[s.id]; return Icon && <Icon size={12} strokeWidth={1.8} aria-hidden="true" />; })()}{s.label}</button>)}</div></div>
    </div>
    <LinkedTraining accessToken={accessToken} protocolId={protocolId} diet={cfg} meta={meta} protocols={protocols} onOpen={onOpen} />
    {/* Wide screens: planner on the left, macros + nutrients + hazards in one sticky column on the right. Stacked below 1200px. */}
    <div className="g-diet-split">
    <aside className="g-diet-side" aria-label="Macros, nutrients and hazards">
    <div className="g-macro-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', borderTop: `1px solid ${line}`, borderBottom: `1px solid ${line}`, marginBottom: 18 }}>
      {([['Energy', 'energy_kcal', 'kcal'], ['Protein', 'protein_g', 'g'], ['Carbs', 'carbohydrates_g', 'g'], ['Fat', 'fats_g', 'g']] as const).map(([l, k, u]) => <div key={k} style={{ padding: '14px 14px 14px 0', borderRight: `1px solid ${line}` }}>
        <div style={{ ...label, ...iconLabel, margin: 0 }}>{ico(MACRO_CARD_ICON[k], 11)}{l}</div>
        <div style={{ fontFamily: serif, fontSize: 26 }}>{nutritionReport.week.nutrients[k]?.amount == null ? 'Unknown' : Math.round(week[k] || 0).toLocaleString()} <span style={{ fontSize: 13, color: muted }}>/ {(targets[k] * 7).toLocaleString()} {u} week</span></div>
        {nutritionReport.week.nutrients[k]?.known < nutritionReport.week.count && <div style={{ color: warn, fontSize: 10 }}>Recorded subtotal · incomplete</div>}
        <div style={{ color: muted, fontSize: 11 }}>{targets[k].toLocaleString()} {u} per day</div>
        <Bar value={week[k] || 0} target={targets[k] * 7} />
      </div>)}
    </div>
    {macroSum !== 100 && <p style={{ color: warn, fontSize: 12 }}>Macros add up to {macroSum}% of energy. Adjust them to 100%.</p>}
    <DietNutritionPanel report={nutritionReport} loading={analysisBusy} error={analysisError} />
    </aside>
    <section aria-label="Weekly diet planner" className="g-diet-plan" style={{ minWidth: 0 }}>
    <h2 style={{ fontSize: 16, ...iconLabel, gap: 8 }}>{ico(CalendarDays, 16)}Weekly planner · meals, drinks &amp; supplements</h2>
    <DietLocationHeader city={city} now={now} onChange={location=>{saveHomeCity(location);setCfg(c=>({...c,location:location??null}));}} />
    <DietFastingControls cfg={cfg} setCfg={setCfg} />
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
      <span style={{ display: 'flex', gap: 5 }}>{TIERS.map((t) => <button key={t} type="button" onClick={() => setTier(t)} title="Rank meals by this essential-nutrient set and show each day's coverage" style={{ ...chip(t === tier), padding: '6px 10px', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{ico(TIER_ICON[t], 11)}{tierLabel(t)}</button>)}</span>
      <button type="button" style={btn} disabled={busy || !slots.length} onClick={autoFill}><Sparkles size={13} /> Auto-fill week</button>
      <button type="button" style={ghost} disabled={busy} onClick={() => setCfg({ ...cfg, plan: {}, drinkPlan: {} })}><Eraser size={13} /> Clear meals &amp; drinks</button>
      <button type="button" style={btn} disabled={busy || (!selections.length && !dietSupportItems(cfg).length)} onClick={() => setReview(reviewDiet(cfg))}><ClipboardCheck size={13} /> Review &amp; {protocolId ? 'update' : 'save'}</button>
      {protocolId && <button type="button" style={ghost} onClick={() => onOpen(protocolId)}><SquarePen size={13} /> Open in editor</button>}
      <Status busy={busy} message={message} />
    </div>
    {review && <ReviewPanel notes={review.notes} conflicts={review.conflicts} blocking={review.blocking} busy={busy} onClose={() => setReview(null)} saveLabel={review.conflicts.length ? 'Save with conflicts flagged' : protocolId ? 'Update Protocol' : 'Save as Protocol'} onSave={() => { setReview(null); save(); }} />}
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `132px repeat(7,minmax(118px,1fr))`, gap: 6, minWidth: 990 }}>
        <div />{WEEK.map((w, i) => <div key={w.day} style={{ ...label, margin: 0 }}>{w.short}{city&&<div style={{fontSize:10,letterSpacing:0,textTransform:'none',fontWeight:400,margin:'5px 0',color:acid}}>{weekDates[i]}<br/>Sunrise {sunriseForDate(city,weekDates[i])?`≈ ${sunriseForDate(city,weekDates[i])}`:'— (no sunrise)'}</div>}<div style={{ color: ink, fontSize: 11, letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>{nutritionReport.days[i].nutrients.energy_kcal.amount == null ? 'Unknown' : Math.round(dayTotals[i].energy_kcal)} / {cfg.kcal} kcal</div><Bar value={dayTotals[i].energy_kcal} target={cfg.kcal} />
          <div style={{ color: ink, fontSize: 10, letterSpacing: 0, textTransform: 'none', fontWeight: 400, marginTop: 4 }}>P {nutritionReport.days[i].nutrients.protein_g.amount == null ? 'Unknown' : Math.round(dayTotals[i].protein_g)} / {targets.protein_g} g</div><Bar value={dayTotals[i].protein_g} target={targets.protein_g} />
          {nutritionReport.days[i].count > 0 && <div title={reports[i].gaps.map((g) => g.label).join(', ')} style={{ fontSize: 10, letterSpacing: 0, textTransform: 'none', fontWeight: 400, marginTop: 4, color: reports[i].coverage >= 60 ? acid : warn }}>{tierLabel(tier)} recorded: {reports[i].coverage}%{reports[i].incomplete && <span style={{ display: 'block' }}>Incomplete data</span>}{reports[i].gaps.length ? <span style={{ display: 'block', color: muted }}>low recorded: {reports[i].gaps.slice(0, 3).map((g) => g.label).join(', ')}{reports[i].gaps.length > 3 ? ` +${reports[i].gaps.length - 3}` : ''}</span> : null}</div>}
        </div>)}
        <div style={{...label,...iconLabel,alignSelf:'center'}}>{ico(Hourglass,11)}Fasting · 24h timeline</div>{WEEK.map(w => <FastingDayCell key={w.day} cfg={cfg} day={w.day} />)}
        {SUPPLEMENT_PERIODS.map(period=><Fragment key={period.id}>
        <h3 style={{gridColumn:'1 / -1',fontSize:13,color:acid,margin:'12px 0 2px',borderTop:`1px solid ${line}`,paddingTop:12,...iconLabel,gap:7}}>{ico(PERIOD_ICON[period.id],14)}{`${period.label} · meals, drinks & supplements`}</h3>
        {(() => {
          const periodSlots = slots.filter(s=>period.id==='morning'?s.id==='breakfast':period.id==='afternoon'?['lunch','snack'].includes(s.id):s.id==='dinner');
          return [<div key="labels" style={{ ...label, margin: 0, alignSelf: 'start', display: 'grid', gap: 10 }}>{periodSlots.map((s) => <div key={s.id}><span style={{ ...iconLabel, gap: 5 }}>{MEAL_ICON[s.id] && ico(MEAL_ICON[s.id], 11)}{s.label}</span><div style={{ fontWeight: 400, margin: '4px 0 2px' }}><TimingField compact value={mealTiming(cfg, s.id)} onChange={(t) => setCfg({ ...cfg, timing: { ...cfg.timing, [s.id]: t } })} /></div><div style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>≈ {resolveTiming(mealTiming(cfg, s.id))}</div></div>)}</div>,
          ...WEEK.map(({ day, short }) => {
            // Everything in this part of the day, in time order: each meal with its drinks, then supplements at their time.
            const supp = supplementCell(cfg, day, period.id);
            const entries = [
              ...periodSlots.map((s) => {
                const key = `${day}:${s.id}`; const pick = cfg.plan[key]; const fasting = mealIsFasting(cfg,day,s.id); const drinks = mealDrinks(cfg,key); const time = resolveTiming(mealTiming(cfg, s.id));
                if (!pick && !drinks.length && !fasting) return null;
                return { mins: toMins(time), node: <div key={key} style={{ position: 'relative', marginBottom: 10, background: fasting ? fastHatch : undefined }}>
                  {tlNode(TL.consume, MEAL_ICON[s.id] || UtensilsCrossed)}
                  <div style={tlHead(TL.consume)}>{time} · {s.label}</div>
                  {fasting && <div style={{fontSize:10,color:warn,marginBottom:4}}>Fasting · {pick?'existing meal conflicts':'no meal at this time'}</div>}
                  {pick && <div style={{ position: 'relative' }}>
                    {pick.image && <img src={pick.image} alt="" style={{ width: '100%', height: 44, objectFit: 'cover', marginBottom: 5, borderRadius: 6 }} />}
                    <button type="button" disabled={fasting} aria-label={`Change ${key} meal`} onClick={() => { setPicking(key); setDrinkIndex(null); setQuery(''); }} style={{ ...iconBtn, textAlign: 'left', color: ink, fontSize: 11, lineHeight: 1.25, paddingRight: 14 }}>{pick.name}</button>
                    <label style={{ fontSize: 10, display: 'block', marginTop: 5 }}>Servings <input aria-label={`${key} meal servings`} type="number" min="0.01" step="0.25" value={selectedServings(pick)} onChange={(e) => setPick(key,{ ...pick, servings: Math.max(.01,Number(e.target.value)||1) })} style={{ ...input, width: 55, height: 26, padding: 3 }} /></label>
                    <div style={{ color: muted, fontSize: 10, marginTop: 3 }}>{pick.nutrition ? `${Math.round(pick.nutrition.energy_kcal)} kcal · P ${Math.round(pick.nutrition.protein_g)}` : 'No nutrition data'}{pick.healthScore != null ? ` · ♥ ${pick.healthScore}` : ''}{pick.source === 'guide' ? ' · yours' : ''}</div>
                    {(analysis[mealPickKey(pick)]?.hazards || pick.hazards || pick.hazardFlags || []).slice(0, 2).map((h) => <div key={h.label} title="All hazard records are listed in the nutrition section above" style={{ fontSize: 9, marginTop: 2, color: h.level === 'high' ? '#E88A7A' : warn, display: 'flex', gap: 3, alignItems: 'center' }}><AlertTriangle size={9} /> {h.label}</div>)}
                    <button type="button" title="Remove" aria-label={`Remove ${key} meal`} onClick={(e) => { e.stopPropagation(); setPick(key, null); }} style={{ ...iconBtn, position: 'absolute', top: 0, right: 0 }}><X size={12} /></button>
                  </div>}
                  {drinks.map((d,i) => <div key={i} style={{ borderTop: pick || i ? `1px solid ${line}` : 0, marginTop: pick || i ? 6 : 0, paddingTop: pick || i ? 5 : 0, fontSize: 10, position: 'relative', paddingRight: 14 }}>
                    {!fastingDrinkAllowed(cfg,day,s.id,d) && <div style={{color:warn}}>Existing drink conflicts with fast</div>}
                    <button type="button" onClick={() => { setPicking(key); setDrinkIndex(i); setQuery(typeof d === 'string' ? d : d.name); }} style={{ ...iconBtn, textAlign: 'left', fontSize: 10, gap: 4, alignItems: 'center' }}>{ico(CupSoda, 10)}{typeof d === 'string' ? `${d} · match recipe (nutrition unknown)` : d.name}</button>
                    {typeof d !== 'string' && <label style={{ display: 'block' }}>Servings <input aria-label={`${key} drink ${i+1} servings`} type="number" min="0.01" step="0.25" value={selectedServings(d)} onChange={(e) => setDrinks(key,drinks.map((x,n) => n===i ? { ...d, servings: Math.max(.01,Number(e.target.value)||1) } : x))} style={{ ...input, width: 55, height: 26, padding: 3 }} /></label>}
                    <button type="button" aria-label={`Remove ${key} drink ${i+1}`} style={{ ...iconBtn, position: 'absolute', top: 0, right: 0 }} onClick={() => setDrinks(key,drinks.filter((_,n) => n!==i))}><X size={11} /></button>
                  </div>)}
                </div> };
              }),
              supp.items.length ? { mins: toMins(supp.time), node: <div key="supp" style={{ position: 'relative', marginBottom: 10 }}>
                {tlNode(TL.supplements, Pill)}
                <div style={tlHead(TL.supplements)}>{supp.time} · Supplements</div>
                {supp.items.map((p, i) => <div key={i} style={{ fontSize: 11, marginBottom: 3, overflowWrap: 'anywhere' }}>{typeof p === 'string' ? p : p.name}</div>)}
              </div> } : null,
            ].filter(Boolean).sort((a, b) => a!.mins - b!.mins) as Array<{ mins: number; node: React.ReactNode }>;
            const drinkSlot = periodSlots.find((s) => cfg.plan[`${day}:${s.id}`]) || periodSlots[0];
            const drinkKey = drinkSlot ? `${day}:${drinkSlot.id}` : '';
            const drinkFasting = drinkSlot ? mealIsFasting(cfg, day, drinkSlot.id) : false;
            const active = !!picking && picking.startsWith(`${day}:`) && periodSlots.some((s) => picking === `${day}:${s.id}`);
            return <div key={`${day}:${period.id}`} aria-label={`${short} ${period.label.toLowerCase()} timeline`} style={{ ...card, padding: '10px 8px 8px 26px', minHeight: 92, borderColor: active ? acid : line, position: 'relative' }}>
              <span aria-hidden="true" style={{ position: 'absolute', left: 13, top: 12, bottom: 12, width: 2, borderRadius: 2, background: line }} />
              {entries.length ? entries.map((e) => e.node) : <div style={{ color: muted, fontSize: 10, marginBottom: 8, lineHeight: '14px' }}>Nothing planned yet</div>}
              {/* One row of add tags: meal (per slot), drink and supplement. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {periodSlots.filter((s) => !cfg.plan[`${day}:${s.id}`]).map((s) => { const key = `${day}:${s.id}`; const fasting = mealIsFasting(cfg,day,s.id); return <button key={key} type="button" aria-label={`Add ${key} meal`} disabled={fasting} onClick={() => { setPicking(key); setDrinkIndex(null); setQuery(''); }} style={{ ...addTag, opacity: fasting ? .4 : 1 }}>{ico(UtensilsCrossed, 11)}{periodSlots.length > 1 ? s.label : 'Meal'}</button>; })}
                {drinkSlot && <button type="button" disabled={drinkFasting && cfg.fasting?.type==='dry'} aria-label={`Add ${drinkKey} drink`} onClick={() => { setPicking(drinkKey); setDrinkIndex(mealDrinks(cfg,drinkKey).length); setQuery(drinkFasting?'Water':''); }} style={addTag}>{ico(CupSoda, 11)}{drinkFasting?'Water':'Drink'}</button>}
                <button type="button" aria-label={`Edit ${short} ${period.id} supplements`} onClick={() => setSuppEditing({ day, period: period.id })} style={addTag}>{ico(Pill, 11)}Supplement</button>
              </div>
            </div>;
          })];
        })()}
        {suppEditing?.period === period.id && <SupplementEditor cfg={cfg} setCfg={setCfg} accessToken={accessToken} day={suppEditing.day} period={suppEditing.period} onClose={() => setSuppEditing(null)} />}
        </Fragment>)}
      </div>
    </div>
    </section>
    </div>
    {ideas.length > 0 && <div style={{ ...card, marginTop: 14 }}>
      <div style={{ ...label, color: acid }}>Recipe ideas for this week's gaps · ingredients ranked by nutrients per kcal, fewest hazards</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10 }}>{ideas.map((idea) => <div key={idea.title} style={{ border: `1px solid ${line}`, padding: 12 }}>
        <div style={{ fontFamily: serif, fontSize: 20 }}>{idea.title}</div>
        <div style={{ color: muted, fontSize: 11, margin: '4px 0' }}>{idea.ingredients.join(' · ')}</div>
        <div style={{ fontSize: 11, color: acid }}>Brings: {idea.covers.join(', ')}</div>
        <button type="button" style={{ ...btn, marginTop: 8, minHeight: 32 }} onClick={() => { try { sessionStorage.setItem('guardian:recipe-brief', idea.brief); } catch { /* storage blocked: the builder opens empty */ } window.location.href = '/guardians/workspace?tab=recipes'; }}>Draft in recipe builder</button>
      </div>)}</div>
    </div>}
    <div style={{ ...card, marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
      <RulesEditor Icon={ClipboardCheck} title="Meal checklist for the week" rules={cfg.rules || []} onChange={(rules) => setCfg((c) => ({ ...c, rules }))} placeholder={'One rule per line, e.g.\nCook with olive oil'} />
      {slots.map((s) => <RulesEditor key={s.id} Icon={MEAL_ICON[s.id] || ListChecks} title={`${s.label} do-checklist`} rules={cfg.mealRules?.[s.id] || []} onChange={(rules) => setCfg((c) => ({ ...c, mealRules: { ...c.mealRules, [s.id]: rules } }))} placeholder="e.g. Chew slowly" />)}
    </div>
    {picking && <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ ...label, margin: 0 }}>{WEEK.find((w) => w.day === Number(picking.split(':')[0]))?.short} · {MEAL_SLOTS.find((s) => s.id === picking.split(':')[1])?.label} · Select {drinkIndex == null ? 'meal' : 'drink'} recipe · {framework.label}</span>
        <button type="button" style={iconBtn} onClick={() => setPicking(null)}><X size={14} /></button>
      </div>
      <div style={{ position: 'relative', marginBottom: 10 }}><Search size={13} color={muted} style={{ position: 'absolute', left: 10, top: 13 }} /><input autoFocus style={{ ...input, paddingLeft: 30 }} placeholder="Search recipes (yours and the catalog)" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 7 }}>
        {shownResults.map((r) => <button key={`${r.source}-${r.id}`} type="button" onClick={() => { const [day,slot] = picking.split(':'); if (drinkIndex == null) { if (mealIsFasting(cfg,Number(day),slot)) { setMessage('This meal time is inside the fasting window. Adjust the time or fasting schedule first.');return; } setPick(picking,r); } else { if (!isDrinkPick(r) || !fastingDrinkAllowed(cfg,Number(day),slot,r)) return; const drinks = [...mealDrinks(cfg,picking)]; drinks[drinkIndex] = r; setDrinks(picking,drinks); } setPicking(null); }} style={{ ...card, padding: 8, display: 'flex', gap: 8, textAlign: 'left', color: ink, cursor: 'pointer' }}>
          {r.image ? <img src={r.image} alt="" style={{ width: 42, height: 42, objectFit: 'cover', flex: 'none' }} /> : <div style={{ width: 42, height: 42, flex: 'none', border: `1px solid ${line}` }} />}
          <span><span style={{ display: 'block', fontSize: 12 }}>{r.name}</span><span style={{ color: muted, fontSize: 10 }}>{r.nutrition ? `${Math.round(r.nutrition.energy_kcal)} kcal · P ${Math.round(r.nutrition.protein_g)} · C ${Math.round(r.nutrition.carbohydrates_g)} · F ${Math.round(r.nutrition.fats_g)}` : ''}{r.source === 'guide' ? ' · your recipe' : ''}{!fitsSlot(r.name, picking.split(':')[1]) ? ' · named for another meal' : ''}</span></span>
        </button>)}
        {searching && <span role="status" style={{ color: muted, fontSize: 12 }}>Searching recipes…</span>}
        {!searching && !shownResults.length && <span style={{ color: muted, fontSize: 12 }}>No matching recipes allowed at this time. During fasting, only plain-water recipes can be added unless this is a dry fast. Recipes without nutrition remain unknown.</span>}
      </div>
    </div>}
  </div>;
}

/* ───────────────────────── Fitness ───────────────────────── */

const MUSCLE_ORDER = [...MUSCLE_GROUPS.map((g) => g.label as string), 'Cardio', 'Mobility', 'Other'];
const emptyFitness = (): FitnessConfig => ({ goal: 'general', level: 'beginner', minutes: 40, sessions: [], rules: ['Drink water during every session'] });

export function FitnessBuilder({ accessToken, ownerId, protocols, initialProtocolId, onSaved, onOpen }: CommonProps) {
  const [cfg, setCfg] = useState<FitnessConfig>(emptyFitness);
  const [name, setName] = useState('General fitness week');
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [meta, setMeta] = useState<SavedMeta>({});
  const [adding, setAdding] = useState<number | null>(null); // session index receiving an exercise
  const [detail, setDetail] = useState<{ s: number; k: number } | null>(null); // exercise open in the app-style preview
  const [muscle, setMuscle] = useState<MuscleGroupId | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ActivityPick[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const goal = FITNESS_GOALS.find((g) => g.id === cfg.goal) || FITNESS_GOALS[0];
  // What the person likes doing; picked sports and training types shape the drafted week.
  const [sportsList, setSportsList] = useState<ActivityPick[]>([]);
  const [sportFilter, setSportFilter] = useState('');
  const likes: FitnessLikes = cfg.likes || { types: [], sports: [] };
  const setLikes = (next: FitnessLikes) => setCfg((c) => ({ ...c, likes: next }));
  // Exercises for the picked training types (and muscle focus): the next layer of choice under the types.
  const [typeExercises, setTypeExercises] = useState<ActivityPick[] | null>(null);
  const likedCats = likedCategories(likes);
  const focusMuscle = (likes.muscles || [])[0] || null;
  useEffect(() => {
    if (!likedCats.length) { setTypeExercises(null); return; }
    let live = true; setTypeExercises(null);
    Promise.all((likes.muscles?.length ? likes.muscles : [null]).map((m) => searchActivities(accessToken, { categories: likedCats, muscle: m, limit: 24 }).catch(() => [])))
      .then((lists) => { if (live) setTypeExercises([...new Map(lists.flat().map((a) => [a.id, a])).values()]); });
    return () => { live = false; };
  }, [accessToken, likedCats.join(), (likes.muscles || []).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { searchActivities(accessToken, { categories: ['Sports'], limit: 120 }).then((list) => setSportsList([...list].sort((a, b) => a.name.localeCompare(b.name)))).catch(() => setSportsList([])); }, [accessToken]);

  useEffect(() => { listBuilderMeta(accessToken, ownerId).then(setMeta).catch(() => {}); }, [accessToken, ownerId]);
  useEffect(() => {
    if (!initialProtocolId || !meta[initialProtocolId]?.builder_config) return;
    setCfg({ ...emptyFitness(), ...structuredClone(meta[initialProtocolId].builder_config) });
    setName(protocols.find((p) => p.id === initialProtocolId)?.name || 'Fitness plan');
    setProtocolId(initialProtocolId);
  }, [initialProtocolId, meta]);
  useEffect(() => {
    if (adding == null) return;
    const timer = setTimeout(() => { searchActivities(accessToken, { query, muscle, categories: query || muscle ? undefined : ['Strength', 'Gym', 'Calisthenics', 'Cardio', 'Hiit', 'Stretch', 'Fitness'], limit: 24 }).then(setResults).catch((e) => { setResults([]); setMessage(String(e.message || e)); }); }, 250);
    return () => clearTimeout(timer);
  }, [adding, query, muscle, accessToken]);

  const run = async (label: string, work: () => Promise<void>) => { setBusy(true); setMessage(label); try { await work(); } catch (e) { const failedId = (e as { protocolId?: string }).protocolId; if (failedId) setProtocolId(failedId); setMessage(`Failed: ${(e as Error).message}`); setBusy(false); return; } setBusy(false); };
  const draft = () => run('Building the week from catalog activities…', async () => { const sessions = await draftFitnessWeek(accessToken, cfg.goal, cfg.level, cfg.minutes, cfg.goal === 'face' ? undefined : likes, cfg.schedule); setCfg((c) => ({ ...c, sessions })); setMessage('Week drafted. Edit sessions, sets and reps below.'); });
  const save = () => run('Saving to Protocols…', async () => {
    const { protocol, metaSaved } = await saveFitnessProtocol(accessToken, ownerId, protocolId, name.trim() || `${goal.label} week`, cfg);
    setProtocolId(protocol.id); setMeta((m) => ({ ...m, [protocol.id]: { builder_kind: 'fitness', builder_config: cfg } })); onSaved(protocol);
    setMessage(metaSaved ? 'Saved as a Protocol.' : 'Saved the sessions. The fitness settings could not be stored on this database yet.');
  });
  const load = (p: AdminProtocol) => { const c = meta[p.id]?.builder_config; if (c) { setCfg({ ...emptyFitness(), ...c }); setName(p.name); setProtocolId(p.id); setMessage(''); } };
  const patchSession = (i: number, patch: Partial<FitnessSession>) => setCfg((c) => ({ ...c, sessions: c.sessions.map((s, j) => j === i ? { ...s, ...patch } : s) }));
  const totalMinutes = cfg.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);

  return <div>
    <Header Icon={Dumbbell} kicker="Build" title="Fitness planner" copy="Choose a goal and level for a suggested weekly split, then shape each session with activities from the catalog." />
    <SavedList kind="fitness" protocols={initialProtocolId ? protocols.filter((p) => p.id === initialProtocolId) : protocols} meta={meta} activeId={protocolId} onPick={load} onOpen={onOpen} />
    <div style={{ ...card, marginBottom: 14 }}>
      <span style={label}>Goal</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{FITNESS_GOALS.map((g) => <button key={g.id} type="button" onClick={() => { setCfg((c) => ({ ...c, goal: g.id })); if (!protocolId) setName(`${g.label} week`); }} style={iconChip(g.id === cfg.goal)}><IconLabel Icon={GOAL_ICON[g.id]}>{g.label}</IconLabel></button>)}</div>
      <p style={{ color: muted, fontSize: 12, margin: '10px 0 0' }}>{goal.note} Suggested: {goal.days.length} sessions a week.</p>
    </div>
    <div style={{ ...card, marginBottom: 14 }}>
      <span style={label}>What they like to do</span>
      {goal.id === 'face' ? <p style={{ color: muted, fontSize: 12, margin: 0 }}>Face training is its own routine: sessions use face and jaw exercises, so training types and sports don't apply.</p> : <>
      <div role="group" aria-label="Training types" style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{[...TRAINING_TYPES].sort((a, b) => Number((GOAL_TYPES[goal.id] || []).includes(b.id)) - Number((GOAL_TYPES[goal.id] || []).includes(a.id))).map((t) => { const on = likes.types.includes(t.id); const suits = (GOAL_TYPES[goal.id] || []).includes(t.id); return <button key={t.id} type="button" aria-pressed={on} title={suits ? `Suits ${goal.label.toLowerCase()}` : undefined} onClick={() => setLikes({ ...likes, types: on ? likes.types.filter((x) => x !== t.id) : [...likes.types, t.id], exercises: on ? (likes.exercises || []).filter((e) => !TRAINING_TYPES.find((x) => x.id === t.id)!.categories.includes(e.category || '')) : likes.exercises })} style={{ ...iconChip(on), opacity: on || suits || !(GOAL_TYPES[goal.id] || []).length ? 1 : 0.62 }}><IconLabel Icon={TYPE_ICON[t.id]}>{t.label}{suits && !on ? <span style={{ color: acid, marginLeft: 4 }}>•</span> : null}</IconLabel></button>; })}</div>
      {(GOAL_TYPES[goal.id] || []).length > 0 && <p style={{ color: muted, fontSize: 11, margin: '6px 0 0' }}><span style={{ color: acid }}>•</span> suits {goal.label.toLowerCase()}</p>}
      {likedCats.length > 0 && <div style={{ borderLeft: `2px solid ${acid}`, padding: '4px 0 4px 12px', margin: '14px 0 0' }}>
        {likedCats.some((c) => ['Strength', 'Gym', 'Fitness', 'Calisthenics'].includes(c)) && <><span style={{ ...label, margin: '0 0 6px' }}>Muscle focus{likes.muscles?.length ? ` · ${likes.muscles.length}` : ' · whole body'}</span>
          <div role="group" aria-label="Muscle focus" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>{MUSCLE_GROUPS.filter((m) => m.id !== 'face').map((m) => { const on = (likes.muscles || []).includes(m.id); return <button key={m.id} type="button" aria-pressed={on} onClick={() => setLikes({ ...likes, muscles: on ? (likes.muscles || []).filter((x) => x !== m.id) : [...(likes.muscles || []), m.id] })} style={{ ...chip(on), padding: '4px 9px', fontSize: 10 }}>{m.label}</button>; })}</div></>}
        <span style={{ ...label, margin: '0 0 6px' }}>{TRAINING_TYPES.filter((t) => likes.types.includes(t.id) && t.id !== 'recovery').map((t) => t.label).join(' + ')} exercises{focusMuscle ? ` · ${(likes.muscles || []).map((m) => MUSCLE_GROUPS.find((x) => x.id === m)?.label).join(', ')}` : ''}{likes.exercises?.length ? ` · ${likes.exercises.length} picked` : ''}</span>
        <div role="group" aria-label="Exercises for the picked types" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 132, overflowY: 'auto' }}>
          {!typeExercises ? <span style={{ color: muted, fontSize: 12 }}>Loading exercises…</span> : !typeExercises.length ? <span style={{ color: muted, fontSize: 12 }}>No catalog exercises for this mix yet.</span>
            : [...new Map([...(likes.exercises || []), ...typeExercises].map((a) => [a.id, a])).values()].map((a) => { const on = (likes.exercises || []).some((x) => x.id === a.id); return <button key={a.id} type="button" aria-pressed={on} onClick={() => setLikes({ ...likes, exercises: on ? (likes.exercises || []).filter((x) => x.id !== a.id) : [...(likes.exercises || []), a] })} style={{ ...iconChip(on), padding: '5px 10px', fontSize: 10 }}>{a.name}</button>; })}
        </div>
        <p style={{ color: muted, fontSize: 11, margin: '6px 0 0' }}>Picked exercises go first in every session they fit; the rest are filled from the catalog.</p>
      </div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '16px 0 8px' }}>
        <span style={{ ...label, margin: 0 }}>Sports{likes.sports.length ? ` · ${likes.sports.length} picked` : ''}</span>
        <div style={{ position: 'relative', width: 200 }}><Search size={12} color={muted} style={{ position: 'absolute', left: 9, top: 10 }} /><input aria-label="Filter sports" placeholder="Filter sports" value={sportFilter} onChange={(e) => setSportFilter(e.target.value)} style={{ ...input, height: 32, fontSize: 12, paddingLeft: 27 }} /></div>
      </div>
      <div role="group" aria-label="Sports" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 168, overflowY: 'auto' }}>
        {!sportsList.length && <span style={{ color: muted, fontSize: 12 }}>Loading sports from the catalog…</span>}
        {/* Picked sports stay visible even when the filter hides them. */}
        {[...new Map([...sportsList, ...likes.sports].map((s) => [s.id, s])).values()].sort((a, b) => a.name.localeCompare(b.name)).filter((s) => likes.sports.some((x) => x.id === s.id) || s.name.toLowerCase().includes(sportFilter.trim().toLowerCase())).map((s) => { const on = likes.sports.some((x) => x.id === s.id); return <button key={s.id} type="button" aria-pressed={on} onClick={() => setLikes({ ...likes, sports: on ? likes.sports.filter((x) => x.id !== s.id) : [...likes.sports, s] })} style={{ ...iconChip(on), padding: '5px 10px', fontSize: 10, gap: 5 }}><IconLabel Icon={sportIcon(s.name)} size={12}>{s.name}</IconLabel></button>; })}
      </div>
      <p style={{ color: muted, fontSize: 12, margin: '10px 0 0' }}>{[
        likes.types.some((t) => t !== 'recovery') && 'Sessions use the picked training types where they fit.',
        likes.sports.length && (goal.pattern.some((p) => p.categories.includes('Cardio') && !p.categories.includes('Hiit')) ? 'Picked sports take over the cardio days.' : 'A sports day is added to the week.'),
        likes.types.includes('recovery') && 'Harder sessions end with a recovery activity such as an ice bath or sauna.',
      ].filter(Boolean).join(' ') || 'Pick training types and sports, then draft the week to build from them.'}</p>
      </>}
      {/* The week as it stands: every choice above adds, removes or reshapes these sessions. */}
      <div style={{ marginTop: 14 }}><span style={{ ...label, margin: '0 0 6px' }}>Your week so far</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{planFitnessWeek(goal, goal.id === 'face' ? undefined : likes, cfg.schedule).map((p, i) => <span key={i} style={{ border: `1px solid ${line}`, padding: '5px 9px', fontSize: 11 }}><span style={{ color: acid }}>{WEEK.find((w) => w.day === p.day)?.short}</span> · {p.sport ? p.sport.name : p.template.title}{!p.sport && p.template.categories.length ? <span style={{ color: muted }}> · {p.template.categories.join(', ')}</span> : null}{p.template.muscles?.length && goal.id !== 'face' && likes.muscles?.length ? <span style={{ color: muted }}> · {[...new Set(p.template.muscles)].map((m) => MUSCLE_GROUPS.find((x) => x.id === m)?.label).join(', ')}</span> : null}</span>)}</div>
      </div>
    </div>
    {(() => {
      // Training fuel: the same food/supplement catalog as the Diet planner, timed around every session.
      const fuel: TrainingFuel = cfg.fuel || defaultFuel();
      const setFuel = (patch: Partial<TrainingFuel>) => setCfg((c) => ({ ...c, fuel: { ...(c.fuel || defaultFuel()), ...patch } }));
      return <div style={{ ...card, marginBottom: 14 }}>
        <span style={label}>Training fuel</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
          {(['pre', 'post'] as const).map((when) => <div key={when}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: muted, fontSize: 11, marginBottom: 6 }}>{when === 'pre' ? 'Before each session' : 'After each session'}
              <input type="number" min={0} step={5} aria-label={`Minutes ${when === 'pre' ? 'before' : 'after'} each session`} value={when === 'pre' ? fuel.preMinutes : fuel.postMinutes} onChange={(e) => setFuel(when === 'pre' ? { preMinutes: Number(e.target.value) || 0 } : { postMinutes: Number(e.target.value) || 0 })} style={{ ...input, height: 28, width: 58, fontSize: 11, padding: '0 6px' }} /> min</label>
            <SupplementPicker accessToken={accessToken} title={when === 'pre' ? 'pre-workout fuel' : 'post-workout fuel'} items={fuel[when]} onChange={(items) => setFuel({ [when]: items })} />
          </div>)}
        </div>
        <p style={{ color: muted, fontSize: 12, margin: '10px 0 0' }}>Saved as timed items on every training day, linked to the catalog like Diet supplements.</p>
      </div>;
    })()}
    {(() => {
      // When to train: workdays vs other days, a time of day for each, and rest days. Drafting uses all of it.
      const sch: FitnessSchedule = cfg.schedule || defaultSchedule();
      const setSch = (patch: Partial<FitnessSchedule>) => setCfg((c) => ({ ...c, schedule: { ...(c.schedule || defaultSchedule()), ...patch } }));
      const toggle = (list: number[], day: number) => list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort();
      const dayChips = (title: string, value: number[], onChange: (v: number[]) => void) => <div><span style={label}>{title}</span><div role="group" aria-label={title} style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{WEEK.map((w) => <button key={w.day} type="button" aria-pressed={value.includes(w.day)} onClick={() => onChange(toggle(value, w.day))} style={{ ...chip(value.includes(w.day)), padding: '5px 9px', fontSize: 10 }}>{w.short}</button>)}</div></div>;
      const timeChips = (title: string, value: TrainTime, onChange: (v: TrainTime) => void) => <div><span style={label}>{title}</span><div role="group" aria-label={title} style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{TRAIN_TIMES.map((t) => <button key={t.id} type="button" aria-pressed={value === t.id} onClick={() => onChange(t.id)} style={{ ...iconChip(value === t.id), padding: '5px 10px', fontSize: 10, gap: 5 }}><IconLabel Icon={t.id === 'morning' ? Sunrise : t.id === 'lunch' ? Sun : Moon} size={12}>{t.label} <span style={{ opacity: .7 }}>· {resolveTiming(t.timing)}</span></IconLabel></button>)}</div></div>;
      const time = (id: TrainTime) => TRAIN_TIMES.find((t) => t.id === id)!.label.toLowerCase();
      return <div style={{ ...card, marginBottom: 14 }}>
        <span style={{ ...label, color: acid }}>When to train</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
          {dayChips('Workdays', sch.workdays, (workdays) => setSch({ workdays }))}
          {timeChips('On workdays', sch.workday, (workday) => setSch({ workday }))}
          {timeChips('On other days', sch.other, (other) => setSch({ other }))}
          {dayChips('Rest days', sch.restDays, (restDays) => setSch({ restDays }))}
        </div>
        <p style={{ color: muted, fontSize: 12, margin: '10px 0 0' }}>Drafted sessions train in the {time(sch.workday)} on workdays and the {time(sch.other)} on other days{sch.restDays.length ? `, and move off ${sch.restDays.map((d) => WEEK.find((w) => w.day === d)?.short).join(', ')}` : ''}. Every session starts with stretches for the muscles it works.</p>
      </div>;
    })()}
    <LinkedDiet accessToken={accessToken} protocolId={protocolId} fit={cfg} meta={meta} protocols={protocols} onOpen={onOpen} />
    <div style={{ ...card, marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, alignItems: 'end' }}>
      <label><span style={label}>Name</span><input style={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div><span style={label}>Level</span><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{(['beginner', 'intermediate', 'advanced'] as const).map((l) => <button key={l} type="button" onClick={() => setCfg((c) => ({ ...c, level: l }))} style={{ ...iconChip(cfg.level === l), padding: '6px 9px', fontSize: 10, gap: 5, textTransform: 'capitalize' }}><IconLabel Icon={LEVEL_ICON[l]} size={12}>{l}</IconLabel></button>)}</div></div>
      <label><span style={label}>Minutes / session</span><input style={input} type="number" min={10} step={5} value={cfg.minutes} onChange={(e) => setCfg({ ...cfg, minutes: Number(e.target.value) || 0 })} /></label>
      <div><span style={label}>This week</span><div style={{ fontFamily: serif, fontSize: 22 }}>{cfg.sessions.length} sessions · {totalMinutes} min</div></div>
    </div>
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
      <button type="button" style={btn} disabled={busy} onClick={draft}><Sparkles size={13} /> {cfg.sessions.length ? 'Redraft week' : 'Draft week'}</button>
      <button type="button" style={btn} disabled={busy || !cfg.sessions.length} onClick={() => setReview(reviewFitness(cfg))}>Review &amp; {protocolId ? 'update' : 'save'}</button>
      {protocolId && <button type="button" style={ghost} onClick={() => onOpen(protocolId)}>Open in editor</button>}
      <Status busy={busy} message={message} />
    </div>
    {review && <ReviewPanel notes={review.notes} conflicts={review.conflicts} blocking={review.blocking} busy={busy} onClose={() => setReview(null)} saveLabel={review.conflicts.length ? 'Save with conflicts flagged' : protocolId ? 'Update Protocol' : 'Save as Protocol'} onSave={() => { setReview(null); save(); }} />}
    {cfg.sessions.some((x) => x.exercises.length) && (() => {
      // Share of the week's exercises per muscle group; groups with none show 0% so gaps are visible.
      const all = cfg.sessions.flatMap((x) => x.exercises.map(muscleGroupOf));
      const muscles = MUSCLE_GROUPS.map((g) => g.label as string).filter((g) => g !== 'Full body' && (g !== 'Face' || all.includes('Face')) && (g !== 'Neck' || all.includes('Neck')));
      const count = (g: string) => all.filter((x) => x === g || (x === 'Full body')).length;
      const worked = muscles.filter((g) => count(g) > 0).length;
      return <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ ...label, color: acid }}>Muscles worked this week · {worked} of {muscles.length} groups · {all.length} exercises</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '6px 16px' }}>{muscles.map((g) => { const pct = all.length ? Math.round(count(g) / all.length * 100) : 0; return <div key={g} style={{ fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: pct ? ink : '#E88A7A' }}><span>{g}</span><span>{pct}%</span></div>
          <div style={{ height: 4, background: 'rgba(245,242,234,.1)', marginTop: 3 }}><div style={{ height: 4, width: `${Math.min(100, pct * 2.5)}%`, background: pct ? acid : 'transparent' }} /></div>
        </div>; })}</div>
        {all.some((x) => x === 'Cardio' || x === 'Mobility') && <div style={{ color: muted, fontSize: 10, marginTop: 8 }}>Also {all.filter((x) => x === 'Cardio').length} cardio and {all.filter((x) => x === 'Mobility').length} mobility exercises. Full-body moves count toward every group.</div>}
      </div>;
    })()}
    {(() => { const open = detail && cfg.sessions[detail.s]?.exercises[detail.k]; return <div className={`g-fit-split${open ? ' has-detail' : ''}`}>
    <div style={{ overflowX: 'auto', minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(150px,1fr))', gap: 6, minWidth: 1080 }}>
        {WEEK.map(({ day, short }) => {
          const list = cfg.sessions.map((s, i) => ({ s, i })).filter(({ s }) => s.day === day);
          return <div key={day} style={{ border: `1px solid ${line}`, minHeight: 260, padding: 8, background: list.length ? panel : 'transparent' }}>
            <div style={{ ...label, display: 'flex', justifyContent: 'space-between' }}>{short}{!list.length && <span style={{ fontWeight: 400 }}>Rest</span>}</div>
            {list.map(({ s, i }) => <div key={i} style={{ borderTop: `1px solid ${line}`, paddingTop: 8, marginTop: 6 }}>
              <div style={{ display: 'flex', gap: 4 }}><input style={{ ...input, height: 30, fontSize: 12, padding: '0 7px' }} value={s.title} onChange={(e) => patchSession(i, { title: e.target.value })} /><button type="button" title="Name the day from its muscles (Leg day, Upper body day…)" style={{ ...iconBtn, fontSize: 10 }} onClick={() => { const n = dayNameFor(s.exercises); if (n) patchSession(i, { title: n }); }}>Aa</button><button type="button" title="Remove session" style={iconBtn} onClick={() => { setDetail(null); setCfg({ ...cfg, sessions: cfg.sessions.filter((_, j) => j !== i) }); }}><Trash2 size={12} /></button></div>
              <div style={{ margin: '5px 0 3px' }}><TimingField compact value={sessionTiming(s)} onChange={(t) => patchSession(i, { anchor: t.anchor, time: t.time, offset: t.offset })} /></div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 5, alignItems: 'center', color: muted, fontSize: 10 }}>≈ {resolveTiming(sessionTiming(s))} ·
                <input style={{ ...input, height: 28, fontSize: 11, padding: '0 5px', width: 52 }} type="number" value={s.minutes} onChange={(e) => patchSession(i, { minutes: Number(e.target.value) || 0 })} title="Minutes" /> min
              </div>
              <select style={{ ...input, height: 28, fontSize: 11, padding: '0 5px', marginBottom: 6 }} value={s.intensity} onChange={(e) => patchSession(i, { intensity: e.target.value as FitnessSession['intensity'] })}><option value="low">Low intensity</option><option value="moderate">Moderate</option><option value="high">High</option></select>
              {/* Done in order: warm-up stretches, training grouped by muscle, then recovery. */}
              {s.exercises.map((e, k) => ({ e, k, g: exerciseGroup(e), rank: e.role === 'warmup' ? -1 : e.role === 'recovery' ? 999 : MUSCLE_ORDER.indexOf(muscleGroupOf(e)) })).sort((a, b) => a.rank - b.rank).map(({ e, k, g }, idx, arr) => <div key={`${e.id}-${k}`} style={{ fontSize: 11, padding: '5px 0', borderTop: '1px dashed rgba(245,242,234,.12)', background: detail?.s === i && detail.k === k ? 'rgba(199,216,163,.08)' : undefined }}>
                {(idx === 0 || arr[idx - 1].g !== g) && <div style={{ color: acid, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', margin: '2px 0 4px' }}>{g}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>{e.image ? <img src={e.image} alt="" loading="lazy" style={{ width: 34, height: 34, objectFit: 'cover', flex: 'none', border: `1px solid ${line}` }} /> : <span style={{ width: 34, height: 34, flex: 'none', border: `1px solid ${line}` }} />}<button type="button" title="See it as in the app" aria-pressed={detail?.s === i && detail.k === k} onClick={() => setDetail(detail?.s === i && detail.k === k ? null : { s: i, k })} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', color: ink, padding: 0, fontSize: 11, textAlign: 'left', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(245,242,234,.25)', textUnderlineOffset: 3 }}>{e.name}</button><button type="button" aria-label={`Remove ${e.name}`} style={iconBtn} onClick={() => { setDetail(null); patchSession(i, { exercises: s.exercises.filter((_, m) => m !== k) }); }}><X size={11} /></button></div>
                <div style={{ display: 'flex', gap: 3, marginTop: 3, color: muted, alignItems: 'center' }}>
                  <input style={{ ...input, height: 24, width: 34, fontSize: 10, padding: '0 3px' }} value={e.sets ?? ''} placeholder="sets" onChange={(ev) => patchSession(i, { exercises: s.exercises.map((x, m) => m === k ? { ...x, sets: Number(ev.target.value) || null } : x) })} />×
                  <input style={{ ...input, height: 24, width: 48, fontSize: 10, padding: '0 3px' }} value={e.reps ?? ''} placeholder="reps" onChange={(ev) => patchSession(i, { exercises: s.exercises.map((x, m) => m === k ? { ...x, reps: ev.target.value || null } : x) })} />
                  <input style={{ ...input, height: 24, width: 38, fontSize: 10, padding: '0 3px' }} value={e.minutes ?? ''} placeholder="min" onChange={(ev) => patchSession(i, { exercises: s.exercises.map((x, m) => m === k ? { ...x, minutes: Number(ev.target.value) || null } : x) })} />
                </div>
              </div>)}
              <div style={{ marginTop: 6 }}><RulesEditor compact title="Do-checklist" rules={s.rules || []} onChange={(rules) => patchSession(i, { rules })} placeholder="e.g. Warm up for 5 minutes" /></div>
              <button type="button" onClick={() => { setAdding(i); setQuery(''); }} style={{ ...iconBtn, fontSize: 10, marginTop: 4, color: adding === i ? acid : muted }}><Plus size={11} /> Exercise</button>
            </div>)}
            <button type="button" onClick={() => setCfg({ ...cfg, sessions: [...cfg.sessions, { day, ...sessionTimeFor(day, cfg.schedule), rules: [], title: 'Walk 20 minutes', minutes: cfg.minutes, intensity: 'moderate', exercises: [] }] })} style={{ ...iconBtn, fontSize: 10, marginTop: 8 }}><Plus size={11} /> Session</button>
          </div>;
        })}
      </div>
    </div>
    {open && <div className="g-fit-detail"><ActivityDetailPreview accessToken={accessToken} exercise={open} onClose={() => setDetail(null)} /></div>}
    </div>; })()}
    <div style={{ ...card, marginTop: 14 }}><RulesEditor title="Fitness checklist for the week" rules={cfg.rules || []} onChange={(rules) => setCfg((c) => ({ ...c, rules }))} placeholder="One rule per line" /></div>
    {adding != null && cfg.sessions[adding] && <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><span style={{ ...label, margin: 0 }}>Add to {WEEK.find((w) => w.day === cfg.sessions[adding].day)?.short} · {cfg.sessions[adding].title}</span><button type="button" style={iconBtn} onClick={() => setAdding(null)}><X size={14} /></button></div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}><button type="button" onClick={() => setMuscle(null)} style={{ ...chip(!muscle), padding: '5px 10px', fontSize: 10 }}>All muscles</button>{MUSCLE_GROUPS.map((g) => <button key={g.id} type="button" onClick={() => setMuscle(muscle === g.id ? null : g.id)} style={{ ...chip(muscle === g.id), padding: '5px 10px', fontSize: 10 }}>{g.label}</button>)}</div>
      <div style={{ position: 'relative', marginBottom: 10 }}><Search size={13} color={muted} style={{ position: 'absolute', left: 10, top: 13 }} /><input autoFocus style={{ ...input, paddingLeft: 30 }} placeholder="Search catalog activities" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      {muscle && !results.length && <p style={{ color: muted, fontSize: 12 }}>No catalog activities for {MUSCLE_GROUPS.find((g) => g.id === muscle)?.label} yet{muscle === 'face' ? '. Facial exercises need adding to the activity catalog.' : '.'}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 7 }}>
        {results.map((r) => <button key={r.id} type="button" onClick={() => { const s = cfg.sessions[adding]; const timed = /cardio|sports|stretch|recovery|yoga/i.test(r.category || '') || muscleGroupOf(r) === 'Face'; patchSession(adding, { exercises: [...s.exercises, { ...r, sets: timed ? null : 3, reps: timed ? null : '10', rest_seconds: timed ? null : 75, minutes: timed ? r.minutes || 10 : null }] }); }} style={{ ...card, padding: 8, display: 'flex', gap: 8, textAlign: 'left', color: ink, cursor: 'pointer' }}>
          {r.image ? <img src={r.image} alt="" style={{ width: 38, height: 38, objectFit: 'cover', flex: 'none' }} /> : <div style={{ width: 38, height: 38, flex: 'none', border: `1px solid ${line}` }} />}
          <span><span style={{ display: 'block', fontSize: 12 }}>{r.name}</span><span style={{ color: muted, fontSize: 10 }}>{muscleGroupOf(r)} · {r.category}</span></span>
        </button>)}
      </div>
    </div>}
  </div>;
}

/* ───────────────────────── Combine ───────────────────────── */

export function CombineProtocols({ accessToken, ownerId, protocols, leads, onSaved, onOpen, onClose }: CommonProps & { leads: GuideLead[]; onClose: () => void }) {
  const [meta, setMeta] = useState<SavedMeta>({});
  const [person, setPerson] = useState('');
  const [leadId, setLeadId] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [clashes, setClashes] = useState<Clash[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [combinedReview, setCombinedReview] = useState<{ notes: ReviewNote[]; blocking: ReviewNote[]; conflicts: Conflict[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { listBuilderMeta(accessToken, ownerId).then(setMeta).catch(() => {}); }, [accessToken, ownerId]);
  useEffect(() => {
    if (!chosen.length) { setClashes(null); setCombinedReview(null); return; }
    let live = true;
    Promise.all(chosen.map((id) => listProtocolItems(accessToken, id))).then((lists: AdminProtocolItem[][]) => {
      if (!live) return;
      setCounts(Object.fromEntries(chosen.map((id, i) => [id, lists[i].filter((it) => !it.parent_protocol_item_id).length])));
      setClashes(findClashes(lists));
      setCombinedReview(reviewCombined(chosen.map((id, i) => ({ name: protocols.find((p) => p.id === id)?.name || 'Protocol', items: lists[i] }))));
    }).catch(() => {});
    return () => { live = false; };
  }, [chosen, accessToken]);

  const kindOf = (p: AdminProtocol) => meta[p.id]?.builder_kind || null;
  const groups: [string, AdminProtocol[]][] = [
    ['Diets', protocols.filter((p) => kindOf(p) === 'diet')],
    ['Fitness routines', protocols.filter((p) => kindOf(p) === 'fitness')],
    ['Personal Protocols', protocols.filter((p) => kindOf(p) === 'personal')],
    ['Other protocols', protocols.filter((p) => !kindOf(p))],
  ];
  const name = person.trim() || leads.find((l) => l.id === leadId)?.name || '';
  const create = async () => {
    setBusy(true); setMessage('Combining steps into one Protocol…');
    try {
      const { protocol } = await combineProtocols(accessToken, ownerId, { name, lead_id: leadId || null }, protocols.filter((p) => chosen.includes(p.id)));
      onSaved(protocol); onOpen(protocol.id);
    } catch (e) { setMessage(`Failed: ${(e as Error).message}`); }
    setBusy(false);
  };

  return <div style={{ ...card, margin: '24px 0' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ ...label, color: acid, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><Combine size={13} /> Combine into one personal Protocol</div><button type="button" style={iconBtn} onClick={onClose}><X size={14} /></button></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, margin: '14px 0' }}>
      <label><span style={label}>Person (lead)</span><select style={input} value={leadId} onChange={(e) => { setLeadId(e.target.value); setPerson(''); }}><option value="">Choose a lead…</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label><span style={label}>Or a name</span><input style={input} value={person} placeholder="e.g. Maria" onChange={(e) => { setPerson(e.target.value); setLeadId(''); }} /></label>
    </div>
    {groups.map(([title, list]) => list.length ? <div key={title} style={{ marginBottom: 12 }}>
      <span style={label}>{title}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{list.map((p) => { const on = chosen.includes(p.id); return <button key={p.id} type="button" onClick={() => setChosen((current) => current.includes(p.id) ? current.filter((x) => x !== p.id) : [...current, p.id])} style={chip(on)}>{p.name}{on && counts[p.id] != null ? ` · ${counts[p.id]} steps` : ''}</button>; })}</div>
    </div> : null)}
    {clashes && (clashes.length ? <div style={{ color: warn, fontSize: 12, margin: '8px 0 12px' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700 }}><AlertTriangle size={13} /> {clashes.length} time clash{clashes.length > 1 ? 'es' : ''}. You can fix them in the editor after combining.</div>
      {clashes.slice(0, 6).map((c) => <div key={`${c.day}${c.time}`} style={{ marginTop: 3 }}>{c.day} {c.time}: {c.names.join(' / ')}</div>)}
    </div> : <p style={{ color: acid, fontSize: 12 }}>No time clashes between the chosen protocols.</p>)}
    {combinedReview && chosen.length > 1 && <ReviewPanel notes={combinedReview.notes} conflicts={combinedReview.conflicts} blocking={combinedReview.blocking} notesTitle="Fixed by the shared Protocol rules when combining:" />}
    <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
      <button type="button" style={btn} disabled={busy || !name || chosen.length < 2 || !!combinedReview?.blocking.length} onClick={create}>Create {name ? `${name}’s` : 'personal'} Protocol</button>
      <Status busy={busy} message={message || (chosen.length < 2 ? 'Choose at least two protocols.' : 'Steps are copied as they are; one Start Sleep / End Sleep pair is kept or added. Conflicts stay flagged for you to decide.')} />
    </div>
  </div>;
}
