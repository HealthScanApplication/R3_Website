/*
 * Activities: the published activity catalogue, browsable by category (strength, stretch, sports, wellness,
 * hygiene…) with a muscle-group filter for the training categories. Opening one shows the same app-style detail
 * as the Fitness planner. Read-only: plans are built in the Fitness and Protocol builders.
 */
import { useEffect, useState } from 'react';
import { Activity, Bath, Bike, Brain, Dumbbell, HeartPulse, LayoutGrid, Loader2, Search, Sparkles, StretchHorizontal, Trophy, Utensils, Waves, type LucideIcon } from 'lucide-react';
import { MUSCLE_GROUPS, muscleGroupOf, searchActivities, type ActivityPick, type MuscleGroupId } from '../../utils/protocolBuilders';
import { ActivityDetailPreview } from './ActivityDetailPreview';
import { Header } from './GuardianBuilders';

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
  { id: 'nutrition', label: 'Nutrition', Icon: Utensils, categories: ['Nutrition', 'Consume', 'Supplement'], muscles: false },
];

const chip = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? acid : line}`, background: on ? 'rgba(199,216,163,.14)' : 'transparent', color: on ? acid : ink, borderRadius: 999, padding: '7px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 });

export function ActivitiesLibrary({ accessToken }: { accessToken: string }) {
  const [groupId, setGroupId] = useState('all');
  const [muscle, setMuscle] = useState<MuscleGroupId | null>(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ActivityPick[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<ActivityPick | null>(null);
  const group = ACTIVITY_GROUPS.find((g) => g.id === groupId) || ACTIVITY_GROUPS[0];
  const activeMuscle = group.muscles ? muscle : null;
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      setBusy(true); setError('');
      searchActivities(accessToken, { query, categories: group.categories, muscle: activeMuscle, limit: 60 })
        .then((rows) => { if (live) setItems(rows); })
        .catch((e) => { if (live) { setItems([]); setError((e as Error).message || 'Could not load activities.'); } })
        .finally(() => { if (live) setBusy(false); });
    }, query ? 250 : 0);
    return () => { live = false; window.clearTimeout(t); };
  }, [accessToken, groupId, activeMuscle, query]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div>
    <Header Icon={Activity} kicker="Fitness" title="Activities" copy="Every activity in the ROUTINE³ catalogue, by category. Filter training by muscle group, and open one to see it as the app shows it." />
    <div role="group" aria-label="Activity category" style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
      {ACTIVITY_GROUPS.map((g) => <button key={g.id} type="button" aria-pressed={g.id === groupId} onClick={() => setGroupId(g.id)} style={chip(g.id === groupId)}><g.Icon size={13} strokeWidth={1.8} aria-hidden="true" />{g.label}</button>)}
    </div>
    {group.muscles && <div role="group" aria-label="Muscle group" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 }}>
      <span style={{ color: muted, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginRight: 4 }}>Muscle group</span>
      <button type="button" aria-pressed={!muscle} onClick={() => setMuscle(null)} style={{ ...chip(!muscle), padding: '5px 10px', fontSize: 10 }}>Any</button>
      {MUSCLE_GROUPS.map((m) => <button key={m.id} type="button" aria-pressed={muscle === m.id} onClick={() => setMuscle(muscle === m.id ? null : m.id)} style={{ ...chip(muscle === m.id), padding: '5px 10px', fontSize: 10 }}>{m.label}</button>)}
    </div>}
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${line}`, background: '#090A08', padding: '0 10px', height: 40, marginBottom: 14, maxWidth: 420 }}>
      <Search size={14} color={muted} aria-hidden="true" />
      <input aria-label="Search activities" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${group.id === 'all' ? 'all activities' : group.label.toLowerCase()}`} style={{ flex: 1, border: 0, background: 'transparent', color: ink, fontSize: 13, outline: 'none' }} />
    </label>
    <div className="g-fit-split">
      <div>
        <p role="status" style={{ color: muted, fontSize: 11, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>{busy ? <><Loader2 size={12} className="animate-spin" />Loading…</> : error ? <span style={{ color: '#E8B07A' }}>{error}</span> : `${items.length}${items.length === 60 ? '+' : ''} activities · ${group.label}${activeMuscle ? ` · ${MUSCLE_GROUPS.find((m) => m.id === activeMuscle)?.label}` : ''}`}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 8 }}>
          {items.map((a) => <button key={a.id} type="button" onClick={() => setOpen(a)} aria-pressed={open?.id === a.id} style={{ textAlign: 'left', border: `1px solid ${open?.id === a.id ? acid : line}`, background: panel, color: ink, padding: 0, cursor: 'pointer', overflow: 'hidden' }}>
            <div style={{ aspectRatio: '4 / 3', background: a.image ? `url(${a.image}) center/cover` : '#1B1C18' }} />
            <div style={{ padding: '8px 10px 10px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{a.name}</div>
              <div style={{ color: muted, fontSize: 10, marginTop: 4 }}>{[a.category, a.bodyParts?.length ? muscleGroupOf(a) : null, a.minutes ? `${a.minutes} min` : null].filter(Boolean).join(' · ')}</div>
            </div>
          </button>)}
        </div>
        {!busy && !error && !items.length && <p style={{ color: muted, fontSize: 12 }}>No activities match. Try another category or muscle group.</p>}
      </div>
      {open && <div className="g-fit-detail"><ActivityDetailPreview accessToken={accessToken} exercise={{ ...open, sets: null, reps: null, rest_seconds: null }} onClose={() => setOpen(null)} /></div>}
    </div>
  </div>;
}
