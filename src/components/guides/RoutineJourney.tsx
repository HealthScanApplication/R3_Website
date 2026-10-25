/*
 * A routine, laid out for a reader: one day at a time, by part of the day, each smart list (Wellness, Meals, Supplements…)
 * a card of steps. Every step has a picture in front (its own, its meal's, or an icon for what it is); its description sits
 * indented under its title; a meal step shows the dish it suggests with its ingredients; a second tab adds up what the day's
 * meals bring.
 *
 * Built on the routine browser's own parts (useRoutineView, partsOfDay, smartListBlocks), so it groups exactly as the
 * Fitness planner does on the right of its phone.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Droplet, Dumbbell, Pill, ShieldCheck, Sparkles, Utensils, type LucideIcon } from 'lucide-react';
import { browseRecipes, mealSlotOf, protocolDiet, recipeIngredientNames, type CatalogFood, type RoutineStep } from '../../utils/protocolBuilders';
import { itemIcon } from '../../config/protocolCategories';
import { loadDietAnalysis } from '../../utils/dietNutrition';
import { MACRO_ROWS, OTHER_MACRO_ROWS, dayNutrition, microGroups, servingFigures } from '../../utils/routineNutrition';
import { StepModal, partsOfDay, routineGroupLabel, smartListBlocks, smartListOfStep, useRoutineView } from './CatalogBrowsers';

// Inside the routine nothing carries a colour of its own: cream ink, greys and hairlines on the dark panel.
const INK = '#F5F2EA', MUTED = '#B8B6AF', FAINT = '#8B8982', LINE = 'rgba(245,242,234,.16)', STRONG_LINE = 'rgba(245,242,234,.42)', CARD = '#1B1D17';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const kicker: CSSProperties = { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' };

const LIST_ICON: Record<string, LucideIcon> = { Wellness: Sparkles, Meals: Utensils, Supplements: Pill, Fitness: Dumbbell, Hygiene: Droplet, Safety: ShieldCheck };
const PART_NOTE: Record<string, string> = { Morning: 'Before midday', Afternoon: 'Midday to 5 pm', Evening: 'From 5 pm', Anytime: 'Any time of day', 'Day rules': 'Rules for the day', 'Week rules': 'Rules for the week' };

type Ingredients = Record<string, Array<{ name: string; grams: number | null }>>;

/** The meal slot a step names in words ("Eat a high-protein lunch"); the time of day alone does not make a flaxseed step a breakfast. */
const slotByWords = (s: RoutineStep) => (/\b(breakfast|lunch|dinner|supper|snack)\b/i.test(`${s.name} ${s.group || ''}`) ? mealSlotOf(s.name, s.group, null) : null);

