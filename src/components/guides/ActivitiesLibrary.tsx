/*
 * Activities: the published activity catalogue, two ways in.
 *   By category: Strength, Stretch, Sports, Wellness, Hygiene… each grouped by the catalogue's subcategory
 *   (Endurance, Mobility, Compound…), with a muscle-group filter for the training categories.
 *   By muscle group: pick Legs, Arms… and see its exercises, stretches and sports side by side.
 * Selecting an activity opens its description below it, with its sub-activities (the others under the same parent
 * and subcategory, e.g. treadmill / trail / long run) and an indoor/outdoor tag where the name says so.
 * Read-only: plans are built in the Fitness and Protocol builders.
 */
import { Fragment, useEffect, useState } from 'react';
import { Activity, Bath, Bike, Brain, Dumbbell, HeartPulse, LayoutGrid, Loader2, Search, Smartphone, Sparkles, StretchHorizontal, Trophy, Waves, X, type LucideIcon } from 'lucide-react';
import { MUSCLE_GROUPS, activityRelatives, activitySetting, muscleGroupOf, searchActivities, type ActivityPick, type MuscleGroupId } from '../../utils/protocolBuilders';
import { ActivityDetailPreview } from './ActivityDetailPreview';
import { Header } from './GuardianBuilders';
import { PAGE, Pager } from './CatalogBrowsers';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', acid = '#C7D8A3', panel = '#11120F';

/** Catalogue categories folded into the groups a Guardian thinks in. */
export const ACTIVITY_GROUPS: { id: string; label: string; Icon: LucideIcon; categories: string[]; muscles: boolean }[] = [
  { id: 'all', label: 'All', Icon: LayoutGrid, categories: [], muscles: true },
  { id: 'strength', label: 'Strength', Icon: Dumbbell, categories: ['Strength', 'Gym', 'Calisthenics', 'Fitness'], muscles: true },
  { id: 'cardio', label: 'Cardio', Icon: Bike, categories: ['Cardio', 'Hiit'], muscles: true },
  { id: 'stretch', label: 'Stretch', Icon: StretchHorizontal, categories: ['Stretch', 'Yoga'], muscles: true },
  { id: 'sports', label: 'Sports', Icon: Trophy, categories: ['Sports', 'Water Sports', 'Martial Arts', 'Dance'], muscles: true },
  { id: 'recovery', label: 'Recovery', Icon: Waves, categories: ['Recovery'], muscles: true },
  { id: 'wellness', label: 'Wellness', Icon: HeartPulse, categories: ['Wellness', 'Health'], muscles: false },
  { id: 'mind', label: 'Mind', Icon: Brain, categories: ['Mindfulness', 'Meditation', 'Breathwork'], muscles: false },
  { id: 'hygiene', label: 'Hygiene', Icon: Bath, categories: ['Hygiene'], muscles: false },
  { id: 'beauty', label: 'Beauty', Icon: Sparkles, categories: ['Beauty'], muscles: false },
];

/** Not activities: food, supplements and cooking live in the Diet section (recipes, supplements, cooking techniques). */
export const NOT_ACTIVITIES = ['Nutrition', 'Consume', 'Supplement', 'Detox', 'Muscle Group', 'Training Type'];

/** What a muscle group shows in the muscle view: training, stretching and sports for it. */
export const MUSCLE_SECTIONS: { id: string; label: string; Icon: LucideIcon; categories: string[] }[] = [
  { id: 'exercise', label: 'Exercises', Icon: Dumbbell, categories: ['Strength', 'Gym', 'Calisthenics', 'Fitness', 'Cardio', 'Hiit'] },
  { id: 'stretch', label: 'Stretches & mobility', Icon: StretchHorizontal, categories: ['Stretch', 'Yoga', 'Recovery'] },
  { id: 'sports', label: 'Sports', Icon: Trophy, categories: ['Sports', 'Water Sports', 'Martial Arts', 'Dance'] },
];

/** Group activities by subcategory, largest group first; activities without one go last under "Other". */
export function bySubcategory(items: ActivityPick[]): Array<{ label: string; items: ActivityPick[] }> {
  const map = new Map<string, ActivityPick[]>();
  for (const a of items) { const k = a.subcategory?.trim() || 'Other'; map.set(k, [...(map.get(k) || []), a]); }
  return [...map.entries()].map(([label, list]) => ({ label: label.replace(/-/g, ' '), items: list })).sort((a, b) => (a.label === 'Other' ? 1 : b.label === 'Other' ? -1 : b.items.length - a.items.length));
}

