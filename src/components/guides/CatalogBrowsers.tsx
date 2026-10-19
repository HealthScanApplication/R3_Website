/*
 * Read-only browsers for the ROUTINE³ catalogue, in the Activities layout (filters, search, card grid, details
 * opened below the card):
 *   CatalogRecipes     published recipes by cuisine (region), meal and diet: health score, nutrients per 100 g,
 *                      hazards and ingredients. Shown under the Guardian's own recipes.
 *   CatalogIngredients ingredients by category, with nutrients and hazards (Diet section).
 *   FitnessRoutines    the app's published fitness Protocols and their steps (Fitness section).
 */
import { Fragment, useEffect, useState } from 'react';
import { AlertTriangle, Dumbbell, Heart, Loader2, Search, Wheat, X } from 'lucide-react';
import { RECIPE_DIETS, browseIngredients, browseRecipes, listFitnessRoutines, recipeIngredientNames, routineSteps, type CatalogFood, type FitnessRoutine, type RoutineStep } from '../../utils/protocolBuilders';
import { ProtocolHomeScreen } from '../mockups/ProtocolHomeScreen';
import { PhoneFrame } from '../mockups/PhoneFrame';
import { NUTRIENTS } from '../../utils/recipeNutrients';
import { Header } from './GuardianBuilders';

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
    <div style={kicker}>Nutrients · per 100 g</div>
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
        <div style={{ aspectRatio: '4 / 3', background: f.image ? `url(${f.image}) center/cover` : '#1B1C18' }} />
        <div style={{ padding: '8px 10px 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{f.name}</div>
          <div style={{ color: muted, fontSize: 10, marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{f.healthScore != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: acid }}><Heart size={10} aria-hidden="true" />{Math.round(f.healthScore)}</span>}{f.per100.energy_kcal != null && <span>{Math.round(f.per100.energy_kcal)} kcal/100 g</span>}{f.hazards.some((h) => h.level === 'high') && <span style={{ color: danger, display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={10} aria-hidden="true" />high</span>}</div>
        </div>
      </button>
      {open === f.id && <div role="region" aria-label={`${f.name} details`} style={{ gridColumn: '1 / -1', border: `1px solid ${acid}`, background: '#141611', padding: 14, display: 'grid', gridTemplateColumns: f.image ? 'minmax(0,150px) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 14, position: 'relative' }}>
        <button type="button" aria-label="Close details" onClick={() => setOpen(null)} style={{ position: 'absolute', top: 8, right: 8, border: 0, background: 'transparent', color: muted, cursor: 'pointer' }}><X size={14} /></button>
        {f.image && <div style={{ aspectRatio: '1', background: `url(${f.image}) center/cover`, border: `1px solid ${line}` }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6, paddingRight: 20 }}>{f.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            {f.healthScore != null && <span style={{ ...tag, color: acid, borderColor: acid }}>Health score {Math.round(f.healthScore)}</span>}
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
const Status = ({ busy, error, n, what }: { busy: boolean; error: string; n: number; what: string }) => <p role="status" style={{ color: error ? warn : muted, fontSize: 11, margin: '0 0 8px', display: 'flex', gap: 6, alignItems: 'center' }}>{busy ? <><Loader2 size={12} className="animate-spin" />Loading…</> : error || `${n}${n === 60 ? '+' : ''} ${what} · highest health score first`}</p>;

function Ingredients({ accessToken, id }: { accessToken: string; id: string }) {
  const [list, setList] = useState<Array<{ name: string; grams: number | null }> | null>(null);
  useEffect(() => { let live = true; recipeIngredientNames(accessToken, id).then((r) => { if (live) setList(r); }); return () => { live = false; }; }, [accessToken, id]);
  return <><div style={kicker}>Ingredients{list ? ` · ${list.length}` : ''}</div>{!list ? <span style={{ color: muted, fontSize: 11 }}>Loading…</span> : list.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{list.map((i, n) => <span key={n} style={tag}>{i.name}{i.grams ? <span style={{ color: muted }}> · {fmt(i.grams)} g</span> : null}</span>)}</div> : <span style={{ color: muted, fontSize: 11 }}>No linked ingredients.</span>}</>;
}

const CUISINES = ['International', 'American', 'Australian', 'British', 'Canadian', 'Polish', 'New Zealand', 'Irish', 'Italian', 'Japanese', 'French', 'Indian', 'Mexican', 'Chinese'];
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'];

/** Published ROUTINE³ recipes, below the Guardian's own on the Recipes page. */
export function CatalogRecipes({ accessToken }: { accessToken: string }) {
  const [query, setQuery] = useState(''), [cuisine, setCuisine] = useState(''), [meal, setMeal] = useState(''), [diet, setDiet] = useState('');
  const { items, busy, error } = useLoad(() => browseRecipes(accessToken, { query, cuisine, meal, diet }), [accessToken, query, cuisine, meal, diet], query ? 250 : 0);
  return <section aria-label="ROUTINE³ recipes" style={{ marginTop: 34 }}>
    <div style={{ ...kicker, margin: '0 0 4px' }}>ROUTINE³ recipes</div>
    <p style={{ color: muted, fontSize: 12, margin: '0 0 12px' }}>The published recipe database: filter by region, meal and diet, and open one for its health score, nutrients, hazards and ingredients.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      <Search_ value={query} onChange={setQuery} placeholder="Search ROUTINE³ recipes" />
      <select aria-label="Region" value={cuisine} onChange={(e) => setCuisine(e.target.value)} style={field}><option value="">All regions</option>{CUISINES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      <select aria-label="Meal" value={meal} onChange={(e) => setMeal(e.target.value)} style={field}><option value="">All meals</option>{MEALS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
      <select aria-label="Diet" value={diet} onChange={(e) => setDiet(e.target.value)} style={field}><option value="">Any diet</option>{RECIPE_DIETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </div>
    <Status busy={busy} error={error} n={items.length} what="recipes" />
    {!busy && <FoodGrid items={items} renderExtra={(f) => <Ingredients accessToken={accessToken} id={f.id} />} />}
  </section>;
}

const INGREDIENT_CATEGORIES = ['Vegetables', 'Fruit', 'Grains & bakery', 'Legumes, nuts & seeds', 'Meat', 'Fish & seafood', 'Dairy & eggs', 'Herbs & spices', 'Oils & fats', 'Drinks', 'Condiments & sauces', 'Sweeteners', 'Additives', 'Supplements & other', 'Confectionery & snacks', 'Prepared foods'];
export function CatalogIngredients({ accessToken }: { accessToken: string }) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState('');
  const { items, busy, error } = useLoad(() => browseIngredients(accessToken, { query, category }), [accessToken, query, category], query ? 250 : 0);
  return <div>
    <Header Icon={Wheat} kicker="Diet" title="Ingredients" copy="Every published ingredient in the ROUTINE³ database, with its nutrients per 100 g and recorded hazards." />
    <div role="group" aria-label="Ingredient category" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
      {['', ...INGREDIENT_CATEGORIES].map((c) => <button key={c || 'all'} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} style={{ border: `1px solid ${category === c ? acid : line}`, background: category === c ? 'rgba(199,216,163,.14)' : 'transparent', color: category === c ? acid : ink, borderRadius: 999, padding: '6px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{c || 'All'}</button>)}
    </div>
    <div style={{ display: 'flex', marginBottom: 12 }}><Search_ value={query} onChange={setQuery} placeholder="Search ingredients" /></div>
    <Status busy={busy} error={error} n={items.length} what="ingredients" />
    {!busy && <FoodGrid items={items} />}
  </div>;
}

/** The app's fitness routines (catalogue Protocols) with their steps. */
/** A section's published routines (catalogue Protocols in its categories), e.g. Fitness, Beauty, Wellness. */
export const ROUTINE_SECTIONS = {
  fitness: { title: 'Fitness routines', kicker: 'Fitness', categories: ['fitness', 'strength', 'recovery', 'mobility', 'cardio', 'hiit'], copy: 'The fitness routines and Protocols published in the ROUTINE³ app. Open one to see its steps.' },
  hygiene: { title: 'Hygiene protocols', kicker: 'Hygiene', categories: ['hygiene', 'oral care', 'personal care'], copy: 'Hygiene routines published in the ROUTINE³ app: morning and evening sets for teeth, skin and body.' },
  beauty: { title: 'Beauty protocols', kicker: 'Beauty', categories: ['beauty', 'skin & face', 'skin', 'hair'], copy: 'Beauty routines published in the ROUTINE³ app: skin, face and hair.' },
  wellness: { title: 'Wellness protocols', kicker: 'Wellness', categories: ['wellness', 'health', 'general health', 'sleep', 'mind'], copy: 'Wellness routines published in the ROUTINE³ app: sleep, stress and everyday health.' },
  detox: { title: 'Detox protocols', kicker: 'Detox', categories: ['detox', 'cleanse'], copy: 'Detox and cleanse routines published in the ROUTINE³ app.' },
  longevity: { title: 'Longevity protocols', kicker: 'Longevity', categories: ['longevity', 'performance', 'supplements'], copy: 'Longevity and performance routines published in the ROUTINE³ app.' },
} as const;
export type RoutineSection = keyof typeof ROUTINE_SECTIONS;

export function FitnessRoutines({ accessToken, section = 'fitness', Icon = Dumbbell }: { accessToken: string; section?: RoutineSection; Icon?: typeof Dumbbell }) {
  const cfg = ROUTINE_SECTIONS[section];
  const { items, busy, error } = useLoad<FitnessRoutine>(() => listFitnessRoutines(accessToken, [...cfg.categories]), [accessToken, section]);
  const [open, setOpen] = useState<string | null>(null);
  const [steps, setSteps] = useState<RoutineStep[] | null>(null);
  const [day, setDay] = useState(1);
  useEffect(() => { if (!open) return; let live = true; setSteps(null); setDay(1); routineSteps(accessToken, open).then((s) => { if (live) setSteps(s); }); return () => { live = false; }; }, [accessToken, open]);
  const days = steps ? Math.max(1, ...steps.map((s) => s.day || 1)) : 1;
  // The app shows one day: every-day items (no day_number) plus that day's.
  const dayItems = (steps || []).filter((s) => !s.day || s.day === day).map((s) => ({ display_name: s.name, item_type: s.itemType || undefined, kind: s.kind, scope: s.scope, time: s.time, duration_minutes: s.minutes, group_name: s.group, category: s.category, subtype: s.subtype }));
  return <div>
    <Header Icon={Icon} kicker={cfg.kicker} title={cfg.title} copy={cfg.copy} />
    <p role="status" style={{ color: error ? warn : muted, fontSize: 11 }}>{busy ? 'Loading…' : error || (items.length ? `${items.length} routines` : `No published ${cfg.kicker.toLowerCase()} routines yet. Build one in the Protocol builder, and see the ${cfg.kicker.toLowerCase()} activities below this section in the sidebar.`)}</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
      {items.map((r) => <Fragment key={r.id}>
        <button type="button" aria-pressed={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)} style={{ textAlign: 'left', border: `1px solid ${open === r.id ? acid : line}`, background: panel, color: ink, padding: 0, cursor: 'pointer', overflow: 'hidden' }}>
          <div style={{ aspectRatio: '16 / 9', background: r.image ? `url(${r.image}) center/cover` : '#1B1C18' }} />
          <div style={{ padding: '8px 10px 10px' }}><div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div><div style={{ color: muted, fontSize: 10, marginTop: 3 }}>{[r.category, ...r.tags.slice(0, 2)].filter(Boolean).join(' · ')}</div></div>
        </button>
        {open === r.id && <div role="region" aria-label={`${r.name} steps`} style={{ gridColumn: '1 / -1', border: `1px solid ${acid}`, background: '#141611', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20, alignItems: 'start' }}>
          <div aria-label="As in the app" style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
            <div style={{ ...kicker, margin: 0 }}>As in the app{days > 1 ? ` · day ${day} of ${days}` : ''}</div>
            {days > 1 && <div role="group" aria-label="Day" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>{Array.from({ length: days }, (_, i) => i + 1).map((d) => <button key={d} type="button" aria-pressed={d === day} onClick={() => setDay(d)} style={{ border: `1px solid ${d === day ? acid : line}`, background: d === day ? 'rgba(199,216,163,.14)' : 'transparent', color: d === day ? acid : ink, borderRadius: 999, padding: '3px 9px', fontSize: 10, cursor: 'pointer' }}>Day {d}</button>)}</div>}
            {steps ? <PhoneFrame width={300} screenBg="#FFFFFF"><ProtocolHomeScreen protocolName={r.name} items={dayItems} imageUrl={r.image || undefined} profileName="ROUTINE³" grouping="smart" /></PhoneFrame> : <span style={{ color: muted, fontSize: 11 }}>Loading…</span>}
          </div>
          <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{r.name}</div>
          {r.description && <p style={{ color: muted, fontSize: 12, lineHeight: 1.55, maxWidth: 760 }}>{r.description}</p>}
          <div style={kicker}>Steps{steps ? ` · ${steps.length}` : ''}</div>
          {!steps ? <span style={{ color: muted, fontSize: 11 }}>Loading…</span> : <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3, fontSize: 12 }}>{steps.map((s, i) => <li key={i}><span style={{ color: acid }}>{[s.day ? `Day ${s.day}` : null, s.time].filter(Boolean).join(' · ')}</span>{s.day || s.time ? ' · ' : ''}{s.name}{[s.sets && s.reps ? `${s.sets} × ${s.reps}` : null, s.weight, s.minutes ? `${s.minutes} min` : null].filter(Boolean).map((x) => <span key={x} style={{ color: acid }}> · {x}</span>)}{s.group ? <span style={{ color: muted }}> · {s.group}</span> : null}{s.kind?.startsWith('rule') ? <span style={{ color: warn }}> · rule</span> : null}</li>)}</ol>}
          </div>
        </div>}
      </Fragment>)}
    </div>
  </div>;
}