/** The dishes behind a day's meal steps: the recipe a step links to, or one suggested for a meal with no dish of its own. */
function useDayMeals(accessToken: string, meals: RoutineStep[], rules: string[], description: string | null | undefined) {
  const [foods, setFoods] = useState<Record<string, CatalogFood>>({});
  const [suggested, setSuggested] = useState<Record<string, string>>({}); // step id -> recipe id
  const [ingredients, setIngredients] = useState<Ingredients>({});
  const key = meals.map((s) => `${s.id}:${s.recipeId || ''}`).join('|');
  useEffect(() => {
    let live = true;
    (async () => {
      const found: Record<string, CatalogFood> = {};
      const picks: Record<string, string> = {};
      const linked = [...new Set(meals.map((s) => s.recipeId).filter((x): x is string => !!x))];
      if (linked.length) for (const f of await browseRecipes(accessToken, { ids: linked, limit: linked.length }).catch(() => [])) found[f.id] = f;
      // A meal with no dish of its own gets a catalogue recipe that follows the routine's diet rules.
      const generic = meals.filter((s) => !s.recipeId && s.id && slotByWords(s));
      if (generic.length) {
        const { diet, avoid } = protocolDiet(rules, description || '');
        for (const slot of [...new Set(generic.map((s) => slotByWords(s)!))]) {
          const pool = (await browseRecipes(accessToken, { meal: slot, diet: diet || undefined, limit: 40 }).catch(() => [])).filter((f) => f.image && !(avoid && avoid.test(f.name)));
          generic.filter((s) => slotByWords(s) === slot).forEach((s, k) => { const pick = pool[k % Math.max(1, pool.length)]; if (pick) { found[pick.id] = pick; picks[s.id!] = pick.id; } });
        }
      }
      if (live) { setFoods((x) => ({ ...x, ...found })); setSuggested((x) => ({ ...x, ...picks })); }
    })();
    return () => { live = false; };
  }, [accessToken, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ids = [...new Set(meals.map((s) => s.recipeId || suggested[s.id || '']).filter((x): x is string => !!x))].join('|');
  useEffect(() => {
    let live = true;
    const need = ids.split('|').filter((id) => id && !ingredients[id]);
    need.forEach((id) => recipeIngredientNames(accessToken, id).then((list) => { if (live) setIngredients((x) => ({ ...x, [id]: list })); }).catch(() => {}));
    return () => { live = false; };
  }, [accessToken, ids]); // eslint-disable-line react-hooks/exhaustive-deps
  return { foods, suggested, ingredients };
}

/** The picture in front of a step: its own image, its meal's, or an icon for what it is. Never empty. */
function Prefix({ image, list, step, onOpen }: { image: string | null; list: string; step: RoutineStep; onOpen?: () => void }) {
  const fallback = itemIcon({ name: step.name, item_type: step.itemType === 'supplement' ? 'supplement' : step.itemType === 'consume' || step.itemType === 'recipe' || list === 'Meals' ? 'consume' : 'activity' });
  const Icon = LIST_ICON[list] && list !== 'Wellness' && list !== 'Fitness' ? LIST_ICON[list] : fallback.Icon;
  const tile: CSSProperties = { width: 44, height: 44, borderRadius: 12, flex: '0 0 auto', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${LINE}`, background: image ? `url(${image}) center/cover` : 'rgba(245,242,234,.06)', color: MUTED, padding: 0 };
  const inner = image ? null : <Icon size={20} strokeWidth={1.75} aria-hidden="true" />;
  return onOpen
    ? <button type="button" data-prefix={image ? 'image' : 'icon'} onClick={onOpen} aria-label={`Open ${step.name}`} title={`Open ${step.name}`} style={{ ...tile, cursor: 'pointer' }}>{inner}</button>
    : <span data-prefix={image ? 'image' : 'icon'} aria-hidden="true" style={tile}>{inner}</span>;
}

function Macros({ food }: { food: CatalogFood }) {
  const figures = servingFigures(food);
  if (!figures) return null;
  const parts = MACRO_ROWS.map((row) => { const alias = row.aliases.find((a) => typeof figures[a] === 'number'); return alias ? [row.label, Math.round(figures[alias]), row.unit] as const : null; }).filter((x): x is readonly [string, number, string] => !!x);
  if (!parts.length) return null;
  return <div aria-label="Per serving" style={{ color: MUTED, fontSize: 11, marginTop: 3 }}>{parts.map(([label, value, unit], i) => <span key={label}>{i ? ' · ' : ''}{label === 'Energy' ? '' : `${label} `}<strong style={{ color: INK, fontWeight: 600 }}>{value}{unit === 'kcal' ? ' kcal' : ` ${unit}`}</strong></span>)}<span style={{ color: FAINT }}> · per serving</span></div>;
}

function MealCard({ food, suggested, list }: { food: CatalogFood; suggested: boolean; list?: Array<{ name: string; grams: number | null }> }) {
  return <div role="group" aria-label={`${suggested ? 'Suggested meal' : 'Meal'}: ${food.name}`} style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '84px minmax(0,1fr)', border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden', background: '#11120F' }}>
    <div style={{ background: food.image ? `url(${food.image}) center/cover` : '#1B1C18', minHeight: 84 }} aria-hidden="true" />
    <div style={{ padding: '9px 12px 10px', minWidth: 0 }}>
      <span style={{ ...kicker, fontSize: 9 }}>{suggested ? 'Suggested meal' : 'Meal'}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: serif, fontWeight: 400, fontSize: 17, lineHeight: 1.2 }}>{food.name}</strong>
        {food.healthScore != null && <span style={{ color: MUTED, fontSize: 11 }} aria-label={`Health score ${Math.round(food.healthScore)}`}>♥ {Math.round(food.healthScore)}</span>}
      </div>
      <Macros food={food} />
      {list && list.length > 0 && <div style={{ marginTop: 7 }}>
        <div style={{ color: FAINT, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>Ingredients · {list.length}</div>
        <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 5 }}>{list.map((item, i) => <li key={i} style={{ border: `1px solid ${LINE}`, borderRadius: 999, padding: '2px 8px', fontSize: 11, color: INK }}>{item.name}{item.grams ? <span style={{ color: FAINT }}> {Math.round(item.grams)} g</span> : null}</li>)}</ul>
      </div>}
    </div>
  </div>;
}

export function RoutineJourney({ accessToken, steps, description, totalDays }: { accessToken: string; steps: RoutineStep[] | null; description?: string | null; totalDays?: number | null }) {
  const view = useRoutineView({ accessToken, steps, section: 'wellness', totalDays, description, suggest: false, keepBasics: true });
  const { own, tree, days, dayName, isRule, media, modal, setModal } = view;
  const [tab, setTab] = useState<'steps' | 'nutrients'>('steps');
  const [day, setDay] = useState(1);
  const dayTop = useMemo(() => tree.top.filter((s) => !s.day || s.day === day), [tree, day]);
  const groups = partsOfDay(dayTop, dayName);
  const meals = dayTop.filter((s) => !isRule(s) && smartListOfStep(s) === 'Meals');
  const { foods, suggested, ingredients } = useDayMeals(accessToken, meals, own.filter(isRule).map((x) => x.name), description);
  const dayFoods = meals.map((s) => foods[s.recipeId || suggested[s.id || ''] || '']).filter((x): x is CatalogFood => !!x);
  // The nutrients tab works each recipe's micronutrients out from its ingredients, once, when that tab is opened.
  const [microsById, setMicros] = useState<Record<string, Record<string, number>>>({});
  const wanted = [...new Set(dayFoods.map((f) => f.id))].filter((id) => !microsById[id]).join('|');
  useEffect(() => {
    if (tab !== 'nutrients' || !wanted) return;
    let live = true;
    loadDietAnalysis(accessToken, wanted.split('|').map((id) => ({ source: 'catalog' as const, id, name: '', image: null, nutrition: null })), [], undefined, false)
      .then((analysis) => { if (live) setMicros((x) => ({ ...x, ...Object.fromEntries(Object.entries(analysis).filter(([, pick]) => pick.micros && Object.keys(pick.micros).length).map(([key, pick]) => [key.replace(/^catalog:/, ''), pick.micros!])) })); })
      .catch(() => {});
    return () => { live = false; };
  }, [tab, accessToken, wanted]);
  const nutrition = dayNutrition(dayFoods, microsById);
  const micros = microGroups(nutrition.coverage);
  if (!steps) return null;
  const count = own.filter((s) => !isRule(s)).length;
  const chip = (active: boolean): CSSProperties => ({ border: `1px solid ${active ? STRONG_LINE : LINE}`, background: active ? 'rgba(245,242,234,.12)' : 'transparent', color: active ? INK : MUTED, borderRadius: 999, padding: '4px 11px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: sans });

  // Steps are numbered down the day, each smart list's steps strung on one line.
  let numbered = 0;
  const row = (s: RoutineStep, list: string, i: number, n: number, last: boolean) => {
    const linked = s.activityId ? { kind: 'activity' as const, id: s.activityId, name: media[`a:${s.activityId}`]?.name || s.name } : s.recipeId ? { kind: 'recipe' as const, id: s.recipeId, name: media[`r:${s.recipeId}`]?.name || s.name } : null;
    const foodId = s.recipeId || suggested[s.id || ''];
    const food = foodId ? foods[foodId] : undefined;
    const image = (s.activityId && media[`a:${s.activityId}`]?.image) || (s.recipeId && media[`r:${s.recipeId}`]?.image) || food?.image || null;
    const meta = [s.sets && s.reps ? `${s.sets} × ${s.reps}` : null, s.weight, s.minutes ? `${s.minutes} min` : null, routineGroupLabel(s.group)].filter(Boolean);
    const kids = tree.kids(s).filter((k) => !isRule(k));
    return <li key={s.id || i} style={{ display: 'grid', gridTemplateColumns: '24px 44px minmax(0,1fr)', gap: 12, padding: '12px 0' }}>
      <span aria-hidden="true" data-step-number={n} style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        {!last && <span style={{ position: 'absolute', top: 24, bottom: -24, left: '50%', width: 1, background: STRONG_LINE }} />}
        <span style={{ position: 'relative', width: 24, height: 24, borderRadius: 12, border: `1px solid ${STRONG_LINE}`, background: CARD, color: INK, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      </span>
      <Prefix image={image} list={list} step={s} onOpen={linked ? () => setModal(linked) : undefined} />
      <div style={{ minWidth: 0 }}>
        <div style={{ color: INK, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '.04em' }}>{s.time || 'Any time'}{meta.length > 0 && <span style={{ color: MUTED, fontWeight: 400 }}> · {meta.join(' · ')}</span>}</div>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, marginTop: 1 }}>{s.name}</div>
        {s.notes && <p style={{ color: MUTED, fontSize: 12.5, lineHeight: 1.55, margin: '4px 0 0', whiteSpace: 'pre-line' }}>{s.notes}</p>}
        {kids.length > 0 && <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: '0 0 0 12px', borderLeft: `1px solid ${LINE}`, display: 'grid', gap: 5 }}>{kids.map((k, j) => <li key={j} style={{ fontSize: 12.5 }}>{k.time && k.time !== s.time ? <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{k.time} · </span> : null}{k.name}{k.notes && <span style={{ display: 'block', color: MUTED, fontSize: 12, lineHeight: 1.5 }}>{k.notes}</span>}</li>)}</ul>}
        {food && <MealCard food={food} suggested={!s.recipeId} list={ingredients[food.id]} />}
      </div>
    </li>;
  };

  return <div style={{ fontFamily: sans, color: INK, minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      <div role="tablist" aria-label="Routine view" style={{ display: 'inline-flex', gap: 6 }}>
        <button type="button" role="tab" id="journey-tab-steps" aria-selected={tab === 'steps'} aria-controls="journey-panel" onClick={() => setTab('steps')} style={chip(tab === 'steps')}>Steps</button>
        <button type="button" role="tab" id="journey-tab-nutrients" aria-selected={tab === 'nutrients'} aria-controls="journey-panel" onClick={() => setTab('nutrients')} style={chip(tab === 'nutrients')}>Nutrients</button>
      </div>
      <span style={{ color: FAINT, fontSize: 11 }}>{count} step{count === 1 ? '' : 's'}{days > 1 ? ` · ${days} days` : ''}</span>
    </div>
    {days > 1 && <div role="group" aria-label="Day" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>{Array.from({ length: days }, (_, k) => k + 1).map((d) => <button key={d} type="button" aria-pressed={d === day} onClick={() => setDay(d)} style={chip(d === day)}>{dayName(d).replace(/^(\w{3})\w*day$/, '$1')}</button>)}</div>}
    <div role="tabpanel" id="journey-panel" aria-labelledby={`journey-tab-${tab}`}>
      {tab === 'steps' ? <div style={{ display: 'grid', gap: 22 }}>
        {groups.length === 0 && <p style={{ color: MUTED, fontSize: 12.5, margin: 0 }}>Nothing is scheduled on this day.</p>}
        {groups.map((g) => <section key={g.key} aria-label={g.label}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 8px' }}>
            <h4 style={{ fontFamily: serif, fontWeight: 400, fontSize: 22, margin: 0, color: INK }}>{g.label}</h4>
            <span style={{ color: FAINT, fontSize: 11 }}>{PART_NOTE[g.label] || ''}</span>
            <span aria-hidden="true" style={{ flex: 1, height: 1, background: LINE, alignSelf: 'center' }} />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {smartListBlocks(g.steps, tree.kids).map(([list, acts, rules]) => {
              const Icon = LIST_ICON[list] || Sparkles;
              return <div key={list} role="group" aria-label={`${list}, ${g.label}`} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: '10px 14px 4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}><Icon size={13} strokeWidth={2} aria-hidden="true" />{list}<span style={{ color: FAINT, fontWeight: 400 }}>· {acts.length || rules.length}</span></div>
                {acts.length > 0 && <ol role="list" start={numbered + 1} style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>{acts.map((s, i) => row(s, list, i, ++numbered, i === acts.length - 1))}</ol>}
                {rules.length > 0 && <ul aria-label={`${list} rules`} style={{ listStyle: 'none', margin: acts.length ? '0 0 8px' : '8px 0', padding: acts.length ? '10px 0 0' : 0, borderTop: acts.length ? `1px dashed ${LINE}` : 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{rules.map((x, k) => <li key={k} style={{ border: `1px ${x.dont ? 'dashed' : 'solid'} ${x.dont ? STRONG_LINE : LINE}`, borderRadius: x.note ? 12 : 999, padding: x.note ? '6px 12px' : '3px 10px', fontSize: 11.5, ...(x.note ? { flexBasis: '100%' } : {}) }}><strong style={{ color: INK, fontWeight: 700 }}>{x.dont ? 'Don’t' : 'Do'}</strong> {x.time && <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{x.time} · </span>}{x.name}{x.on.length > 0 && <span style={{ color: FAINT }}> · {x.on.join(', ')}</span>}{x.note && <span style={{ display: 'block', color: MUTED, fontSize: 11.5, lineHeight: 1.5, marginTop: 2, whiteSpace: 'pre-line' }}>{x.note}</span>}</li>)}</ul>}
              </div>;
            })}
          </div>
        </section>)}
      </div> : <div style={{ display: 'grid', gap: 14 }}>
        {nutrition.counted === 0
          ? <p style={{ color: MUTED, fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>{meals.length ? 'The meals on this day have no per-serving nutrient figures yet, so there is nothing to add up.' : 'There are no meals on this day.'}</p>
          : <>
            <div style={{ color: MUTED, fontSize: 11.5 }}>What {dayName(day)}’s {nutrition.counted === 1 ? 'meal brings' : `${nutrition.counted} meals bring`}, per serving{nutrition.counted < nutrition.meals ? ` (${nutrition.meals - nutrition.counted} without figures left out)` : ''}. Suggested meals are examples.</div>
            <section aria-label="Macros" style={{ display: 'grid', gap: 8 }}>
              <div style={kicker}>Macros</div>
              <div role="list" aria-label="Macros" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(92px,1fr))', gap: 8 }}>{[...MACRO_ROWS, ...OTHER_MACRO_ROWS].filter((row) => nutrition.macros[row.key] != null).map((row) => {
                const share = nutrition.coverage.find((c) => c.def.key === row.key)?.pct;
                return <div role="listitem" key={row.key} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: '9px 11px' }}>
                  <div style={{ color: FAINT, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{row.label}</div>
                  <div style={{ fontFamily: serif, fontSize: 24, lineHeight: 1.1, marginTop: 2 }}>{Math.round(nutrition.macros[row.key])}<span style={{ color: MUTED, fontFamily: sans, fontSize: 11 }}> {row.unit}</span></div>
                  {share != null && <div style={{ color: FAINT, fontSize: 10, marginTop: 2 }}>{share}% of daily value</div>}
                </div>;
              })}</div>
            </section>
            {micros.length > 0 && <div style={{ color: MUTED, fontSize: 11.5 }}>Micronutrients, as a share of the daily value.</div>}
            {micros.map((g) => <section key={g.key} aria-label={g.label} style={{ display: 'grid', gap: 8 }}>
              <div style={kicker}>{g.label}</div>
              <ul aria-label={`${g.label}, share of the daily value`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7 }}>{g.items.map((c) => <li key={c.def.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(96px,150px) minmax(0,1fr) 104px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                <span>{c.def.label}</span>
                <span aria-hidden="true" style={{ height: 6, borderRadius: 3, background: LINE, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.min(100, c.pct ?? 0)}%`, background: INK, opacity: 0.8 }} /></span>
                <span style={{ color: MUTED, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{c.pct != null ? `${c.pct}%` : ''} <span style={{ color: FAINT }}>{Number(c.amount!.toFixed(c.amount! < 10 ? 1 : 0))} {c.def.unit}</span></span>
              </li>)}</ul>
            </section>)}
          </>}
      </div>}
    </div>
    {modal && <StepModal accessToken={accessToken} target={modal} onClose={() => setModal(null)} />}
  </div>;
}
