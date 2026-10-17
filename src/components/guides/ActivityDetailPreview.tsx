/*
 * An exercise as the ROUTINE³ app shows it (mobile UniversalDetailTray → ActivityDetailSections): hero image,
 * title and chips, the prescribed set, steps, body parts worked, performance, health benefits, rules and tips.
 * Light app theme inside a PhoneFrame, inline styles only (prebuilt CSS, no JIT).
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { PhoneFrame } from '../mockups/PhoneFrame';
import { getActivityDetail, type ActivityDetail, type ExercisePick } from '../../utils/protocolBuilders';

const POPPINS = 'Poppins, "Archivo", system-ui, -apple-system, sans-serif';
const app = { bg: '#FBFBFA', surface: '#FFFFFF', text: '#151515', muted: '#6E6E6A', line: '#ECEBE6', accent: '#D45B0A', accentBg: '#FEF3EB' };
const pretty = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section style={{ marginTop: 16 }}>
  <h3 style={{ fontFamily: POPPINS, fontSize: 13, fontWeight: 600, color: app.text, margin: '0 0 8px' }}>{title}</h3>{children}
</section>;
const Chip = ({ children }: { children: React.ReactNode }) => <span style={{ fontFamily: POPPINS, fontSize: 10, fontWeight: 500, color: app.accent, background: app.accentBg, borderRadius: 999, padding: '3px 8px' }}>{children}</span>;

export function ActivityDetailPreview({ accessToken, exercise, onClose }: { accessToken: string; exercise: ExercisePick; onClose: () => void }) {
  const [detail, setDetail] = useState<ActivityDetail | null | undefined>(undefined);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setDetail(undefined); setError('');
    getActivityDetail(accessToken, exercise.id).then((d) => { if (live) setDetail(d); }).catch((e) => { if (live) { setDetail(null); setError(String(e.message || e)); } });
    return () => { live = false; };
  }, [accessToken, exercise.id]);
  const d = detail;
  const minutes = exercise.minutes ?? d?.minutes ?? null;
  const kcal = d?.caloriesPerHour && minutes ? Math.round(d.caloriesPerHour * minutes / 60) : null;
  const set = exercise.sets ? `${exercise.sets} × ${exercise.reps || '—'}${exercise.rest_seconds ? ` · ${exercise.rest_seconds}s rest` : ''}` : minutes ? `${minutes} min` : null;
  return <aside aria-label={`${exercise.name} as in the app`} style={{ display: 'grid', gap: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#B8B6AF', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>
      As in the app
      <button type="button" aria-label="Close exercise preview" onClick={onClose} style={{ border: '1px solid rgba(245,242,234,.24)', background: 'transparent', color: '#F5F2EA', width: 26, height: 26, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={13} /></button>
    </div>
    <PhoneFrame width={320} screenBg={app.bg}>
      <div style={{ fontFamily: POPPINS, color: app.text, padding: '10px 14px 22px', maxHeight: 560, overflowY: 'auto' }}>
        <div style={{ aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden', background: app.accentBg, display: 'grid', placeItems: 'center', fontSize: 40 }}>
          {(d?.image || exercise.image) ? <img src={d?.image || exercise.image!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (d?.emoji || '🏃')}
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 600, margin: '12px 0 6px', lineHeight: 1.2 }}>{exercise.name}</h2>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {exercise.role && <Chip>{exercise.role === 'warmup' ? 'Warm-up' : 'Recovery'}</Chip>}
          {(d?.category || exercise.category) && <Chip>{d?.category || exercise.category}</Chip>}
          {d?.intensity && <Chip>{pretty(d.intensity)} intensity</Chip>}
          {d?.sweat && <Chip>{pretty(d.sweat)} sweat</Chip>}
        </div>
        {detail === undefined && <p role="status" style={{ color: app.muted, fontSize: 12 }}>Loading activity…</p>}
        {error && <p role="alert" style={{ color: '#B3261E', fontSize: 12 }}>{error}</p>}
        {d?.description && <p style={{ color: app.muted, fontSize: 12, lineHeight: 1.55, margin: '10px 0 0' }}>{d.description}</p>}
        {set && <Section title="Your set"><div style={{ background: app.surface, border: `1px solid ${app.line}`, borderRadius: 12, padding: '10px 12px', fontSize: 14, fontWeight: 600 }}>{set}</div></Section>}
        {!!d?.steps.length && <Section title="Steps"><ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>{d.steps.map((s, i) => <li key={i} style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: 1.5 }}>
          <span style={{ flex: 'none', width: 22, height: 22, borderRadius: 999, background: app.accentBg, color: app.accent, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600 }}>{i + 1}</span>{s}</li>)}</ol></Section>}
        {!!d?.bodyParts.length && <Section title="Body parts worked"><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{d.bodyParts.map((p) => <span key={p} style={{ fontSize: 11, border: `1px solid ${app.line}`, background: app.surface, borderRadius: 999, padding: '3px 9px' }}>{pretty(p)}</span>)}</div></Section>}
        {d && <Section title="Performance"><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>{[['Est. calories', kcal ? `${kcal} kcal` : d.caloriesPerHour ? `${Math.round(d.caloriesPerHour)}/h` : '—'], ['Duration', minutes ? `${minutes} min` : '—'], ['Intensity', d.intensity ? pretty(d.intensity) : '—']].map(([l, v]) => <div key={l} style={{ background: app.surface, border: `1px solid ${app.line}`, borderRadius: 12, padding: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: app.muted }}>{l}</div><div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{v}</div></div>)}</div></Section>}
        {!!d?.benefits.length && <Section title="Health benefits"><ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 4, fontSize: 12, lineHeight: 1.45 }}>{d.benefits.map((b) => <li key={b}>{b}</li>)}</ul></Section>}
        {(!!d?.rules.length || d?.tips) && <Section title="Rules & tips"><ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 4, fontSize: 12, lineHeight: 1.45 }}>{d!.rules.map((r) => <li key={r}>{r}</li>)}{d!.tips && <li>{d!.tips}</li>}</ul></Section>}
        {detail === null && !error && <p style={{ color: app.muted, fontSize: 12 }}>This activity is not in the catalog.</p>}
      </div>
    </PhoneFrame>
  </aside>;
}
