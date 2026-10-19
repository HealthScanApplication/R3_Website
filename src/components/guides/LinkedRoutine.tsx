/*
 * Diet ⇄ Fitness, inside one person's master routine. Each planner finds its sibling plan through the master
 * Protocol (protocol_children) and shows the other side of the day: the Diet planner sees training and
 * training fuel, the Fitness planner sees meals and Diet supplements. Conflicts come from linkIssues().
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Dumbbell, Link2, Utensils } from 'lucide-react';
import { WEEK, fuelName, type DietConfig, type FitnessConfig } from '../../utils/protocolBuilders';
import { findLinkedPlan } from '../../utils/protocolCopies';
import { dietByDay, linkIssues, trainingByDay } from '../../utils/trainingLink';
import type { AdminProtocol } from '../../utils/protocolAdmin';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,.24)', acid = '#C7D8A3', warn = '#E8B86A';
const card: React.CSSProperties = { border: `1px solid ${line}`, padding: 16, background: '#11120F' };
const label: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, color: acid, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 };
const short = (day: number) => WEEK.find((w) => w.day === day)?.short || '';

type Meta = Record<string, { builder_kind: string | null; builder_config: any }>;
export interface LinkedPlan<T> { parentName: string; siblingId: string | null; siblingName: string; config: T | null }

/** The master routine this plan belongs to and its sibling plan's saved config; null when not attached. */
export function useLinkedPlan<T>(accessToken: string, protocolId: string | null, kind: 'diet' | 'fitness', meta: Meta, protocols: AdminProtocol[]) {
  const [link, setLink] = useState<{ parentId: string; siblingId: string | null } | null | undefined>(undefined);
  useEffect(() => {
    if (!protocolId) { setLink(null); return; }
    let live = true;
    setLink(undefined);
    findLinkedPlan(accessToken, protocolId, kind).then((l) => { if (live) setLink(l); }).catch(() => { if (live) setLink(null); });
    return () => { live = false; };
  }, [accessToken, protocolId, kind]);
  if (link === undefined) return { loading: true as const, plan: null };
  if (!link) return { loading: false as const, plan: null };
  const name = (id: string | null) => (id && protocols.find((p) => p.id === id)?.name) || '';
  const plan: LinkedPlan<T> = { parentName: name(link.parentId) || 'this routine', siblingId: link.siblingId, siblingName: name(link.siblingId), config: (link.siblingId && meta[link.siblingId]?.builder_config) || null };
  return { loading: false as const, plan };
}

function Issues({ messages }: { messages: string[] }) {
  if (!messages.length) return <p style={{ color: muted, fontSize: 11, margin: '10px 0 0' }}>No clashes between the Diet and Fitness plans.</p>;
  return <ul aria-label="Diet and fitness clashes" style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
    {messages.map((m) => <li key={m} style={{ display: 'flex', gap: 6, color: warn, fontSize: 11, lineHeight: 1.45 }}><AlertTriangle size={12} style={{ flex: 'none', marginTop: 2 }} aria-hidden="true" />{m}</li>)}
  </ul>;
}

function Unlinked({ kind, saved }: { kind: 'diet' | 'fitness'; saved: boolean }) {
  const other = kind === 'diet' ? 'Fitness' : 'Diet';
  return <div style={{ ...card, marginBottom: 14 }}>
    <div style={label}><Link2 size={12} aria-hidden="true" />Linked routine</div>
    <p style={{ color: muted, fontSize: 12, margin: 0, lineHeight: 1.5 }}>{saved
      ? `Not part of a master routine yet. Attach this plan to a person's Protocol (Protocols → open their routine → plans) to see their ${other} plan alongside and share fuel and supplements.`
      : `Save this plan and attach it to a person's master routine to see their ${other} plan alongside it.`}</p>
  </div>;
}

