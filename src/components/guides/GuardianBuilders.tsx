import { Fragment, useEffect, useMemo, useState } from 'react';
import { Dumbbell, Loader2, Plus, Search, Sparkles, Trash2, Utensils, Users, X, Combine, AlertTriangle, Apple, Bean, Beef, Carrot, Egg, Fish, Grape, Leaf, MilkOff, Moon, Salad, Scale, Sun, Sunrise, WheatOff, type LucideIcon } from 'lucide-react';
import { listProtocolItems, type AdminProtocol, type AdminProtocolItem } from '../../utils/protocolAdmin';
import type { GuideLead, GuideRecipe } from '../../utils/guidePortal';
import { smartFill, type RecipeIdea } from '../../utils/dietPlanner';
import { nutrientsForTier, type Tier } from '../../utils/recipeNutrients';
import { TIERS, tierLabel, useEssential90 } from './RecipeInsights';
import { DietFastingControls, FastingDayCell, WeeklySupplementRows, fastHatch } from './DietSchedule';
import { DietNutritionPanel } from './DietNutritionPanel';
import { DietLocationHeader } from './DietLocationHeader';
import { plannerWeek, sunriseForDate, validPlannerLocation } from '../../utils/plannerSunrise';
import { aggregateDiet, dietSelections, loadDietAnalysis, type DietAnalysis } from '../../utils/dietNutrition';
import {
  MUSCLE_GROUPS, dayNameFor, muscleGroupOf, type MuscleGroupId, mealDrinks, mealPickKey, selectedServings, fitsSlot, DIET_FRAMEWORKS, FITNESS_GOALS, FRAMEWORK_RULES, mealTiming, resolveTiming, sessionTiming, mealIsFasting, fastingDrinkAllowed, type Anchor, type Timing, MEAL_SLOTS, WEEK, combineProtocols, draftFitnessWeek, findClashes, guideRecipeToPick,
  dietSupportItems, isDrinkPick, SUPPLEMENT_PERIODS, listBuilderMeta, macroGrams, saveDietProtocol, saveFitnessProtocol, searchActivities, searchDietRecipes, sumNutrition,
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
const iconChip = (on: boolean): React.CSSProperties => ({ ...chip(on), display: 'inline-flex', alignItems: 'center', gap: 6 });
const card: React.CSSProperties = { border: `1px solid ${line}`, background: panel, padding: 16 };
const iconBtn: React.CSSProperties = { border: 0, background: 'transparent', color: muted, cursor: 'pointer', padding: 2, display: 'inline-flex' };

type SavedMeta = Record<string, { builder_kind: BuilderKind | null; builder_config: any }>;

interface CommonProps { accessToken: string; ownerId: string; protocols: AdminProtocol[]; initialProtocolId?: string | null; onSaved: (protocol: AdminProtocol) => void; onOpen: (protocolId: string) => void }

function Header({ kicker, title, copy, Icon }: { kicker: string; title: string; copy: string; Icon: typeof Users }) {
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
function RulesEditor({ title, rules, onChange, placeholder, compact }: { title: string; rules: string[]; onChange: (rules: string[]) => void; placeholder: string; compact?: boolean }) {
  const [text, setText] = useState(rules.join('\n'));
  useEffect(() => { if (text.split('\n').map((x) => x.trim()).filter(Boolean).join('\n') !== rules.join('\n')) setText(rules.join('\n')); }, [rules.join('\n')]); // eslint-disable-line react-hooks/exhaustive-deps
  return <label style={{ display: 'block' }}><span style={{ ...label, marginBottom: compact ? 3 : 7, fontSize: compact ? 9 : 10 }}>{title}</span>
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
  const weekDates=city?plannerWeek(city.timezone,now):[];
  const [name, setName] = useState('Mediterranean week');
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [meta, setMeta] = useState<SavedMeta>({});
  const [picking, setPicking] = useState<string | null>(null);
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
    loadDietAnalysis(accessToken, selections, recipes, controller.signal).then((next) => { if (live) setAnalysis(next); })
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
    <Header Icon={Utensils} kicker="Build" title="Diet" copy="Plan meals and drinks from your recipes and the published recipe database. Daily and weekly macros, micronutrients and hazards use recorded nutrition and selected servings; missing data stays unknown." />
    <SavedList kind="diet" protocols={initialProtocolId ? protocols.filter((p) => p.id === initialProtocolId) : protocols} meta={meta} activeId={protocolId} onPick={load} onOpen={onOpen} />
    <div style={{ ...card, marginBottom: 14 }}>
      <span style={label}>Diet framework</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{DIET_FRAMEWORKS.map((f) => { const Icon = FRAMEWORK_ICON[f.id]; return <button key={f.id} type="button" onClick={() => pickFramework(f.id)} style={iconChip(f.id === cfg.framework)}>{Icon && <Icon size={13} strokeWidth={1.8} aria-hidden="true" />}{f.label}</button>; })}</div>
      <p style={{ color: muted, fontSize: 12, margin: '10px 0 0' }}>{framework.note}</p>
    </div>
    <div style={{ ...card, marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, alignItems: 'end' }}>
      <label><span style={label}>Name</span><input style={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label><span style={label}>kcal / day</span><input style={input} type="number" min={1000} step={50} value={cfg.kcal} onChange={(e) => setCfg({ ...cfg, kcal: Number(e.target.value) || 0 })} /></label>
      {(['protein', 'carbs', 'fat'] as const).map((k) => <label key={k}><span style={label}>{k} %</span><input style={input} type="number" min={0} max={100} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) || 0 })} /></label>)}
      <div><span style={label}>Meals</span><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{MEAL_SLOTS.map((s) => <button key={s.id} type="button" onClick={() => setCfg({ ...cfg, slots: cfg.slots.includes(s.id) ? cfg.slots.filter((x) => x !== s.id) : [...cfg.slots, s.id] })} style={{ ...iconChip(cfg.slots.includes(s.id)), padding: '5px 9px', fontSize: 10, gap: 5 }}>{(() => { const Icon = MEAL_ICON[s.id]; return Icon && <Icon size={12} strokeWidth={1.8} aria-hidden="true" />; })()}{s.label}</button>)}</div></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', borderTop: `1px solid ${line}`, borderBottom: `1px solid ${line}`, marginBottom: 18 }}>
      {([['Energy', 'energy_kcal', 'kcal'], ['Protein', 'protein_g', 'g'], ['Carbs', 'carbohydrates_g', 'g'], ['Fat', 'fats_g', 'g']] as const).map(([l, k, u]) => <div key={k} style={{ padding: '14px 14px 14px 0', borderRight: `1px solid ${line}` }}>
        <div style={{ ...label, margin: 0 }}>{l}</div>
        <div style={{ fontFamily: serif, fontSize: 26 }}>{nutritionReport.week.nutrients[k]?.amount == null ? 'Unknown' : Math.round(week[k] || 0).toLocaleString()} <span style={{ fontSize: 13, color: muted }}>/ {(targets[k] * 7).toLocaleString()} {u} week</span></div>
        {nutritionReport.week.nutrients[k]?.known < nutritionReport.week.count && <div style={{ color: warn, fontSize: 10 }}>Recorded subtotal · incomplete</div>}
        <div style={{ color: muted, fontSize: 11 }}>{targets[k].toLocaleString()} {u} per day</div>
        <Bar value={week[k] || 0} target={targets[k] * 7} />
      </div>)}
    </div>
    <DietNutritionPanel report={nutritionReport} loading={analysisBusy} error={analysisError} />
    {macroSum !== 100 && <p style={{ color: warn, fontSize: 12 }}>Macros add up to {macroSum}% of energy. Adjust them to 100%.</p>}
    <section aria-label="Weekly diet planner">
    <h2 style={{ fontSize: 16 }}>Weekly planner · meals, drinks &amp; supplements</h2>
    <DietLocationHeader city={city} now={now} onChange={location=>setCfg(c=>({...c,location}))} />
    <DietFastingControls cfg={cfg} setCfg={setCfg} />
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
      <span style={{ display: 'flex', gap: 5 }}>{TIERS.map((t) => <button key={t} type="button" onClick={() => setTier(t)} title="Rank meals by this essential-nutrient set and show each day's coverage" style={{ ...chip(t === tier), padding: '6px 10px', fontSize: 10 }}>{tierLabel(t)}</button>)}</span>
      <button type="button" style={btn} disabled={busy || !slots.length} onClick={autoFill}><Sparkles size={13} /> Auto-fill week</button>
      <button type="button" style={ghost} disabled={busy} onClick={() => setCfg({ ...cfg, plan: {}, drinkPlan: {} })}>Clear meals &amp; drinks</button>
      <button type="button" style={btn} disabled={busy || (!selections.length && !dietSupportItems(cfg).length)} onClick={() => setReview(reviewDiet(cfg))}>Review &amp; {protocolId ? 'update' : 'save'}</button>
      {protocolId && <button type="button" style={ghost} onClick={() => onOpen(protocolId)}>Open in editor</button>}
      <Status busy={busy} message={message} />
    </div>
    {review && <ReviewPanel notes={review.notes} conflicts={review.conflicts} blocking={review.blocking} busy={busy} onClose={() => setReview(null)} saveLabel={review.conflicts.length ? 'Save with conflicts flagged' : protocolId ? 'Update Protocol' : 'Save as Protocol'} onSave={() => { setReview(null); save(); }} />}
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `132px repeat(7,minmax(118px,1fr))`, gap: 6, minWidth: 990 }}>
        <div />{WEEK.map((w, i) => <div key={w.day} style={{ ...label, margin: 0 }}>{w.short}{city&&<div style={{fontSize:10,letterSpacing:0,textTransform:'none',fontWeight:400,margin:'5px 0',color:acid}}>{weekDates[i]}<br/>Sunrise {sunriseForDate(city,weekDates[i])?`≈ ${sunriseForDate(city,weekDates[i])}`:'— (no sunrise)'}</div>}<div style={{ color: ink, fontSize: 11, letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>{nutritionReport.days[i].nutrients.energy_kcal.amount == null ? 'Unknown' : Math.round(dayTotals[i].energy_kcal)} / {cfg.kcal} kcal</div><Bar value={dayTotals[i].energy_kcal} target={cfg.kcal} />
          <div style={{ color: ink, fontSize: 10, letterSpacing: 0, textTransform: 'none', fontWeight: 400, marginTop: 4 }}>P {nutritionReport.days[i].nutrients.protein_g.amount == null ? 'Unknown' : Math.round(dayTotals[i].protein_g)} / {targets.protein_g} g</div><Bar value={dayTotals[i].protein_g} target={targets.protein_g} />
          {nutritionReport.days[i].count > 0 && <div title={reports[i].gaps.map((g) => g.label).join(', ')} style={{ fontSize: 10, letterSpacing: 0, textTransform: 'none', fontWeight: 400, marginTop: 4, color: reports[i].coverage >= 60 ? acid : warn }}>{tierLabel(tier)} recorded: {reports[i].coverage}%{reports[i].incomplete && <span style={{ display: 'block' }}>Incomplete data</span>}{reports[i].gaps.length ? <span style={{ display: 'block', color: muted }}>low recorded: {reports[i].gaps.slice(0, 3).map((g) => g.label).join(', ')}{reports[i].gaps.length > 3 ? ` +${reports[i].gaps.length - 3}` : ''}</span> : null}</div>}
        </div>)}
        <div style={{...label,alignSelf:'center'}}>Fasting · 24h timeline</div>{WEEK.map(w => <FastingDayCell key={w.day} cfg={cfg} day={w.day} />)}
        {SUPPLEMENT_PERIODS.map(period=><Fragment key={period.id}>
        <h3 style={{gridColumn:'1 / -1',fontSize:13,color:acid,margin:'12px 0 2px',borderTop:`1px solid ${line}`,paddingTop:12}}>{`${period.label} · meals, drinks & supplements`}</h3>
        {slots.filter(s=>period.id==='morning'?s.id==='breakfast':period.id==='afternoon'?['lunch','snack'].includes(s.id):s.id==='dinner').map((s) => [<div key={s.id} style={{ ...label, margin: 0, alignSelf: 'center' }}>{s.label}<div style={{ fontWeight: 400, margin: '4px 0 2px' }}><TimingField compact value={mealTiming(cfg, s.id)} onChange={(t) => setCfg({ ...cfg, timing: { ...cfg.timing, [s.id]: t } })} /></div><div style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>≈ {resolveTiming(mealTiming(cfg, s.id))}</div></div>, ...WEEK.map(({ day }) => {
          const key = `${day}:${s.id}`; const pick = cfg.plan[key]; const fasting = mealIsFasting(cfg,day,s.id);
          const drinks = mealDrinks(cfg,key);
          return <div key={key} aria-label={`${key} meal slot`} style={{ ...card, background:fasting?fastHatch:panel, padding: 8, minHeight: 92, borderColor: picking === key ? acid : line, position: 'relative' }}>
            {fasting && <div style={{fontSize:10,color:warn,marginBottom:6}}>Fasting · {pick?'existing meal conflicts':'no meal at this time'}</div>}
            {pick ? <>
              {pick.image && <img src={pick.image} alt="" style={{ width: '100%', height: 44, objectFit: 'cover', marginBottom: 5 }} />}
              <button type="button" disabled={fasting} aria-label={`Change ${key} meal`} onClick={() => { setPicking(key); setDrinkIndex(null); setQuery(''); }} style={{ ...iconBtn, textAlign: 'left', color: ink, fontSize: 11, lineHeight: 1.25, paddingRight: 14 }}>{pick.name}</button>
              <label style={{ fontSize: 10, display: 'block', marginTop: 5 }}>Servings <input aria-label={`${key} meal servings`} type="number" min="0.01" step="0.25" value={selectedServings(pick)} onChange={(e) => setPick(key,{ ...pick, servings: Math.max(.01,Number(e.target.value)||1) })} style={{ ...input, width: 55, height: 26, padding: 3 }} /></label>
              <div style={{ color: muted, fontSize: 10, marginTop: 3 }}>{pick.nutrition ? `${Math.round(pick.nutrition.energy_kcal)} kcal · P ${Math.round(pick.nutrition.protein_g)}` : 'No nutrition data'}{pick.healthScore != null ? ` · ♥ ${pick.healthScore}` : ''}{pick.source === 'guide' ? ' · yours' : ''}</div>
              {(analysis[mealPickKey(pick)]?.hazards || pick.hazards || pick.hazardFlags || []).slice(0, 2).map((h) => <div key={h.label} title="All hazard records are listed in the nutrition section above" style={{ fontSize: 9, marginTop: 2, color: h.level === 'high' ? '#E88A7A' : warn, display: 'flex', gap: 3, alignItems: 'center' }}><AlertTriangle size={9} /> {h.label}</div>)}
              <button type="button" title="Remove" onClick={(e) => { e.stopPropagation(); setPick(key, null); }} style={{ ...iconBtn, position: 'absolute', top: 4, right: 4 }}><X size={12} /></button>
            </> : <button type="button" aria-label={`Add ${key} meal`} disabled={fasting} onClick={() => { setPicking(key); setDrinkIndex(null); setQuery(''); }} style={{ ...iconBtn, fontSize: 11, opacity:fasting?.4:1 }}><Plus size={12} /> Add meal</button>}
            {drinks.map((d,i) => <div key={i} style={{ borderTop: `1px solid ${line}`, marginTop: 7, paddingTop: 5, fontSize: 10 }}>
              {!fastingDrinkAllowed(cfg,day,s.id,d) && <div style={{color:warn}}>Existing drink conflicts with fast</div>}
              <button type="button" onClick={() => { setPicking(key); setDrinkIndex(i); setQuery(typeof d === 'string' ? d : d.name); }} style={{ ...iconBtn, textAlign: 'left', fontSize: 10 }}>{typeof d === 'string' ? `${d} · match recipe (nutrition unknown)` : d.name}</button>
              {typeof d !== 'string' && <label style={{ display: 'block' }}>Servings <input aria-label={`${key} drink ${i+1} servings`} type="number" min="0.01" step="0.25" value={selectedServings(d)} onChange={(e) => setDrinks(key,drinks.map((x,n) => n===i ? { ...d, servings: Math.max(.01,Number(e.target.value)||1) } : x))} style={{ ...input, width: 55, height: 26, padding: 3 }} /></label>}
              <button type="button" aria-label={`Remove ${key} drink ${i+1}`} style={iconBtn} onClick={() => setDrinks(key,drinks.filter((_,n) => n!==i))}><X size={11} /></button>
            </div>)}
            <button type="button" disabled={fasting && cfg.fasting?.type==='dry'} aria-label={`Add ${key} drink`} onClick={() => { setPicking(key); setDrinkIndex(drinks.length); setQuery(fasting?'Water':''); }} style={{ ...iconBtn, fontSize: 10, marginTop: 7 }}><Plus size={11} /> {fasting?'Add plain water from recipes':'Add drink from recipes'}</button>
          </div>;
        })])}
        <WeeklySupplementRows cfg={cfg} setCfg={setCfg} accessToken={accessToken} periodId={period.id} />
        </Fragment>)}
      </div>
    </div>
    </section>
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
      <RulesEditor title="Meal checklist for the week" rules={cfg.rules || []} onChange={(rules) => setCfg((c) => ({ ...c, rules }))} placeholder={'One rule per line, e.g.\nCook with olive oil'} />
      {slots.map((s) => <RulesEditor key={s.id} title={`${s.label} do-checklist`} rules={cfg.mealRules?.[s.id] || []} onChange={(rules) => setCfg((c) => ({ ...c, mealRules: { ...c.mealRules, [s.id]: rules } }))} placeholder="e.g. Chew slowly" />)}
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
  const [muscle, setMuscle] = useState<MuscleGroupId | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ActivityPick[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const goal = FITNESS_GOALS.find((g) => g.id === cfg.goal) || FITNESS_GOALS[0];

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
  const draft = () => run('Building the week from catalog activities…', async () => { setCfg({ ...cfg, sessions: await draftFitnessWeek(accessToken, cfg.goal, cfg.level, cfg.minutes) }); setMessage('Week drafted. Edit sessions, sets and reps below.'); });
  const save = () => run('Saving to Protocols…', async () => {
    const { protocol, metaSaved } = await saveFitnessProtocol(accessToken, ownerId, protocolId, name.trim() || `${goal.label} week`, cfg);
    setProtocolId(protocol.id); setMeta((m) => ({ ...m, [protocol.id]: { builder_kind: 'fitness', builder_config: cfg } })); onSaved(protocol);
    setMessage(metaSaved ? 'Saved as a Protocol.' : 'Saved the sessions. The fitness settings could not be stored on this database yet.');
  });
  const load = (p: AdminProtocol) => { const c = meta[p.id]?.builder_config; if (c) { setCfg({ ...emptyFitness(), ...c }); setName(p.name); setProtocolId(p.id); setMessage(''); } };
  const patchSession = (i: number, patch: Partial<FitnessSession>) => setCfg((c) => ({ ...c, sessions: c.sessions.map((s, j) => j === i ? { ...s, ...patch } : s) }));
  const totalMinutes = cfg.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);

  return <div>
    <Header Icon={Dumbbell} kicker="Build" title="Fitness" copy="Choose a goal and level for a suggested weekly split, then shape each session with activities from the catalog." />
    <SavedList kind="fitness" protocols={initialProtocolId ? protocols.filter((p) => p.id === initialProtocolId) : protocols} meta={meta} activeId={protocolId} onPick={load} onOpen={onOpen} />
    <div style={{ ...card, marginBottom: 14 }}>
      <span style={label}>Goal</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{FITNESS_GOALS.map((g) => <button key={g.id} type="button" onClick={() => { setCfg({ ...cfg, goal: g.id }); if (!protocolId) setName(`${g.label} week`); }} style={chip(g.id === cfg.goal)}>{g.label}</button>)}</div>
      <p style={{ color: muted, fontSize: 12, margin: '10px 0 0' }}>{goal.note} Suggested: {goal.days.length} sessions a week.</p>
    </div>
    <div style={{ ...card, marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, alignItems: 'end' }}>
      <label><span style={label}>Name</span><input style={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div><span style={label}>Level</span><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{(['beginner', 'intermediate', 'advanced'] as const).map((l) => <button key={l} type="button" onClick={() => setCfg({ ...cfg, level: l })} style={{ ...chip(cfg.level === l), padding: '6px 9px', fontSize: 10, textTransform: 'capitalize' }}>{l}</button>)}</div></div>
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
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(150px,1fr))', gap: 6, minWidth: 1080 }}>
        {WEEK.map(({ day, short }) => {
          const list = cfg.sessions.map((s, i) => ({ s, i })).filter(({ s }) => s.day === day);
          return <div key={day} style={{ border: `1px solid ${line}`, minHeight: 260, padding: 8, background: list.length ? panel : 'transparent' }}>
            <div style={{ ...label, display: 'flex', justifyContent: 'space-between' }}>{short}{!list.length && <span style={{ fontWeight: 400 }}>Rest</span>}</div>
            {list.map(({ s, i }) => <div key={i} style={{ borderTop: `1px solid ${line}`, paddingTop: 8, marginTop: 6 }}>
              <div style={{ display: 'flex', gap: 4 }}><input style={{ ...input, height: 30, fontSize: 12, padding: '0 7px' }} value={s.title} onChange={(e) => patchSession(i, { title: e.target.value })} /><button type="button" title="Name the day from its muscles (Leg day, Upper body day…)" style={{ ...iconBtn, fontSize: 10 }} onClick={() => { const n = dayNameFor(s.exercises); if (n) patchSession(i, { title: n }); }}>Aa</button><button type="button" title="Remove session" style={iconBtn} onClick={() => setCfg({ ...cfg, sessions: cfg.sessions.filter((_, j) => j !== i) })}><Trash2 size={12} /></button></div>
              <div style={{ margin: '5px 0 3px' }}><TimingField compact value={sessionTiming(s)} onChange={(t) => patchSession(i, { anchor: t.anchor, time: t.time, offset: t.offset })} /></div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 5, alignItems: 'center', color: muted, fontSize: 10 }}>≈ {resolveTiming(sessionTiming(s))} ·
                <input style={{ ...input, height: 28, fontSize: 11, padding: '0 5px', width: 52 }} type="number" value={s.minutes} onChange={(e) => patchSession(i, { minutes: Number(e.target.value) || 0 })} title="Minutes" /> min
              </div>
              <select style={{ ...input, height: 28, fontSize: 11, padding: '0 5px', marginBottom: 6 }} value={s.intensity} onChange={(e) => patchSession(i, { intensity: e.target.value as FitnessSession['intensity'] })}><option value="low">Low intensity</option><option value="moderate">Moderate</option><option value="high">High</option></select>
              {s.exercises.map((e, k) => ({ e, k, g: muscleGroupOf(e) })).sort((a, b) => MUSCLE_ORDER.indexOf(a.g) - MUSCLE_ORDER.indexOf(b.g)).map(({ e, k, g }, idx, arr) => <div key={`${e.id}-${k}`} style={{ fontSize: 11, padding: '5px 0', borderTop: '1px dashed rgba(245,242,234,.12)' }}>
                {(idx === 0 || arr[idx - 1].g !== g) && <div style={{ color: acid, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', margin: '2px 0 4px' }}>{g}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>{e.image ? <img src={e.image} alt="" loading="lazy" style={{ width: 34, height: 34, objectFit: 'cover', flex: 'none', border: `1px solid ${line}` }} /> : <span style={{ width: 34, height: 34, flex: 'none', border: `1px solid ${line}` }} />}<span style={{ flex: 1, minWidth: 0 }}>{e.name}</span><button type="button" style={iconBtn} onClick={() => patchSession(i, { exercises: s.exercises.filter((_, m) => m !== k) })}><X size={11} /></button></div>
                <div style={{ display: 'flex', gap: 3, marginTop: 3, color: muted, alignItems: 'center' }}>
                  <input style={{ ...input, height: 24, width: 34, fontSize: 10, padding: '0 3px' }} value={e.sets ?? ''} placeholder="sets" onChange={(ev) => patchSession(i, { exercises: s.exercises.map((x, m) => m === k ? { ...x, sets: Number(ev.target.value) || null } : x) })} />×
                  <input style={{ ...input, height: 24, width: 48, fontSize: 10, padding: '0 3px' }} value={e.reps ?? ''} placeholder="reps" onChange={(ev) => patchSession(i, { exercises: s.exercises.map((x, m) => m === k ? { ...x, reps: ev.target.value || null } : x) })} />
                  <input style={{ ...input, height: 24, width: 38, fontSize: 10, padding: '0 3px' }} value={e.minutes ?? ''} placeholder="min" onChange={(ev) => patchSession(i, { exercises: s.exercises.map((x, m) => m === k ? { ...x, minutes: Number(ev.target.value) || null } : x) })} />
                </div>
              </div>)}
              <div style={{ marginTop: 6 }}><RulesEditor compact title="Do-checklist" rules={s.rules || []} onChange={(rules) => patchSession(i, { rules })} placeholder="e.g. Warm up for 5 minutes" /></div>
              <button type="button" onClick={() => { setAdding(i); setQuery(''); }} style={{ ...iconBtn, fontSize: 10, marginTop: 4, color: adding === i ? acid : muted }}><Plus size={11} /> Exercise</button>
            </div>)}
            <button type="button" onClick={() => setCfg({ ...cfg, sessions: [...cfg.sessions, { day, time: '07:00', anchor: 'clock', offset: 0, rules: [], title: 'Walk 20 minutes', minutes: cfg.minutes, intensity: 'moderate', exercises: [] }] })} style={{ ...iconBtn, fontSize: 10, marginTop: 8 }}><Plus size={11} /> Session</button>
          </div>;
        })}
      </div>
    </div>
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
