/*
 * Audience → problem or goal, as linked steps. Audience lists depend on the population (sex / children),
 * problems come from the symptom catalog grouped into friendly areas and ranked for the audience, goals
 * are a separate curated list. Guardians can add their own problems and goals.
 */
import { useEffect, useMemo, useState } from 'react';
import { Activity, Apple, Baby, Bone, Brain, CircleAlert, Droplet, Dumbbell, Ear, Flame, FlaskConical, Flower2, Footprints, Hand, Heart, HeartPulse, Hourglass, Leaf, ListChecks, Mars, Moon, PersonStanding, Plus, Scale, Scissors, Search, Shield, Smile, Sparkles, StretchHorizontal, Target, Users, Venus, Wind, Zap, type LucideIcon } from 'lucide-react';
import { AGE_RANGES, GOAL_AREAS, LIFE_STAGES, POPULATIONS, PROBLEM_AREAS, describeAudience, problemAreaOf, problemLabel, problemsFor, withPopulation, type Audience, type CatalogProblem, type Focus, type Population } from '../../utils/audienceTaxonomy';
import { addCustomFocus, loadProblemCatalog, savedCustomFocus } from '../../utils/problemCatalog';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', acid = '#C7D8A3';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const input: React.CSSProperties = { width: '100%', height: 40, boxSizing: 'border-box', border: `1px solid ${line}`, background: '#0D0E0C', color: ink, borderRadius: 2, padding: '0 11px', fontFamily: sans, fontSize: 13, outline: 'none' };
const label: React.CSSProperties = { display: 'block', color: muted, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7 };
const chip = (on: boolean, small = false): React.CSSProperties => ({ border: `1px solid ${on ? acid : line}`, background: on ? 'rgba(199,216,163,.14)' : 'transparent', color: on ? acid : ink, borderRadius: 999, padding: small ? '5px 10px' : '7px 12px', fontFamily: sans, fontSize: small ? 10 : 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 });
// Every chip leads with an icon: populations, focus type, problem and goal areas, and each goal.
const POP_ICON: Record<string, LucideIcon> = { Everyone: Users, Women: Venus, Men: Mars, Children: Baby };
const AREA_ICON: Record<string, LucideIcon> = { mind: Brain, gut: Apple, hormones: FlaskConical, skin: Sparkles, heart: HeartPulse, immune: Shield, muscles: Bone, breathing: Wind, reproductive: Flower2, kidney: Droplet, senses: Ear, general: Activity, health: Heart, fitness: Dumbbell, beauty: Sparkles };
const GOAL_ICON: Array<[RegExp, LucideIcon]> = [[/sleep/i, Moon], [/energy/i, Zap], [/gut/i, Apple], [/hormone/i, FlaskConical], [/weight|fat/i, Scale], [/heart/i, HeartPulse], [/immun/i, Shield], [/ageing|aging/i, Hourglass], [/sugar/i, Droplet], [/fertil/i, Flower2], [/stress/i, Wind], [/focus/i, Target], [/mood/i, Smile], [/habit/i, ListChecks], [/mindful/i, Leaf], [/muscle/i, Dumbbell], [/run/i, Footprints], [/mobility|flexib/i, StretchHorizontal], [/posture/i, PersonStanding], [/recover/i, Moon], [/hair/i, Scissors], [/nail/i, Hand], [/skin/i, Sparkles], [/burn|lose/i, Flame]];
const goalIcon = (label: string, fallback: LucideIcon = Target) => GOAL_ICON.find(([re]) => re.test(label))?.[1] || fallback;
const ic = (Icon: LucideIcon, small = false) => <Icon size={small ? 11 : 13} strokeWidth={1.8} aria-hidden="true" style={{ flex: '0 0 auto' }} />;
const iconChip = (style: React.CSSProperties): React.CSSProperties => ({ ...style, display: 'inline-flex', alignItems: 'center', gap: 5 });
const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => <div style={{ borderTop: n > 1 ? `1px solid ${line}` : 0, paddingTop: n > 1 ? 14 : 0 }}>
  <div style={{ ...label, color: acid, marginBottom: 10 }}>{String(n).padStart(2, '0')} · {title}</div>{children}
</div>;