function Header({ Icon, text, plan, onOpen }: { Icon: typeof Dumbbell; text: string; plan: LinkedPlan<unknown>; onOpen: (id: string) => void }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
    <div style={{ ...label, marginBottom: 0 }}><Icon size={12} aria-hidden="true" />{text}</div>
    <span style={{ color: muted, fontSize: 11 }}>Part of {plan.parentName}{plan.siblingId && <> · <button type="button" onClick={() => onOpen(plan.siblingId!)} style={{ border: 0, background: 'transparent', color: acid, padding: 0, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>{plan.siblingName || 'open plan'}</button></>}</span>
  </div>;
}

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7,minmax(118px,1fr))', gap: 6, minWidth: 840 };
const cell: React.CSSProperties = { border: `1px solid ${line}`, padding: 8, fontSize: 11, lineHeight: 1.45, minHeight: 64 };

/** Diet planner side: the training week and its fuel from the routine's Fitness plan. */
export function LinkedTraining({ accessToken, protocolId, diet, meta, protocols, onOpen }: { accessToken: string; protocolId: string | null; diet: DietConfig; meta: Meta; protocols: AdminProtocol[]; onOpen: (id: string) => void }) {
  const { loading, plan } = useLinkedPlan<FitnessConfig>(accessToken, protocolId, 'diet', meta, protocols);
  if (loading) return null;
  if (!plan) return <Unlinked kind="diet" saved={!!protocolId} />;
  if (!plan.config) return <div style={{ ...card, marginBottom: 14 }}><Header Icon={Dumbbell} text="Training this week" plan={plan} onOpen={onOpen} /><p style={{ color: muted, fontSize: 12, margin: 0 }}>{plan.siblingId ? 'The routine has a Fitness plan, but it was not built in the Fitness planner, so its sessions cannot be read here.' : 'This routine has no Fitness plan yet.'}</p></div>;
  const days = new Map(trainingByDay(plan.config).map((d) => [d.day, d]));
  return <section aria-label="Training this week" style={{ ...card, marginBottom: 14 }}>
    <Header Icon={Dumbbell} text="Training this week" plan={plan} onOpen={onOpen} />
    <div style={{ overflowX: 'auto' }}><div style={grid}>{WEEK.map(({ day }) => { const d = days.get(day); return <div key={day} style={{ ...cell, background: d ? '#171C12' : 'transparent' }}>
      <div style={{ color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>{short(day)}</div>
      {!d && <span style={{ color: muted }}>Rest</span>}
      {d?.sessions.map((s) => <div key={s.time + s.title} style={{ color: ink }}>{s.time} {s.title} <span style={{ color: muted }}>· {s.minutes} min · {s.intensity}</span></div>)}
      {d?.fuel.map((f) => <div key={f.when + f.time} style={{ color: acid, marginTop: 3 }}>{f.time} {f.when === 'pre' ? 'Before' : 'After'}: {f.items.map(fuelName).join(', ')}</div>)}
    </div>; })}</div></div>
    <Issues messages={linkIssues(diet, plan.config).map((i) => i.message)} />
  </section>;
}

/** Fitness planner side: meal times and Diet supplements from the routine's Diet plan. */
export function LinkedDiet({ accessToken, protocolId, fit, meta, protocols, onOpen }: { accessToken: string; protocolId: string | null; fit: FitnessConfig; meta: Meta; protocols: AdminProtocol[]; onOpen: (id: string) => void }) {
  const { loading, plan } = useLinkedPlan<DietConfig>(accessToken, protocolId, 'fitness', meta, protocols);
  if (loading) return null;
  if (!plan) return <Unlinked kind="fitness" saved={!!protocolId} />;
  if (!plan.config) return <div style={{ ...card, marginBottom: 14 }}><Header Icon={Utensils} text="Meals & supplements this week" plan={plan} onOpen={onOpen} /><p style={{ color: muted, fontSize: 12, margin: 0 }}>{plan.siblingId ? 'The routine has a Diet plan, but it was not built in the Diet planner, so its meals cannot be read here.' : 'This routine has no Diet plan yet.'}</p></div>;
  const training = new Set(fit.sessions.map((s) => s.day));
  return <section aria-label="Meals and supplements this week" style={{ ...card, marginBottom: 14 }}>
    <Header Icon={Utensils} text="Meals & supplements this week" plan={plan} onOpen={onOpen} />
    <div style={{ overflowX: 'auto' }}><div style={grid}>{dietByDay(plan.config).map((d) => <div key={d.day} style={{ ...cell, background: training.has(d.day) ? '#171C12' : 'transparent' }}>
      <div style={{ color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>{short(d.day)}{training.has(d.day) && <span style={{ color: acid }}> · training</span>}</div>
      {d.meals.map((m) => <div key={m.label} style={{ color: ink }}>{m.time} {m.label}</div>)}
      {d.supplements.map((s, i) => <div key={i} style={{ color: acid, marginTop: 2 }}>{s.time} {s.name}</div>)}
    </div>)}</div></div>
    <Issues messages={linkIssues(plan.config, fit).map((i) => i.message)} />
  </section>;
}
