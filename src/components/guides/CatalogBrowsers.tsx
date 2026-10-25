/*
 * Read-only browsers for the ROUTINE³ catalogue, in the Activities layout (filters, search, card grid, details
 * opened below the card):
 *   CatalogRecipes     published recipes by cuisine (region), meal and diet: health score, nutrients per 100 g,
 *                      hazards and ingredients. Shown under the Guardian's own recipes.
 *   CatalogIngredients ingredients by category, with nutrients and hazards (Diet section).
 *   FitnessRoutines    the app's published fitness Protocols and their steps (Fitness section).
 */
import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertTriangle, Dumbbell, Heart, Loader2, Search, Utensils, Wheat, X } from 'lucide-react';
import { RECIPE_DIETS, browseIngredients, browseRecipes, listFitnessRoutines, listMyDietPlans, mealSlotOf, protocolDiet, recipeIngredientNames, routinePeriod, routineSteps, stepMedia, getActivityDetail, type ActivityDetail, type CatalogFood, type FitnessRoutine, type RecipeCatalogGroup, type RoutineStep } from '../../utils/protocolBuilders';
import { ProtocolHomeScreen } from '../mockups/ProtocolHomeScreen';
import { PhoneFrame } from '../mockups/PhoneFrame';
import { NUTRIENTS } from '../../utils/recipeNutrients';
import { Header } from './GuardianBuilders';
import { ProtocolCard, ProtocolCardGrid, clipCopy } from './ProtocolCard';
import { ruleGroupFor } from '../../utils/protocolRules';
import { protocolTags, type ProtocolTag } from '../../utils/protocolTags';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', acid = '#C7D8A3', panel = '#11120F', warn = '#E8B07A', danger = '#E88A7A';
const field: React.CSSProperties = { height: 40, border: `1px solid ${line}`, background: '#090A08', color: ink, padding: '0 10px', fontSize: 13 };
const tag: React.CSSProperties = { border: `1px solid ${line}`, borderRadius: 3, padding: '2px 6px', fontSize: 10, color: ink };
const kicker: React.CSSProperties = { color: acid, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', margin: '10px 0 6px' };
const MACROS: Array<[string, string, string]> = [['energy_kcal', 'Energy', 'kcal'], ['protein_g', 'Protein', 'g'], ['carbohydrates_g', 'Carbs', 'g'], ['fats_g', 'Fat', 'g'], ['fiber_g', 'Fibre', 'g'], ['sugars_g', 'Sugars', 'g'], ['salt_g', 'Salt', 'g']];
const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString() : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.0+$/, '');
const title = (k: string) => k.replace(/_(mg|mcg|ug|g|kcal)$/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const levelTone = (l: string) => (l === 'high' ? danger : l === 'moderate' || l === 'medium' ? warn : muted);

function Search_({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <label style={{ ...field, display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 240px', maxWidth: 420 }}><Search size={14} color={muted} aria-hidden="true" /><input aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ flex: 1, border: 0, background: 'transparent', color: ink, fontSize: 13, outline: 'none' }} /></label>;
}

/** Nutrients per 100 g (macros first, then every other recorded value) and recorded hazards; missing stays missing. */
function FoodFacts({ f }: { f: CatalogFood }) {
  const known = new Set(MACROS.map(([k]) => k));
  const label = (k: string) => NUTRIENTS.find((n) => n.key === k)?.label || title(k);
  const unit = (k: string) => NUTRIENTS.find((n) => n.key === k)?.unit || (k.match(/_(mg|mcg|ug|g|kcal)$/)?.[1] ?? '');
  const others = Object.keys(f.per100).filter((k) => !known.has(k)).sort((a, b) => label(a).localeCompare(label(b)));
  return <>
    <div style={kicker}>Nutrients · {f.nutritionBasis === 'serving' ? 'per serving' : 'per 100 g'}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 6 }}>{MACROS.map(([k, l, u]) => <div key={k} style={{ border: `1px solid ${line}`, padding: '6px 8px' }}><div style={{ color: muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>{l}</div><div style={{ fontSize: 14 }}>{f.per100[k] == null ? <span style={{ color: muted }}>—</span> : `${fmt(f.per100[k])} ${u}`}</div></div>)}</div>
    {others.length > 0 && <details style={{ marginTop: 6 }}><summary style={{ cursor: 'pointer', color: muted, fontSize: 11 }}>{others.length} more nutrients</summary><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '2px 14px', marginTop: 6 }}>{others.map((k) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, borderBottom: `1px solid ${line}`, padding: '2px 0' }}><span style={{ color: muted }}>{label(k)}</span><span>{fmt(f.per100[k])} {unit(k)}</span></div>)}</div></details>}
    <div style={kicker}>Recorded hazards · {f.hazards.length}</div>
    {f.hazards.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{f.hazards.map((h) => <span key={h.key} style={{ ...tag, borderColor: levelTone(h.level), color: levelTone(h.level), display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={10} aria-hidden="true" />{title(h.key)} · {h.level}</span>)}</div>
      : <span style={{ color: muted, fontSize: 11 }}>No hazard records. That is not the same as hazard-free.</span>}
  </>;
}

/** Card grid with the opened item's details right after its card. */
function FoodGrid({ items, renderExtra }: { items: CatalogFood[]; renderExtra?: (f: CatalogFood) => React.ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
    {items.map((f) => <Fragment key={f.id}>
      <button type="button" aria-pressed={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)} style={{ textAlign: 'left', border: `1px solid ${open === f.id ? acid : line}`, background: panel, color: ink, padding: 0, cursor: 'pointer', overflow: 'hidden' }}>
        <div style={{ position: 'relative', aspectRatio: '4 / 3', background: f.image ? `url(${f.image}) center/cover` : '#1B1C18' }}>
          {f.healthScore != null && <span aria-label={`Health score ${Math.round(f.healthScore)}`} style={{ position: 'absolute', top: 6, right: 6, display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(9,10,8,.82)', color: acid, border: `1px solid ${acid}`, borderRadius: 999, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}><Heart size={10} aria-hidden="true" />{Math.round(f.healthScore)}</span>}
          {f.processing && <span style={{ position: 'absolute', left: 6, bottom: 6, background: 'rgba(9,10,8,.82)', color: ink, border: `1px solid ${line}`, borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>{f.processing}</span>}
        </div>
        <div style={{ padding: '8px 10px 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{f.name}</div>
          <div style={{ color: muted, fontSize: 10, marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{f.form && <span>{f.form === 'raw' ? 'Whole / raw' : 'Processed'}</span>}{f.per100.energy_kcal != null && <span>{Math.round(f.per100.energy_kcal)} kcal/{f.nutritionBasis === 'serving' ? 'serving' : '100 g'}</span>}{(['high', 'moderate', 'low', 'trace'] as const).map((l) => { const n = f.hazards.filter((h) => h.level === l || (l === 'moderate' && h.level === 'medium')).length; return n ? <span key={l} title={f.hazards.filter((h) => h.level === l || (l === 'moderate' && h.level === 'medium')).map((h) => title(h.key)).join(', ')} style={{ color: levelTone(l), display: 'inline-flex', alignItems: 'center', gap: 3 }}>{l !== 'trace' && <AlertTriangle size={10} aria-hidden="true" />}{n} {l}</span> : null; })}</div>
        </div>
      </button>
      {open === f.id && <div role="region" aria-label={`${f.name} details`} style={{ gridColumn: '1 / -1', border: `1px solid ${acid}`, background: '#141611', padding: 14, display: 'grid', gridTemplateColumns: f.image ? 'minmax(0,150px) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 14, position: 'relative' }}>
        <button type="button" aria-label="Close details" onClick={() => setOpen(null)} style={{ position: 'absolute', top: 8, right: 8, border: 0, background: 'transparent', color: muted, cursor: 'pointer' }}><X size={14} /></button>
        {f.image && <div style={{ aspectRatio: '1', background: `url(${f.image}) center/cover`, border: `1px solid ${line}` }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6, paddingRight: 20 }}>{f.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            {f.healthScore != null && <span style={{ ...tag, color: acid, borderColor: acid }}>Health score {Math.round(f.healthScore)}</span>}
            {f.form && <span style={tag}>{f.form === 'raw' ? 'Whole / raw' : `Processed${f.processing ? ` · ${f.processing}` : ''}`}</span>}
            {f.meta.filter(([, v]) => v).map(([k, v]) => <span key={k} style={tag}>{k}: {v}</span>)}
            {f.diets.map((d) => <span key={d} style={tag}>{d}</span>)}
          </div>
          {f.description && <p style={{ color: muted, fontSize: 12, lineHeight: 1.55, margin: '0 0 4px', maxWidth: 760 }}>{f.description}</p>}
          {renderExtra?.(f)}
          <FoodFacts f={f} />
        </div>
      </div>}
    </Fragment>)}
  </div>;
}

function useLoad<T>(fn: () => Promise<T[]>, deps: unknown[], delay = 0) {
  const [s, set] = useState<{ items: T[]; busy: boolean; error: string }>({ items: [], busy: true, error: '' });
  useEffect(() => { let live = true; const t = window.setTimeout(() => { set((x) => ({ ...x, busy: true, error: '' })); fn().then((items) => { if (live) set({ items, busy: false, error: '' }); }).catch((e) => { if (live) set({ items: [], busy: false, error: (e as Error).message }); }); }, delay); return () => { live = false; window.clearTimeout(t); }; }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}
export const PAGE = 60;
const Status = ({ busy, error, n, what, page = 0 }: { busy: boolean; error: string; n: number; what: string; page?: number }) => <p role="status" style={{ color: error ? warn : muted, fontSize: 11, margin: '0 0 8px', display: 'flex', gap: 6, alignItems: 'center' }}>{busy ? <><Loader2 size={12} className="animate-spin" />Loading…</> : error || (n ? `${what} ${page * PAGE + 1}–${page * PAGE + n} · highest health score first (hazards lower it)` : `No ${what}`)}</p>;
/** Previous / next pages for a card list; `more` = another page exists. */
export function Pager({ page, more, onPage }: { page: number; more: boolean; onPage: (p: number) => void }) {
  if (!page && !more) return null;
  const b = (on: boolean): CSSProperties => ({ border: `1px solid ${line}`, background: 'transparent', color: on ? ink : muted, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: on ? 'pointer' : 'default', opacity: on ? 1 : 0.4 });
  const go = (p: number) => { onPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return <nav aria-label="Pages" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
    <button type="button" disabled={!page} onClick={() => go(page - 1)} style={b(page > 0)}>← Previous</button>
    <span style={{ color: muted, fontSize: 11 }}>Page {page + 1}</span>
    <button type="button" disabled={!more} onClick={() => go(page + 1)} style={b(more)}>Next →</button>
  </nav>;
}

function Ingredients({ accessToken, id }: { accessToken: string; id: string }) {
  const [list, setList] = useState<Array<{ name: string; grams: number | null }> | null>(null);
  useEffect(() => { let live = true; recipeIngredientNames(accessToken, id).then((r) => { if (live) setList(r); }); return () => { live = false; }; }, [accessToken, id]);
  return <><div style={kicker}>Ingredients{list ? ` · ${list.length}` : ''}</div>{!list ? <span style={{ color: muted, fontSize: 11 }}>Loading…</span> : list.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{list.map((i, n) => <span key={n} style={tag}>{i.name}{i.grams ? <span style={{ color: muted }}> · {fmt(i.grams)} g</span> : null}</span>)}</div> : <span style={{ color: muted, fontSize: 11 }}>No linked ingredients.</span>}</>;
}

const CUISINES = ['International', 'American', 'Australian', 'British', 'Canadian', 'Polish', 'New Zealand', 'Irish', 'Italian', 'Japanese', 'French', 'Indian', 'Mexican', 'Chinese'];
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'];
const RECIPE_GROUPS: Array<{ id: RecipeCatalogGroup; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'meals', label: 'Meals' },
  { id: 'drinks', label: 'Drinks' },
  { id: 'condiments', label: 'Garnishes & condiments' },
];

/** Published ROUTINE³ recipes, below the Guardian's own on the Recipes page. */
export function CatalogRecipes({ accessToken }: { accessToken: string }) {
  const [group, setGroup] = useState<RecipeCatalogGroup>('all');
  const [query, setQuery] = useState(''), [cuisine, setCuisine] = useState(''), [meal, setMeal] = useState(''), [diet, setDiet] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [group, query, cuisine, meal, diet]);
  // One extra row says whether there is a next page.
  const { items: got, busy, error } = useLoad(() => browseRecipes(accessToken, { group, query, cuisine, meal, diet, limit: PAGE + 1, offset: page * PAGE }), [accessToken, group, query, cuisine, meal, diet, page], query ? 250 : 0);
  const items = got.slice(0, PAGE);
  return <section aria-label="ROUTINE³ recipes" style={{ marginTop: 34 }}>
    <div style={{ ...kicker, margin: '0 0 4px' }}>ROUTINE³ recipes</div>
    <p style={{ color: muted, fontSize: 12, margin: '0 0 12px' }}>The published recipe database: filter by region, meal and diet, and open one for its health score, nutrients, hazards and ingredients.</p>
    <div role="tablist" aria-label="Recipe type" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {RECIPE_GROUPS.map((g) => <button key={g.id} type="button" role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)} style={{ border: `1px solid ${group === g.id ? acid : line}`, background: group === g.id ? ink : 'transparent', color: group === g.id ? '#090A08' : ink, minHeight: 40, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{g.label}</button>)}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      <Search_ value={query} onChange={setQuery} placeholder="Search ROUTINE³ recipes" />
      <select aria-label="Region" value={cuisine} onChange={(e) => setCuisine(e.target.value)} style={field}><option value="">All regions</option>{CUISINES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      <select aria-label="Meal" value={meal} onChange={(e) => setMeal(e.target.value)} style={field}><option value="">All meals</option>{MEALS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
      <select aria-label="Diet" value={diet} onChange={(e) => setDiet(e.target.value)} style={field}><option value="">Any diet</option>{RECIPE_DIETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </div>
    <Status busy={busy} error={error} n={items.length} what="recipes" page={page} />
    {!busy && <FoodGrid items={items} renderExtra={(f) => <Ingredients accessToken={accessToken} id={f.id} />} />}
    {!busy && <Pager page={page} more={got.length > PAGE} onPage={setPage} />}
  </section>;
}

const INGREDIENT_CATEGORIES = ['Vegetables', 'Fruit', 'Grains & bakery', 'Legumes, nuts & seeds', 'Meat', 'Fish & seafood', 'Dairy & eggs', 'Herbs & spices', 'Oils & fats', 'Drinks', 'Condiments & sauces', 'Sweeteners', 'Additives', 'Supplements & other', 'Confectionery & snacks', 'Prepared foods'];
/** Every matching ingredient, read in pages: the API caps one response at 1,000 rows. */
async function allIngredients(accessToken: string, query: string, category: string): Promise<CatalogFood[]> {
  const out: CatalogFood[] = [];
  for (let offset = 0; ; offset += 1000) {
    const got = await browseIngredients(accessToken, { query, category, limit: 1000, offset });
    out.push(...got);
    if (got.length < 1000) return out;
  }
}
export function CatalogIngredients({ accessToken }: { accessToken: string }) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState(''), [form, setForm] = useState<'' | 'raw' | 'processed'>(''), [processing, setProcessing] = useState('');
  // Form is derived from the name, so with a form filter on, read the whole published list (about 1,400 rows) and filter it here.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [query, category, form, processing]);
  // Without a form filter, page on the server (one extra row says whether there is a next page); with one, the whole list is filtered and paged here.
  const { items: all, busy, error } = useLoad(() => (form ? allIngredients(accessToken, query, category) : browseIngredients(accessToken, { query, category, limit: PAGE + 1, offset: page * PAGE })), [accessToken, query, category, form, form ? 0 : page], query ? 250 : 0);
  // A processing choice from earlier results must not hide everything after the search or category changes.
  useEffect(() => { setProcessing(''); }, [query, category]);
  const kinds = [...new Set(all.filter((f) => f.form === 'processed' && f.processing).map((f) => f.processing!))].sort();
  const shown = all.filter((f) => (!form || f.form === form) && (!processing || f.processing === processing));
  const items = form ? shown.slice(page * PAGE, (page + 1) * PAGE) : shown.slice(0, PAGE);
  const more = form ? shown.length > (page + 1) * PAGE : all.length > PAGE;
  return <div>
    <Header Icon={Wheat} kicker="Diet" title="Ingredients" copy="Every published ingredient in the ROUTINE³ database, with its nutrients per 100 g and recorded hazards." />
    <div role="group" aria-label="Ingredient category" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
      {['', ...INGREDIENT_CATEGORIES].map((c) => <button key={c || 'all'} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} style={{ border: `1px solid ${category === c ? acid : line}`, background: category === c ? 'rgba(199,216,163,.14)' : 'transparent', color: category === c ? acid : ink, borderRadius: 999, padding: '6px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{c || 'All'}</button>)}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}><Search_ value={query} onChange={setQuery} placeholder="Search ingredients" />
      <div role="group" aria-label="Form" style={{ display: 'inline-flex', border: `1px solid ${line}` }}>{([['', 'All'], ['raw', 'Whole / raw'], ['processed', 'Processed']] as const).map(([v, l]) => <button key={v || 'all'} type="button" aria-pressed={form === v} onClick={() => { setForm(v); setProcessing(''); }} style={{ border: 0, background: form === v ? ink : 'transparent', color: form === v ? '#090A08' : ink, padding: '0 12px', height: 40, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{l}</button>)}</div>
      {form === 'processed' && kinds.length > 0 && <select aria-label="Processing type" value={processing} onChange={(e) => setProcessing(e.target.value)} style={field}><option value="">Any processing</option>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}</select>}
    </div>
    <Status busy={busy} error={error} n={items.length} what="ingredients" page={page} />
    {!busy && <FoodGrid items={items} />}
    {!busy && <Pager page={page} more={more} onPage={setPage} />}
  </div>;
}

const WEEK_RULE = /\b(week|weekly|\d+\s*x\s*\/\s*week|\d+x\/week|days? in a row|rest (day|~?\d+\s*h)|48\s*h|72\s*h|every other day)\b/i;
const periodOfTime = (time: string | null) => { const m = /^(\d\d):(\d\d)/.exec(time || ''); if (!m) return null; const t = +m[1] * 60 + +m[2]; return t < 720 ? 'Morning' : t < 1020 ? 'Afternoon' : 'Evening'; };
const periodOfText = (name: string) => (/\b(morning|on rising|on waking|breakfast|sunrise)\b/i.test(name) ? 'Morning' : /\b(lunch|midday|afternoon)\b/i.test(name) ? 'Afternoon' : /\b(evening|night|bed|dinner|sleep)\b/i.test(name) ? 'Evening' : null);
/**
 * Steps split like the app's day: week rules first, then Morning (before 12:00), Afternoon (to 17:00), Evening,
 * untimed items and day rules. A rule sits in the part of the day it belongs to: its own time, its wording
 * ("on rising", "before bed"), or the time of the step it governs (same subtype, e.g. form rules with the workout).
 * Per day when the routine has several.
 */
export function partsOfDay(steps: RoutineStep[], dayLabel: (d: number) => string = (d) => `Day ${d}`): Array<{ key: string; label: string; rules: boolean; day: number; steps: RoutineStep[] }> {
  const multi = new Set(steps.map((s) => s.day || 1)).size > 1;
  const isRule = (s: RoutineStep) => !!s.kind?.startsWith('rule');
  const actionPeriod = (s: RoutineStep) => { const a = steps.find((x) => !isRule(x) && x.time && x.subtype && x.subtype === s.subtype && (x.day || 1) === (s.day || 1)); return a ? periodOfTime(a.time) : null; };
  const part = (s: RoutineStep) => {
    if (!isRule(s)) return periodOfTime(s.time) || 'Anytime';
    if (s.recurrenceType === 'weekly' || WEEK_RULE.test(s.name)) return 'Week rules';
    return periodOfTime(s.time) || periodOfText(s.name) || actionPeriod(s) || 'Day rules';
  };
  const order = ['Week rules', 'Morning', 'Afternoon', 'Evening', 'Anytime', 'Day rules'];
  const out = new Map<string, { key: string; label: string; rules: boolean; day: number; steps: RoutineStep[] }>();
  for (const s of steps) {
    const p = part(s);
    // In a multi-day routine an item without a day runs every day: its own "Every day" groups, listed first.
    const d = p === 'Week rules' || !multi ? 0 : s.day || -1;
    const key = `${d}|${order.indexOf(p)}`;
    if (!out.has(key)) out.set(key, { key, label: d > 0 ? `${dayLabel(d)} · ${p}` : d < 0 ? `Every day · ${p}` : p, rules: p.endsWith('rules'), day: d, steps: [] });
    out.get(key)!.steps.push(s);
  }
  // Within a part of the day, the timed steps first and its rules after them.
  for (const g of out.values()) g.steps.sort((x, y) => Number(isRule(x)) - Number(isRule(y)));
  // Week rules, then every-day groups, then Day 1, Day 2…; within each, the parts of the day in order.
  const rank = (k: string) => { const [d, p] = k.split('|').map(Number); return [p === 0 ? -2 : d, p]; };
  return [...out.values()].sort((a, b) => { const [ad, ap] = rank(a.key), [bd, bp] = rank(b.key); return ad - bd || ap - bp; });
}
/** The app's smart list a step belongs to, used to group rules: Meals, Supplements, Fitness, Hygiene, Wellness. */
export function smartListOfStep(s: Pick<RoutineStep, 'subtype' | 'scope' | 'category' | 'itemType'> & { name?: string; kind?: string | null }): string {
  // A rule goes by what it is about ("Binder 2 h from everything" → Supplements), via the shared rule grouping.
  if (s.kind?.startsWith('rule') && s.name) { const g = ruleGroupFor(s.name, s.subtype || undefined); if (g === 'supplements') return 'Supplements'; if (g === 'consume' || g === 'drinks') return 'Meals'; if (/\b(doctor|pregnan|medication|medical|pharmacist|allerg|under 18|stop if|safety)\b/i.test(s.name)) return 'Safety'; }
  // The step's own subtype decides first (sunscreen is skincare even when scoped "outside"); scope and category only as a fallback.
  const sub = (s.subtype || '').toLowerCase();
  if (/supplement/.test(sub)) return 'Supplements';
  if (/meal|snack|drink|recipe|food/.test(sub)) return 'Meals';
  if (/exercise|fitness|workout/.test(sub)) return 'Fitness';
  if (/hygiene|beauty|skin/.test(sub)) return 'Hygiene';
  if (/wellness|sleep|mind/.test(sub)) return 'Wellness';
  const t = `${s.scope || ''} ${s.category || ''} ${s.itemType || ''}`.toLowerCase();
  if (/supplement/.test(t)) return 'Supplements';
  if (/meal|snack|drink|consume|recipe|food/.test(t)) return 'Meals';
  if (/exercise|fitness|workout|outside/.test(t)) return 'Fitness';
  if (/hygiene|beauty/.test(t)) return 'Hygiene';
  return 'Wellness';
}
/** A part of the day's steps as the app's smart lists (Hygiene, Supplements, Meals…), each list in the order it first appears, steps in time order within it. */
export function bySmartList(steps: RoutineStep[]): RoutineStep[] {
  const order: string[] = [];
  for (const s of steps) { const l = smartListOfStep(s); if (!order.includes(l)) order.push(l); }
  return order.flatMap((l) => steps.filter((s) => smartListOfStep(s) === l));
}
/**
 * A part of the day as smart-list blocks: [list, its steps, its rules]. Rules are the loose rules of that list plus
 * the rules hanging under its steps, each written once with the steps it applies to ("Chew slowly · Breakfast, Lunch").
 */
export function smartListBlocks(steps: RoutineStep[], kids: (s: RoutineStep) => RoutineStep[]): Array<[string, RoutineStep[], Array<{ name: string; dont: boolean; on: string[] }>]> {
  const isRule = (s: RoutineStep) => !!s.kind?.startsWith('rule');
  return [...new Set(bySmartList(steps).map((s) => smartListOfStep(s)))].map((list) => {
    const inList = steps.filter((s) => smartListOfStep(s) === list);
    const acts = inList.filter((s) => !isRule(s));
    const rules = new Map<string, { name: string; dont: boolean; on: string[] }>();
    const add = (r: RoutineStep, on?: string) => { const k = r.name.trim().toLowerCase(); const x = rules.get(k) || { name: r.name, dont: r.kind === 'rule_dont', on: [] }; if (on && !x.on.includes(on)) x.on.push(on); rules.set(k, x); };
    for (const r of inList.filter(isRule)) add(r);
    for (const a of acts) for (const k of kids(a).filter(isRule)) add(k, a.name);
    return [list, acts, [...rules.values()]];
  });
}
/** A meal step with no dish of its own: "Breakfast", "Light lunch", "Afternoon snack", "Dinner meal". */
export const GENERIC_MEAL = /^((light|healthy|balanced|big|small|pre-[a-z]+|post-[a-z]+|morning|afternoon|evening|late) )?(breakfast|lunch|dinner|supper|snack|meal)( meal)?$/i;
/** A suggested recipe under a meal slot: image, name and health score; opens its details and ingredients. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/**
 * A routine built as a repeating week (items with weekly recurrence on certain weekdays, no numbered days) is shown by
 * weekday: each such step is repeated on its days (Mon = 1 … Sun = 7); steps with no weekdays stay "every day".
 * Rules of the whole week stay once; a rule under a step follows its step's days. A numbered-day cycle is left alone.
 */
export function expandWeekly(steps: RoutineStep[]): { steps: RoutineStep[]; weekdays: boolean } {
  const isRule = (s: RoutineStep) => !!s.kind?.startsWith('rule');
  const weekly = steps.some((s) => s.recurrenceType === 'weekly' && s.dows?.length);
  if (!weekly || steps.some((s) => (s.day || 0) > 1)) return { steps, weekdays: false };
  const byId = new Map(steps.map((s) => [s.id, s]));
  const dowsOf = (s: RoutineStep): number[] | null => (s.dows?.length ? s.dows : s.parentId && byId.get(s.parentId) ? dowsOf(byId.get(s.parentId)!) : null);
  const out: RoutineStep[] = [];
  for (const s of steps) {
    const ds = isRule(s) && !s.parentId ? null : dowsOf(s);
    if (!ds) { out.push(s); continue; }
    for (const dow of ds) { const day = dow === 0 ? 7 : dow; out.push({ ...s, id: s.id ? `${s.id}@${day}` : s.id, parentId: s.parentId ? `${s.parentId}@${day}` : s.parentId, day }); }
  }
  return { steps: out, weekdays: true };
}
/** The catalogue item a step opens (its own link, else the suggested recipe of a generic meal slot) and its image. */
export function stepTarget(s: RoutineStep, _list: string, media: Record<string, { name: string; image: string | null }>, suggestions: Record<string, CatalogFood>): { target: StepTarget | null; image: string | null } {
  if (s.activityId) return { target: { kind: 'activity', id: s.activityId, name: media[`a:${s.activityId}`]?.name || s.name }, image: media[`a:${s.activityId}`]?.image || null };
  if (s.recipeId) return { target: { kind: 'recipe', id: s.recipeId, name: media[`r:${s.recipeId}`]?.name || s.name }, image: media[`r:${s.recipeId}`]?.image || null };
  const sug = s.id ? suggestions[s.id] : undefined;
  return sug ? { target: { kind: 'recipe', id: sug.id, name: sug.name }, image: sug.image } : { target: null, image: null };
}
/** What a step opens: a catalogue activity or recipe. */
type StepTarget = { kind: 'activity' | 'recipe'; id: string; name: string };
/** Round image (or icon) in front of an activity or meal step; a button that opens its modal when the step links to the catalogue. */
export function StepPrefix({ target, image, list, onOpen }: { target: StepTarget | null; image: string | null; list: string; onOpen: (t: StepTarget) => void }) {
  const Icon = list === 'Meals' ? Utensils : Dumbbell;
  const box: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle', flex: '0 0 auto', overflow: 'hidden', border: `1px solid ${line}`, background: image ? `url(${image}) center/cover` : '#1B1C18', color: muted, padding: 0 };
  if (target) return <button type="button" onClick={() => onOpen(target)} aria-label={`Open ${target.name}`} title={`Open ${target.name}`} style={{ ...box, cursor: 'pointer', borderColor: acid }}>{!image && <Icon size={12} aria-hidden="true" />}</button>;
  if (list === 'Meals' || list === 'Fitness') return <span aria-hidden="true" style={{ ...box, opacity: 0.5 }}><Icon size={12} /></span>;
  return <span aria-hidden="true" style={{ display: 'inline-block', width: 26, marginRight: 8, verticalAlign: 'middle' }} />;
}
/** A step's description (what to do and why) under it: two lines, with a toggle when it is longer. */
export function StepNote({ text, indent = 34 }: { text: string | null | undefined; indent?: number }) {
  const [open, setOpen] = useState(false);
  const body = (text || '').trim();
  if (!body) return null;
  const long = body.length > 150 || body.split('\n').length > 2;
  return <div style={{ padding: `3px 0 0 ${indent}px` }}>
    <p style={{ color: muted, fontSize: 11, lineHeight: 1.5, margin: 0, whiteSpace: 'pre-line', ...(open || !long ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }) }}>{body}</p>
    {long && <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ border: 0, background: 'transparent', color: acid, fontSize: 10, fontWeight: 600, padding: '2px 0 0', cursor: 'pointer' }}>{open ? 'Less' : 'More'}</button>}
  </div>;
}
/** Detail modal for a catalogue activity (steps, benefits, rules) or recipe (nutrients, hazards, ingredients). */
export function StepModal({ accessToken, target, onClose }: { accessToken: string; target: StepTarget; onClose: () => void }) {
  const [activity, setActivity] = useState<ActivityDetail | null | undefined>(undefined);
  const [food, setFood] = useState<CatalogFood | null | undefined>(undefined);
  useEffect(() => {
    let live = true; setActivity(undefined); setFood(undefined);
    if (target.kind === 'activity') getActivityDetail(accessToken, target.id).then((d) => { if (live) setActivity(d); }).catch(() => { if (live) setActivity(null); });
    else browseRecipes(accessToken, { ids: [target.id], limit: 1 }).then((r) => { if (live) setFood(r[0] || null); }).catch(() => { if (live) setFood(null); });
    return () => { live = false; };
  }, [accessToken, target.kind, target.id]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const loading = target.kind === 'activity' ? activity === undefined : food === undefined;
  const missing = target.kind === 'activity' ? activity === null : food === null;
  const img = target.kind === 'activity' ? activity?.image : food?.image;
  const list = (items: string[]) => <ul style={{ margin: '0 0 6px', paddingLeft: 18, display: 'grid', gap: 2, fontSize: 12 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  return <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div role="dialog" aria-modal="true" aria-label={target.name} onClick={(e) => e.stopPropagation()} style={{ width: 'min(580px,100%)', maxHeight: '88vh', overflowY: 'auto', background: '#141611', border: `1px solid ${acid}`, color: ink, position: 'relative' }}>
      <button type="button" autoFocus aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 8, right: 8, zIndex: 1, border: 0, background: 'rgba(9,10,8,.7)', color: ink, borderRadius: 999, width: 28, height: 28, cursor: 'pointer' }}><X size={14} /></button>
      {img && <div style={{ aspectRatio: '16 / 9', background: `url(${img}) center/cover` }} />}
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, paddingRight: 24 }}>{target.name}</div>
        {loading && <span style={{ color: muted, fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}><Loader2 size={12} className="animate-spin" />Loading…</span>}
        {missing && <span style={{ color: muted, fontSize: 12 }}>This item is not in the catalogue any more.</span>}
        {activity && <>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>{[activity.category, activity.minutes ? `${activity.minutes} min` : null, activity.intensity, activity.caloriesPerHour ? `${activity.caloriesPerHour} kcal/h` : null, ...activity.bodyParts].filter(Boolean).map((t, i) => <span key={i} style={tag}>{t}</span>)}</div>
          {activity.description && <p style={{ color: muted, fontSize: 12, lineHeight: 1.55, margin: '0 0 8px' }}>{activity.description}</p>}
          {activity.steps.length > 0 && <><div style={kicker}>How to</div><ol style={{ margin: '0 0 6px', paddingLeft: 18, display: 'grid', gap: 3, fontSize: 12 }}>{activity.steps.map((x, i) => <li key={i}>{x}</li>)}</ol></>}
          {activity.benefits.length > 0 && <><div style={kicker}>Benefits</div>{list(activity.benefits)}</>}
          {activity.rules.length > 0 && <><div style={kicker}>Rules</div>{list(activity.rules)}</>}
          {activity.tips && <><div style={kicker}>Tips</div><p style={{ fontSize: 12, margin: 0 }}>{activity.tips}</p></>}
        </>}
        {food && <>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>{food.healthScore != null && <span style={{ ...tag, color: acid, borderColor: acid }}>Health score {Math.round(food.healthScore)}</span>}{food.meta.filter(([, v]) => v).map(([k, v]) => <span key={k} style={tag}>{k}: {v}</span>)}{food.diets.map((d) => <span key={d} style={tag}>{d}</span>)}</div>
          {food.description && <p style={{ color: muted, fontSize: 12, lineHeight: 1.55, margin: '0 0 8px' }}>{food.description}</p>}
          <Ingredients accessToken={accessToken} id={food.id} />
          <FoodFacts f={food} />
        </>}
      </div>
    </div>
  </div>;
}
/** Top-level steps with their sub-items and rules (by parent link); orphans of a hidden parent count as top-level. */
/**
 * "Morning hygiene" / "Evening hygiene" is the Hygiene smart list's own set, so it is not shown twice: the set row is
 * dropped and its steps (and rules) take its place in the Hygiene list, with the set's time (a step's own time wins),
 * day and list. Its wake/bedtime peg still sets that time in the data.
 */
export function mergeHygieneSets(steps: RoutineStep[]): RoutineStep[] {
  const isRule = (s: RoutineStep) => !!s.kind?.startsWith('rule');
  const isSet = (s: RoutineStep) => !!s.id && !s.parentId && !isRule(s) && /^(morning|midday|afternoon|evening|night|daily)?\s*hygiene$/i.test(s.name.trim()) && steps.some((k) => k.parentId === s.id && !isRule(k));
  const sets = new Set(steps.filter(isSet).map((s) => s.id));
  if (!sets.size) return steps;
  const out: RoutineStep[] = [];
  for (const s of steps) {
    if (s.parentId && sets.has(s.parentId)) continue; // placed with its set, below
    if (!sets.has(s.id)) { out.push(s); continue; }
    for (const k of steps.filter((x) => x.parentId === s.id)) out.push({ ...k, parentId: null, time: k.time || s.time, day: k.day ?? s.day, group: k.group || s.group, itemType: k.itemType || s.itemType, category: k.category || s.category, subtype: k.subtype || s.subtype, scope: k.scope || s.scope });
  }
  return out;
}
export function stepTree(steps: RoutineStep[]) {
  const ids = new Set(steps.map((s) => s.id).filter(Boolean));
  const top = steps.filter((s) => !s.parentId || !ids.has(s.parentId));
  const kids = (s: RoutineStep) => (s.id ? steps.filter((x) => x.parentId === s.id) : []);
  return { top, kids };
}
/** Daily basics (hygiene, sleep anchors) that only belong to a hygiene, beauty or sleep routine; elsewhere they are suggestions. */
export function isBasicFor(s: Pick<RoutineStep, 'subtype' | 'category' | 'name'>, section: string): boolean {
  const hygiene = s.subtype === 'hygiene';
  const sleep = s.subtype === 'sleep' || s.category === 'sleep' || /^(start|end) sleep$/i.test(s.name);
  return (hygiene && !['hygiene', 'beauty'].includes(section)) || (sleep && section !== 'wellness');
}
/** The app's fitness routines (catalogue Protocols) with their steps. */
/** A section's published routines (catalogue Protocols in its categories), e.g. Fitness, Beauty, Wellness. */
export const ROUTINE_SECTIONS = {
  diet: { title: 'Diet protocols', kicker: 'Diet', categories: ['diet', 'nutrition', 'fasting', 'meal plan'], names: ['fast', 'diet', 'keto', 'whole30', 'meal', 'nutrition', 'paleo'], copy: 'Diet and fasting routines published in the ROUTINE³ app, and the diet plans you saved from the Diet planner.' },
  fitness: { title: 'Fitness routines', kicker: 'Fitness', categories: ['fitness', 'strength', 'recovery', 'mobility', 'cardio', 'hiit'], copy: 'The fitness routines and Protocols published in the ROUTINE³ app. Open one to see its steps.' },
  hygiene: { title: 'Hygiene protocols', kicker: 'Hygiene', categories: ['hygiene', 'oral care', 'personal care'], copy: 'Hygiene routines published in the ROUTINE³ app: morning and evening sets for teeth, skin and body.' },
  beauty: { title: 'Beauty protocols', kicker: 'Beauty', categories: ['beauty', 'skin & face', 'skin', 'hair'], copy: 'Beauty routines published in the ROUTINE³ app: skin, face and hair.' },
  wellness: { title: 'Wellness protocols', kicker: 'Wellness', categories: ['wellness', 'health', 'general health', 'sleep', 'mind'], copy: 'Wellness routines published in the ROUTINE³ app: sleep, stress and everyday health.' },
  detox: { title: 'Detox protocols', kicker: 'Detox', categories: ['detox', 'cleanse'], copy: 'Detox and cleanse routines published in the ROUTINE³ app.' },
  longevity: { title: 'Longevity protocols', kicker: 'Longevity', categories: ['longevity', 'performance', 'supplements'], copy: 'Longevity and performance routines published in the ROUTINE³ app.' },
} as const;
export type RoutineSection = keyof typeof ROUTINE_SECTIONS;
/** A routine's category as its section name (Fitness, Hygiene, Beauty, Wellness, Detox, Longevity), else the raw category. */
export function routineCategoryLabel(category: string | null): string | null {
  const c = (category || '').trim().toLowerCase();
  if (!c) return null;
  const hit = (Object.values(ROUTINE_SECTIONS) as Array<{ kicker: string; categories: readonly string[] }>).find((x) => x.categories.includes(c));
  return hit ? hit.kicker : c.replace(/\b\w/g, (m) => m.toUpperCase());
}
/** A routine's tags: its category in the section's words (Fitness, Strength, Hygiene …), then who it is for. */
export function routineTags(r: FitnessRoutine): ProtocolTag[] {
  return protocolTags({ category: r.category, tags: r.tags, name: r.name, description: r.description, target_gender: r.gender, target_age_min: r.ageMin, target_age_max: r.ageMax }, { label: routineCategoryLabel(r.category) });
}
/** Remove redundant clock-period wording from workout labels; the UI already shows Morning/Evening and a time. */
export function routineGroupLabel(group?: string | null): string | null {
  const label = (group || '').trim().replace(/^(?:AM|PM)\s+Session\s*(?:[—–-]\s*)?/i, '').trim();
  return label || null;
}
/** Routines grouped by the span they cover, in day order: Morning … Night, Day, N days, Week, N weeks, Month, N months. */
export function byPeriod<T extends FitnessRoutine>(items: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const r of items) { const p = routinePeriod(r); groups.set(p, [...(groups.get(p) || []), r]); }
  const days = (p: string) => { const m = /^(\d+) (day|week|month)s$/.exec(p); const parts = ['Morning', 'Midday', 'Evening', 'Night']; return parts.includes(p) ? parts.indexOf(p) - 10 : p === 'Day' ? 1 : p === 'Week' ? 7 : p === 'Month' ? 30 : m ? +m[1] * ({ day: 1, week: 7, month: 30 } as Record<string, number>)[m[2]] : 999; };
  return [...groups.entries()].sort((a, b) => days(a[0]) - days(b[0]));
}
/** Named phases from a description ("Days 1–20, Heavy Metal Detox: …", "Days 25–30, full Para Cleanse"), by day range. */
export function routinePhases(description: string | null): Array<{ from: number; to: number; name: string }> {
  const out: Array<{ from: number; to: number; name: string }> = [];
  for (const m of (description || '').matchAll(/\bDays?\s+(\d+)\s*(?:[–-]\s*(\d+))?\s*,\s*([^:.•;]{3,60})/gi)) out.push({ from: +m[1], to: +(m[2] || m[1]), name: m[3].trim() });
  return out;
}
export const phaseOf = (phases: ReturnType<typeof routinePhases>, day: number) => phases.find((p) => day >= p.from && day <= p.to)?.name || null;
/** Description text stored as light markdown ("### The steps …", "**bold**"): paragraphs at each heading, markers removed. */
export const descriptionParagraphs = (text: string) => text.split(/\s*#{2,}\s*/).map((p) => p.replace(/\*\*(.+?)\*\*/g, '$1').trim()).filter(Boolean);

/**
 * What the routine browser works out from a routine's raw steps: the week view, the tree of sub-steps, the images of the
 * steps that link to a catalogue activity or recipe, and (for a builder, `suggest`) a catalogue recipe for each generic meal.
 */
export function useRoutineView({ accessToken, steps, section, totalDays, description, suggest = true, keepBasics = false }: { accessToken: string; steps: RoutineStep[] | null; section: string; totalDays?: number | null; description?: string | null; suggest?: boolean; /** Show every step of the routine: for a routine that is the offer itself, hygiene and sleep steps are its own, not suggested basics. */ keepBasics?: boolean }) {
  // Only the routine's own steps; daily basics (hygiene, sleep) are suggested beside it, not part of it.
  const basics = keepBasics ? [] : (steps || []).filter((s) => isBasicFor(s, section));
  const basicIds = new Set(basics.map((s) => s.id));
  const weekView = expandWeekly(mergeHygieneSets((steps || []).filter((s) => (keepBasics || !isBasicFor(s, section)) && !(s.parentId && basicIds.has(s.parentId)))));
  const own = weekView.steps, weekdays = weekView.weekdays;
  // A repeating week is a 7-day view (Mon–Sun); a numbered cycle uses its Length (total_days) or its last numbered day.
  const days = !steps ? 1 : weekdays ? 7 : Math.max(1, totalDays || 1, ...steps.map((s) => s.day || 1));
  const dayName = (d: number) => (weekdays ? WEEKDAYS_FULL[d - 1] : `Day ${d}`);
  const tree = stepTree(own);
  const isRule = (s: RoutineStep) => !!s.kind?.startsWith('rule');
  // A generic meal slot ("Breakfast", "Lunch") gets a suggested catalogue recipe that follows this Protocol's diet rules.
  const [suggestions, setSuggestions] = useState<Record<string, CatalogFood>>({});
  // Images for the steps that link to a catalogue activity or recipe, and the one whose modal is open.
  const [media, setMedia] = useState<Record<string, { name: string; image: string | null }>>({});
  const [modal, setModal] = useState<StepTarget | null>(null);
  useEffect(() => {
    setMedia({}); setModal(null);
    if (!steps?.length) return;
    let live = true;
    Promise.all([stepMedia(accessToken, 'activity', steps.map((x) => x.activityId || '')), stepMedia(accessToken, 'recipe', steps.map((x) => x.recipeId || ''))]).then(([a, r]) => { if (live) setMedia({ ...a, ...r }); });
    return () => { live = false; };
  }, [steps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSuggestions({});
    if (!steps?.length || !suggest) return;
    const slots = own.filter((s) => !isRule(s) && !s.recipeId && GENERIC_MEAL.test(s.name.trim()) && s.id).map((s) => ({ s, slot: mealSlotOf(s.name, s.group, s.time) })).filter((x) => x.slot);
    if (!slots.length) return;
    const { diet, avoid } = protocolDiet(own.filter(isRule).map((x) => x.name), description || '');
    let live = true;
    (async () => {
      const out: Record<string, CatalogFood> = {};
      for (const slot of [...new Set(slots.map((x) => x.slot!))]) {
        const pool = (await browseRecipes(accessToken, { meal: slot === 'Snack' ? 'Snack' : slot, diet: diet || undefined, limit: 40 }).catch(() => [])).filter((f) => f.image && !(avoid && avoid.test(f.name)));
        slots.filter((x) => x.slot === slot).forEach((x, k) => { if (pool.length) out[x.s.id!] = pool[k % pool.length]; });
      }
      if (live) setSuggestions(out);
    })();
    return () => { live = false; };
  }, [steps, suggest]); // eslint-disable-line react-hooks/exhaustive-deps
  return { basics, own, weekdays, days, dayName, tree, isRule, media, suggestions, modal, setModal };
}
export type RoutineView = ReturnType<typeof useRoutineView>;

/** A routine's steps by day and part of the day, each smart list with its steps on the left and its rules on the right: the right side of the routine browser. */
export function RoutineStepsList({ view, steps, description, day = 1, listRef }: { view: RoutineView; steps: RoutineStep[] | null; description?: string | null; day?: number; listRef?: React.Ref<HTMLDivElement> }) {
  const { basics, own, weekdays, days, dayName, tree, isRule, media, suggestions, setModal } = view;
  return <>
          <div style={kicker}>Steps{steps ? ` · ${own.length}` : ''}</div>
          {!steps ? <span style={{ color: muted, fontSize: 11 }}>Loading…</span> : <div ref={listRef} style={{ display: 'grid', gap: 10, ...(days > 1 ? { maxHeight: '78vh', overflowY: 'auto', paddingRight: 6, position: 'relative' } : {}) }}>{partsOfDay(tree.top, dayName).map((g, gi, all) => <section key={g.key} aria-label={g.label} data-day={g.day > 0 && all[gi - 1]?.day !== g.day ? g.day : undefined} style={g.day > 0 && all[gi - 1]?.day !== g.day ? { borderTop: `1px solid ${g.day === day ? acid : line}`, paddingTop: 10 } : undefined}>{g.day > 0 && all[gi - 1]?.day !== g.day && <div style={{ fontSize: 13, fontWeight: 700, color: g.day === day ? acid : ink, margin: '0 0 6px' }}>{!weekdays && days > 7 ? `Week ${Math.ceil(g.day / 7)} · ` : ''}{dayName(g.day)}{!weekdays && phaseOf(routinePhases(description || null), g.day) ? <span style={{ color: muted, fontWeight: 400 }}> · {phaseOf(routinePhases(description || null), g.day)}</span> : null}</div>}
            <div style={{ ...kicker, color: g.rules ? warn : muted, margin: '0 0 4px' }}>{g.label} <span style={{ opacity: .7 }}>· {g.steps.length}</span></div>
            {/* Each smart list: its steps on the left, every rule for it (its own and its steps') on the right. */}
            {smartListBlocks(g.steps, tree.kids).map(([list, acts, rules]) => <div key={list} style={{ marginLeft: 12, borderLeft: `2px solid ${line}`, paddingLeft: 10, marginBottom: 8 }}>
              <div style={{ color: muted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 4px' }}>{list}</div>
              <div style={{ display: 'grid', gridTemplateColumns: acts.length && rules.length ? 'minmax(0,3fr) minmax(0,2fr)' : 'minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
                {acts.length > 0 && <ol style={{ margin: '0 0 0 4px', paddingLeft: 12, borderLeft: `1px solid ${line}`, listStyle: 'none', display: 'grid', gap: 4, fontSize: 12 }}>{acts.map((s, i) => <li key={i}><StepPrefix {...stepTarget(s, list, media, suggestions)} list={list} onOpen={setModal} /><span style={{ color: acid }}>{s.time}</span>{s.time ? ' · ' : ''}{s.name}{[s.sets && s.reps ? `${s.sets} × ${s.reps}` : null, s.weight, s.minutes ? `${s.minutes} min` : null].filter(Boolean).map((x) => <span key={x} style={{ color: acid }}> · {x}</span>)}{routineGroupLabel(s.group) ? <span style={{ color: muted }}> · {routineGroupLabel(s.group)}</span> : null}
                  <StepNote text={s.notes} />
                  {tree.kids(s).filter((k) => !isRule(k)).length > 0 && <ul style={{ listStyle: 'none', margin: '2px 0', paddingLeft: 14, borderLeft: `1px solid ${line}`, display: 'grid', gap: 1 }}>{tree.kids(s).filter((k) => !isRule(k)).map((k, j) => <li key={j} style={{ fontSize: 11 }}>{k.name}{k.time && k.time !== s.time ? <span style={{ color: acid }}> · {k.time}</span> : null}<StepNote text={k.notes} indent={0} /></li>)}</ul>}
                  {s.id && suggestions[s.id] && <button type="button" onClick={() => setModal({ kind: 'recipe', id: suggestions[s.id!].id, name: suggestions[s.id!].name })} style={{ display: 'block', border: 0, background: 'transparent', color: acid, fontSize: 11, padding: '2px 0 0 34px', cursor: 'pointer', textAlign: 'left' }}>Suggested: {suggestions[s.id].name}{suggestions[s.id].healthScore != null ? ` · ♥ ${Math.round(suggestions[s.id].healthScore!)}` : ''}</button>}</li>)}</ol>}
                {rules.length > 0 && <ul aria-label={`${list} rules`} style={{ listStyle: 'none', margin: 0, padding: acts.length ? '0 0 0 10px' : 0, borderLeft: acts.length ? `1px dashed ${line}` : 0, display: 'grid', gap: 3, fontSize: 11 }}>{rules.map((x, k) => <li key={k} style={{ color: warn }}>{x.dont ? 'Don’t: ' : 'Do: '}<span style={{ color: ink }}>{x.name}</span>{x.on.length ? <span style={{ color: muted }}> · {x.on.join(', ')}</span> : null}</li>)}</ul>}
              </div>
            </div>)}</section>)}
            {basics.length > 0 && <details style={{ borderTop: `1px solid ${line}`, paddingTop: 8 }}><summary style={{ cursor: 'pointer', color: muted, fontSize: 11 }}>Suggested daily basics · {basics.length} <span style={{ opacity: .7 }}>(hygiene and sleep: not part of this routine)</span></summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 2, fontSize: 11, color: muted }}>{basics.map((s, i) => <li key={i}>{s.time ? `${s.time} · ` : ''}{s.name}</li>)}</ul></details>}
          </div>}
  </>;
}

/** The same list for a page with no phone beside it: the steps, and the catalogue card a step opens. */
export function RoutineStepsPanel({ accessToken, steps, description, section = 'fitness', totalDays }: { accessToken: string; steps: RoutineStep[] | null; description?: string | null; section?: string; totalDays?: number | null }) {
  const view = useRoutineView({ accessToken, steps, section, totalDays, description, suggest: false });
  return <div style={{ minWidth: 0 }}>
    <RoutineStepsList view={view} steps={steps} description={description} day={0} />
    {view.modal && <StepModal accessToken={accessToken} target={view.modal} onClose={() => view.setModal(null)} />}
  </div>;
}

export function FitnessRoutines({ accessToken, section = 'fitness', Icon = Dumbbell }: { accessToken: string; section?: RoutineSection; Icon?: typeof Dumbbell }) {
  const cfg = ROUTINE_SECTIONS[section];
  const names: string[] = 'names' in cfg ? [...cfg.names] : [];
  // Diet also lists the Guardian's own plans saved from the Diet planner, before the published ones.
  const { items, busy, error } = useLoad<FitnessRoutine>(async () => {
    const published = await listFitnessRoutines(accessToken, [...cfg.categories], names);
    if (section !== 'diet') return published;
    const mine = (await listMyDietPlans(accessToken)).map((r) => ({ ...r, tags: ['your plan', ...r.tags] }));
    return [...mine, ...published.filter((p) => !mine.some((m) => m.id === p.id))];
  }, [accessToken, section]);
  const [open, setOpen] = useState<string | null>(null);
  const [steps, setSteps] = useState<RoutineStep[] | null>(null);
  const [day, setDay] = useState(1);
  // The phone preview in the app's own terms: a smart group as a card of rows or as one parent row (the app's smart-list preference), in light or dark.
  const [listMode, setListMode] = useState<'card' | 'parent'>('parent');
  const [phoneTheme, setPhoneTheme] = useState<'light' | 'dark'>('dark');
  const listRef = useRef<HTMLDivElement | null>(null);
  // Picking a day on the phone scrolls the step list to that day.
  const pickDay = (d: number) => { setDay(d); const el = listRef.current?.querySelector<HTMLElement>(`[data-day="${d}"]`); if (el && listRef.current) listRef.current.scrollTo({ top: Math.max(0, el.offsetTop - 4), behavior: 'smooth' }); };
  useEffect(() => { if (!open) return; let live = true; setSteps(null); setDay(1); routineSteps(accessToken, open).then((s) => { if (live) setSteps(s); }); return () => { live = false; }; }, [accessToken, open]);
  // The cycle length is the routine's Length (total_days: Day / Week / 2 weeks / Month), or its last numbered day.
  // The app shows one day: every-day items (no day_number) plus that day's.
  const view = useRoutineView({ accessToken, steps, section, totalDays: items.find((r) => r.id === open)?.totalDays, description: items.find((r) => r.id === open)?.description });
  const { basics, own, weekdays, days, dayName, tree, isRule, media, suggestions, modal, setModal } = view;
  // Like the app: a step's rules are notes on its card, its sub-steps are indented cards under it.
  const dayItems = tree.top.filter((s) => (!s.day || s.day === day) && !isRule(s)).flatMap((s) => {
    const base = { item_type: s.itemType || undefined, kind: s.kind, scope: s.scope, time: s.time, group_name: routineGroupLabel(s.group), category: s.category, subtype: s.subtype };
    const kids = tree.kids(s);
    const sug = s.id ? suggestions[s.id] : undefined;
    return [{ ...base, display_name: s.name, duration_minutes: s.minutes, children: kids.filter(isRule).map((k) => k.name), ...(sug ? { image_url: sug.image, description: `Suggested: ${sug.name}` } : {}) },
      ...kids.filter((k) => !isRule(k)).map((k) => ({ ...base, display_name: k.name, duration_minutes: k.minutes, time: k.time || s.time, indent: true }))];
  });
  return <div>
    <Header Icon={Icon} kicker={cfg.kicker} title={cfg.title} copy={cfg.copy} />
    <p role="status" style={{ color: error ? warn : muted, fontSize: 11 }}>{busy ? 'Loading…' : error || (items.length ? `${items.length} routines` : `No published ${cfg.kicker.toLowerCase()} routines yet. Build one in the Protocol builder, and see the ${cfg.kicker.toLowerCase()} activities below this section in the sidebar.`)}</p>
    {byPeriod(items).map(([period, group]) => <section key={period} aria-label={period} style={{ marginBottom: 22 }}>
    <h3 style={{ ...kicker, color: acid, margin: '0 0 8px' }}>{period} <span style={{ color: muted }}>· {group.length}</span></h3>
    <ProtocolCardGrid>
      {group.map((r) => <Fragment key={r.id}>
        <ProtocolCard pressed={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)} imageUrl={r.image} kicker={routinePeriod(r)} tags={routineTags(r)} title={r.name} copy={clipCopy(descriptionParagraphs(r.description)[0])} cta={open === r.id ? 'Hide steps' : 'View steps'} />
        {open === r.id && <div role="region" aria-label={`${r.name} steps`} style={{ gridColumn: '1 / -1', border: `1px solid ${acid}`, background: '#141611', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20, alignItems: 'start' }}>
          <div aria-label="As in the app" style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
            <div style={{ ...kicker, margin: 0 }}>As in the app{days > 1 ? (weekdays ? ` · ${dayName(day)}` : ` · day ${day} of ${days}${days > 7 ? ` · week ${Math.ceil(day / 7)}` : ''}`) : ''}</div>
            {days > 1 && (() => {
              const phases = routinePhases(r.description);
              const chip = (d: number) => <button key={d} type="button" aria-pressed={d === day} title={phaseOf(phases, d) || undefined} onClick={() => pickDay(d)} style={{ border: `1px solid ${d === day ? acid : line}`, background: d === day ? 'rgba(199,216,163,.14)' : 'transparent', color: d === day ? acid : ink, borderRadius: 999, padding: '3px 8px', fontSize: 10, cursor: 'pointer', minWidth: 30 }}>{weekdays ? WEEKDAYS[d - 1] : days > 7 ? d : `Day ${d}`}</button>;
              // Over a week: one row per week (Week 1: days 1–7…), so a 40-day plan reads as six weeks.
              const weeks = days > 7 ? Array.from({ length: Math.ceil(days / 7) }, (_, w) => Array.from({ length: Math.min(7, days - w * 7) }, (_, k) => w * 7 + k + 1)) : [Array.from({ length: days }, (_, k) => k + 1)];
              return <div role="group" aria-label="Day" style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
                {weeks.map((ds, w) => <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>{days > 7 && <span style={{ color: muted, fontSize: 10, width: 46, textAlign: 'right' }}>Week {w + 1}</span>}{ds.map(chip)}</div>)}
                {!weekdays && phaseOf(phases, day) && <div style={{ color: acid, fontSize: 11 }}>Day {day} · {phaseOf(phases, day)}</div>}
              </div>;
            })()}
            {steps ? <>
              <div role="group" aria-label="Phone view" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                {([['Groups', [['parent', 'Parent row'], ['card', 'Card']], listMode, setListMode], ['Look', [['dark', 'Dark'], ['light', 'Light']], phoneTheme, setPhoneTheme]] as const).map(([name, options, value, set]) => <span key={name} role="group" aria-label={name} style={{ display: 'inline-flex', border: `1px solid ${line}`, borderRadius: 999, overflow: 'hidden' }}>
                  {options.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => (set as (v: string) => void)(key)} style={{ border: 0, padding: '3px 10px', fontSize: 10, cursor: 'pointer', background: value === key ? 'rgba(199,216,163,.14)' : 'transparent', color: value === key ? acid : ink }}>{text}</button>)}
                </span>)}
              </div>
              <PhoneFrame width={300} screenBg={phoneTheme === 'dark' ? '#000000' : '#FFFFFF'}><ProtocolHomeScreen protocolName={r.name} items={dayItems} showDetails imageUrl={r.image || undefined} profileName="ROUTINE³" grouping="smart" smartListMode={listMode} theme={phoneTheme} addRows /></PhoneFrame>
            </> : <span style={{ color: muted, fontSize: 11 }}>Loading…</span>}
          </div>
          <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{r.name}</div>
          {r.description && descriptionParagraphs(r.description).map((t, k) => <p key={k} style={{ color: muted, fontSize: 12, lineHeight: 1.55, maxWidth: 760, margin: '0 0 8px' }}>{t}</p>)}
          <RoutineStepsList view={view} steps={steps} description={r.description} day={day} listRef={listRef} />
          </div>
        </div>}
      </Fragment>)}
    </ProtocolCardGrid></section>)}
    {modal && accessToken && <StepModal accessToken={accessToken} target={modal} onClose={() => setModal(null)} />}
  </div>;
}