export function TargetPicker({ audience, onAudience, focus, onFocus }: { audience: Audience; onAudience: (a: Audience) => void; focus: Focus | null; onFocus: (f: Focus) => void }) {
  const [catalog, setCatalog] = useState<CatalogProblem[]>([]);
  const [loadError, setLoadError] = useState('');
  useEffect(() => { loadProblemCatalog().then(setCatalog).catch((e) => setLoadError(String(e.message || e))); }, []);
  const [kind, setKind] = useState<'problem' | 'goal'>(focus?.kind || 'problem');
  const [area, setArea] = useState<string | null>(focus?.kind === 'problem' ? focus.area : 'mind');
  const [goalArea, setGoalArea] = useState(focus?.kind === 'goal' ? focus.area : 'health');
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState(savedCustomFocus);
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const p of catalog) m.set(problemAreaOf(p), (m.get(problemAreaOf(p)) || 0) + 1); return m; }, [catalog]);
  const matches = useMemo(() => problemsFor(catalog, query.trim() ? null : area, query, audience, 40), [catalog, area, query, audience]);
  const exact = matches.some((p) => problemLabel(p).toLowerCase() === query.trim().toLowerCase());
  const pickProblem = (p: CatalogProblem) => { onFocus({ kind: 'problem', area: problemAreaOf(p), label: problemLabel(p) }); setArea(problemAreaOf(p)); setQuery(''); };
  const addNew = (k: 'problems' | 'goals') => { const text = query.trim(); if (!text) return; setCustom(addCustomFocus(k, text)); onFocus(k === 'problems' ? { kind: 'problem', area: area || 'general', label: text } : { kind: 'goal', area: goalArea, label: text }); setQuery(''); };
  const isOn = (k: Focus['kind'], l: string) => focus?.kind === k && focus.label.toLowerCase() === l.toLowerCase();
  const areaLabel = (id: string) => PROBLEM_AREAS.find((a) => a.id === id)?.label || GOAL_AREAS.find((g) => g.id === id)?.label || id;

  return <div style={{ display: 'grid', gap: 14 }}>
    <Step n={1} title="Audience">
      <div role="group" aria-label="Population" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>{POPULATIONS.map((p) => <button key={p} type="button" aria-pressed={audience.population === p} onClick={() => onAudience(withPopulation(audience, p as Population))} style={iconChip(chip(audience.population === p))}>{ic(POP_ICON[p] || Users)}{p}</button>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        <label><span style={label}>Age range</span><select aria-label="Age range" style={input} value={audience.age} onChange={(e) => onAudience({ ...audience, age: e.target.value })}>{AGE_RANGES[audience.population].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label><span style={label}>Health / life stage</span><select aria-label="Health or life stage" style={input} value={audience.stage} onChange={(e) => onAudience({ ...audience, stage: e.target.value })}>{LIFE_STAGES[audience.population].map((x) => <option key={x}>{x}</option>)}</select></label>
      </div>
      <p style={{ color: muted, fontSize: 11, margin: '8px 0 0' }}>For: <span style={{ color: ink }}>{describeAudience(audience)}</span></p>
    </Step>
    <Step n={2} title="Problem or goal">
      <div role="tablist" aria-label="Focus type" style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
        {(['problem', 'goal'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setQuery(''); }} style={iconChip(chip(kind === k))}>{ic(k === 'problem' ? CircleAlert : Target)}{k === 'problem' ? 'A problem to solve' : 'A goal to reach'}</button>)}
      </div>
      {kind === 'problem' ? <>
        <div role="group" aria-label="Problem area" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>{PROBLEM_AREAS.filter((a) => counts.get(a.id)).map((a) => <button key={a.id} type="button" aria-pressed={area === a.id && !query} onClick={() => { setArea(a.id); setQuery(''); }} style={iconChip(chip(area === a.id && !query, true))}>{ic(AREA_ICON[a.id] || Activity, true)}{a.label} <span style={{ opacity: .6 }}>{counts.get(a.id)}</span></button>)}</div>
        <div style={{ position: 'relative', marginBottom: 10 }}><Search size={13} color={muted} style={{ position: 'absolute', left: 10, top: 13 }} aria-hidden="true" />
          <input aria-label="Search or add a problem" placeholder={catalog.length ? `Search ${catalog.length.toLocaleString()} known problems, or add your own` : 'Loading known problems…'} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && query.trim() && !exact) { e.preventDefault(); addNew('problems'); } }} style={{ ...input, paddingLeft: 30 }} /></div>
        {loadError && <p role="alert" style={{ color: '#E8B86A', fontSize: 11 }}>{loadError}. You can still add your own problem.</p>}
        <div role="group" aria-label="Problems" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 150, overflowY: 'auto' }}>
          {custom.problems.filter((x) => !query || x.toLowerCase().includes(query.toLowerCase())).map((x) => <button key={`c-${x}`} type="button" aria-pressed={isOn('problem', x)} onClick={() => onFocus({ kind: 'problem', area: area || 'general', label: x })} style={iconChip(chip(isOn('problem', x), true))}>{ic(AREA_ICON[area] || CircleAlert, true)}{x} <span style={{ opacity: .6 }}>· yours</span></button>)}
          {matches.map((p) => <button key={p.id} type="button" aria-pressed={isOn('problem', problemLabel(p))} onClick={() => pickProblem(p)} style={iconChip(chip(isOn('problem', problemLabel(p)), true))}>{ic(AREA_ICON[problemAreaOf(p)] || CircleAlert, true)}{problemLabel(p)}</button>)}
          {query.trim() && !exact && <button type="button" onClick={() => addNew('problems')} style={{ ...chip(false, true), borderStyle: 'dashed' }}><Plus size={11} aria-hidden="true" />Add “{query.trim()}”</button>}
        </div>
      </> : <>
        <div role="group" aria-label="Goal area" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>{GOAL_AREAS.map((g) => <button key={g.id} type="button" aria-pressed={goalArea === g.id} onClick={() => setGoalArea(g.id)} style={iconChip(chip(goalArea === g.id, true))}>{ic(AREA_ICON[g.id] || Target, true)}{g.label}</button>)}</div>
        <div role="group" aria-label="Goals" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {[...custom.goals, ...(GOAL_AREAS.find((g) => g.id === goalArea)?.goals || [])].map((x) => <button key={x} type="button" aria-pressed={isOn('goal', x)} onClick={() => onFocus({ kind: 'goal', area: goalArea, label: x })} style={iconChip(chip(isOn('goal', x), true))}>{ic(goalIcon(x), true)}{x}{custom.goals.includes(x) && <span style={{ opacity: .6 }}>· yours</span>}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 7 }}><input aria-label="Add your own goal" placeholder="Add your own goal" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew('goals'); } }} style={input} /><button type="button" disabled={!query.trim()} onClick={() => addNew('goals')} style={{ ...chip(false), borderRadius: 2, whiteSpace: 'nowrap' }}><Plus size={12} aria-hidden="true" />Add goal</button></div>
      </>}
      {focus && <p style={{ color: muted, fontSize: 11, margin: '10px 0 0' }}>{focus.kind === 'problem' ? 'Solving' : 'Reaching'}: <span style={{ color: acid }}>{focus.label}</span> <span>· {areaLabel(focus.area)}</span></p>}
    </Step>
  </div>;
}