const chip = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? acid : line}`, background: on ? 'rgba(199,216,163,.14)' : 'transparent', color: on ? acid : ink, borderRadius: 999, padding: '7px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 });
const small = (on: boolean): React.CSSProperties => ({ ...chip(on), padding: '5px 10px', fontSize: 10 });
const kicker: React.CSSProperties = { color: muted, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' };
const tag: React.CSSProperties = { border: `1px solid ${line}`, borderRadius: 3, padding: '2px 6px', fontSize: 10, color: ink };

function Card({ a, on, onPick }: { a: ActivityPick; on: boolean; onPick: (a: ActivityPick) => void }) {
  return <button type="button" onClick={() => onPick(a)} aria-pressed={on} style={{ textAlign: 'left', border: `1px solid ${on ? acid : line}`, background: panel, color: ink, padding: 0, cursor: 'pointer', overflow: 'hidden' }}>
    <div style={{ position: 'relative', aspectRatio: '4 / 3', background: a.image ? `url(${a.image}) center/cover` : '#1B1C18' }}><span style={{ position: 'absolute', top: 6, right: 6, padding: '3px 6px', border: `1px solid ${line}`, background: 'rgba(9,10,8,.82)', color: ink, fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Public</span></div>
    <div style={{ padding: '8px 10px 10px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{a.name}</div>
      <div style={{ color: muted, fontSize: 10, marginTop: 4 }}>{[a.bodyParts?.length ? muscleGroupOf(a) : null, activitySetting(a.name), a.minutes ? `${a.minutes} min` : null].filter(Boolean).join(' · ') || a.category}</div>
    </div>
  </button>;
}

/** The selected activity, opened below its card: description, tags and its sub-activities. */
function Selected({ a, accessToken, onPick, onApp, onClose }: { a: ActivityPick; accessToken: string; onPick: (a: ActivityPick) => void; onApp: () => void; onClose: () => void }) {
  const [relatives, setRelatives] = useState<ActivityPick[] | null>(null);
  useEffect(() => { let live = true; setRelatives(null); activityRelatives(accessToken, a).then((r) => { if (live) setRelatives(r); }).catch(() => { if (live) setRelatives([]); }); return () => { live = false; }; }, [accessToken, a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const setting = activitySetting(a.name);
  return <div role="region" aria-label={`${a.name} details`} style={{ gridColumn: '1 / -1', border: `1px solid ${acid}`, background: '#141611', padding: 14, display: 'grid', gridTemplateColumns: a.image ? 'minmax(0,140px) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 14, position: 'relative' }}>
    <button type="button" aria-label="Close details" onClick={onClose} style={{ position: 'absolute', top: 8, right: 8, border: 0, background: 'transparent', color: muted, cursor: 'pointer' }}><X size={14} /></button>
    {a.image && <div style={{ aspectRatio: '1', background: `url(${a.image}) center/cover`, border: `1px solid ${line}` }} />}
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6, paddingRight: 20 }}>{a.name}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        {[a.category, a.subcategory?.replace(/-/g, ' '), a.bodyParts?.length ? muscleGroupOf(a) : null, setting, a.minutes ? `${a.minutes} min` : null].filter(Boolean).map((t) => <span key={t!} style={tag}>{t}</span>)}
      </div>
      <p style={{ color: muted, fontSize: 12, lineHeight: 1.55, margin: '0 0 10px', maxWidth: 760 }}>{a.description || 'No description in the catalogue yet.'}</p>
      <div style={{ ...kicker, marginBottom: 6 }}>Sub-activities{a.subcategory ? ` · ${a.subcategory.replace(/-/g, ' ')}` : ''}</div>
      {relatives === null ? <span style={{ color: muted, fontSize: 11, display: 'inline-flex', gap: 6, alignItems: 'center' }}><Loader2 size={12} className="animate-spin" />Loading…</span>
        : relatives.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{relatives.map((r) => <button key={r.id} type="button" onClick={() => onPick(r)} style={small(false)}>{r.name}{activitySetting(r.name) ? <span style={{ color: muted, fontWeight: 400 }}> · {activitySetting(r.name)}</span> : null}</button>)}</div>
        : <span style={{ color: muted, fontSize: 11 }}>None listed under this activity.</span>}
      <div style={{ marginTop: 12 }}><button type="button" onClick={onApp} style={small(false)}><Smartphone size={12} aria-hidden="true" />See it as in the app</button></div>
    </div>
  </div>;
}

/** A grid with the selected activity's details opened right after its card. */
function Grid({ items, selected, onPick, accessToken, onApp }: { items: ActivityPick[]; selected: ActivityPick | null; onPick: (a: ActivityPick | null) => void; accessToken: string; onApp: () => void }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
    {items.map((a) => <Fragment key={a.id}>
      <Card a={a} on={selected?.id === a.id} onPick={(x) => onPick(selected?.id === x.id ? null : x)} />
      {selected?.id === a.id && <Selected a={a} accessToken={accessToken} onPick={onPick} onApp={onApp} onClose={() => onPick(null)} />}
    </Fragment>)}
  </div>;
}

function useActivities(accessToken: string, opts: { query?: string; categories: string[]; excludeCategories?: string[]; muscle: MuscleGroupId | null; limit: number; offset?: number }, delay = 0) {
  const [state, setState] = useState<{ items: ActivityPick[]; busy: boolean; error: string }>({ items: [], busy: true, error: '' });
  const key = JSON.stringify(opts);
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      setState((s) => ({ ...s, busy: true, error: '' }));
      searchActivities(accessToken, opts)
        .then((items) => { if (live) setState({ items, busy: false, error: '' }); })
        .catch((e) => { if (live) setState({ items: [], busy: false, error: (e as Error).message || 'Could not load activities.' }); });
    }, delay);
    return () => { live = false; window.clearTimeout(t); };
  }, [accessToken, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

function MuscleSection({ section, muscle, accessToken, selected, onPick, onApp }: { section: typeof MUSCLE_SECTIONS[number]; muscle: MuscleGroupId; accessToken: string; selected: ActivityPick | null; onPick: (a: ActivityPick | null) => void; onApp: () => void }) {
  const { items, busy, error } = useActivities(accessToken, { categories: section.categories, muscle, limit: 24 });
  return <section aria-label={section.label} style={{ marginBottom: 22 }}>
    <h3 style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, margin: '0 0 8px', color: acid }}><section.Icon size={15} aria-hidden="true" />{section.label}<span style={{ color: muted, fontWeight: 400, fontSize: 11 }}>{busy ? '' : `· ${items.length}${items.length === 24 ? '+' : ''}`}</span></h3>
    {busy ? <p style={{ color: muted, fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}><Loader2 size={12} className="animate-spin" />Loading…</p>
      : error ? <p style={{ color: '#E8B07A', fontSize: 11 }}>{error}</p>
      : items.length ? <Grid items={items} selected={selected} onPick={onPick} accessToken={accessToken} onApp={onApp} />
      : <p style={{ color: muted, fontSize: 11 }}>Nothing tagged for this muscle group yet.</p>}
  </section>;
}

/** `lockGroup` shows one category only (e.g. Hygiene activities under the Hygiene section), without the muscle view. */
export function ActivitiesLibrary({ accessToken, lockGroup }: { accessToken: string; lockGroup?: string }) {
  const [mode, setMode] = useState<'category' | 'muscle'>('category');
  const [groupId, setGroupId] = useState(lockGroup || 'all');
  const [muscle, setMuscle] = useState<MuscleGroupId | null>(null);
  const [bodyMuscle, setBodyMuscle] = useState<MuscleGroupId>('legs');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ActivityPick | null>(null);
  const [appView, setAppView] = useState<ActivityPick | null>(null);
  const group = ACTIVITY_GROUPS.find((g) => g.id === groupId) || ACTIVITY_GROUPS[0];
  const activeMuscle = group.muscles ? muscle : null;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [query, groupId, muscle]);
  // One extra row says whether there is a next page.
  const { items: got, busy, error } = useActivities(accessToken, { query, categories: group.categories, excludeCategories: NOT_ACTIVITIES, muscle: activeMuscle, limit: PAGE + 1, offset: page * PAGE }, query ? 250 : 0);
  const items = got.slice(0, PAGE);
  const pick = (a: ActivityPick | null) => { setSelected(a); if (!a) setAppView(null); };
  const openApp = () => setAppView(selected);
  return <div>
    <Header Icon={lockGroup ? group.Icon : Activity} kicker={lockGroup ? group.label : 'Fitness'} title={lockGroup ? `${group.label} activities` : 'Activities'} copy={lockGroup ? `Every ${group.label.toLowerCase()} activity in the ROUTINE³ catalogue. Select one to read what it is and see its variations.` : 'Every activity in the ROUTINE³ catalogue, by category or by muscle group. Select one to read what it is and see its variations.'} />
    {!lockGroup && <div role="tablist" aria-label="Browse activities" style={{ display: 'inline-flex', border: `1px solid ${line}`, marginBottom: 14 }}>
      {([['category', 'By category'], ['muscle', 'By muscle group']] as const).map(([id, text]) => <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => { setMode(id); pick(null); }} style={{ border: 0, background: mode === id ? ink : 'transparent', color: mode === id ? '#090A08' : ink, padding: '9px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>{text}</button>)}
    </div>}

    {mode === 'category' ? <>
      {!lockGroup && <div role="group" aria-label="Activity category" style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
        {ACTIVITY_GROUPS.map((g) => <button key={g.id} type="button" aria-pressed={g.id === groupId} onClick={() => { setGroupId(g.id); pick(null); }} style={chip(g.id === groupId)}><g.Icon size={13} strokeWidth={1.8} aria-hidden="true" />{g.label}</button>)}
      </div>}
      {group.muscles && <div role="group" aria-label="Muscle group" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ ...kicker, marginRight: 4 }}>Muscle group</span>
        <button type="button" aria-pressed={!muscle} onClick={() => setMuscle(null)} style={small(!muscle)}>Any</button>
        {MUSCLE_GROUPS.map((m) => <button key={m.id} type="button" aria-pressed={muscle === m.id} onClick={() => setMuscle(muscle === m.id ? null : m.id)} style={small(muscle === m.id)}>{m.label}</button>)}
      </div>}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${line}`, background: '#090A08', padding: '0 10px', height: 40, marginBottom: 14, maxWidth: 420 }}>
        <Search size={14} color={muted} aria-hidden="true" />
        <input aria-label="Search activities" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${group.id === 'all' ? 'all activities' : group.label.toLowerCase()}`} style={{ flex: 1, border: 0, background: 'transparent', color: ink, fontSize: 13, outline: 'none' }} />
      </label>
    </> : <div role="group" aria-label="Muscle group" style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
      {MUSCLE_GROUPS.map((m) => <button key={m.id} type="button" aria-pressed={bodyMuscle === m.id} onClick={() => { setBodyMuscle(m.id); pick(null); }} style={chip(bodyMuscle === m.id)}>{m.label}</button>)}
    </div>}

    <div className="g-fit-split">
      <div style={{ minWidth: 0 }}>
        {mode === 'category' ? <>
          <p role="status" style={{ color: muted, fontSize: 11, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>{busy ? <><Loader2 size={12} className="animate-spin" />Loading…</> : error ? <span style={{ color: '#E8B07A' }}>{error}</span> : `${items.length ? `${page * PAGE + 1}–${page * PAGE + items.length}` : 0} activities · highest health score first · ${group.label}${activeMuscle ? ` · ${MUSCLE_GROUPS.find((m) => m.id === activeMuscle)?.label}` : ''}`}</p>
          {!busy && bySubcategory(items).map((sub) => <section key={sub.label} aria-label={sub.label} style={{ marginBottom: 18 }}>
            <h3 style={{ ...kicker, color: acid, margin: '0 0 8px' }}>{sub.label} <span style={{ color: muted }}>· {sub.items.length}</span></h3>
            <Grid items={sub.items} selected={selected} onPick={pick} accessToken={accessToken} onApp={openApp} />
          </section>)}
          {!busy && <Pager page={page} more={got.length > PAGE} onPage={setPage} />}
          {!busy && !error && !items.length && <p style={{ color: muted, fontSize: 12 }}>No activities match. Try another category or muscle group.</p>}
        </> : MUSCLE_SECTIONS.map((section) => <MuscleSection key={`${bodyMuscle}:${section.id}`} section={section} muscle={bodyMuscle} accessToken={accessToken} selected={selected} onPick={pick} onApp={openApp} />)}
      </div>
      {appView && <div className="g-fit-detail"><ActivityDetailPreview accessToken={accessToken} exercise={{ ...appView, sets: null, reps: null, rest_seconds: null }} onClose={() => setAppView(null)} /></div>}
    </div>
  </div>;
}
