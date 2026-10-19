import { type Dispatch, type SetStateAction } from 'react';
import { defaultFasting, fastingWindows, SUPPLEMENT_PERIODS, supplementCell, WEEK, FASTING_TYPES, type DietConfig, type SupplementPeriod } from '../../utils/protocolBuilders';
import { CircleSlash, Clock, Droplets, DropletOff, Hourglass, Leaf, Pill, Timer, type LucideIcon } from 'lucide-react';
import { SupplementPicker } from './SupplementPicker';
const muted = '#B8B6AF', acid = '#C7D8A3', border = '1px solid rgba(245,242,234,.24)';
const button = { border, background:'#11120F',color:'#F5F2EA',padding:'6px 9px',borderRadius:15,cursor:'pointer',fontSize:11 };
/** One look for every "add" tag in the Diet planner: meal, drink and supplement. */
export const addTag = { ...button, display:'inline-flex', alignItems:'center', gap:5, fontSize:10, lineHeight:1.2, textAlign:'left' as const };
/** What each fast means, shown under the chips when it is selected. */
const FASTING_ABOUT: Record<string, string> = {
  none: 'No fasting: meals and drinks can go at any time.',
  intermittent: 'Eat within a daily window and fast the rest, e.g. 16:8 (16 hours fasting, 8 hours eating). Water, black coffee and plain tea are usually fine while fasting.',
  water: 'Only water during the fast: no food and no other drinks. Longer water fasts need medical supervision.',
  dry: 'No food and no fluids, not even water, during the fast. The most restrictive kind; it can be dangerous and needs medical guidance.',
  daniel: 'A partial fast from the Book of Daniel: plant foods only (vegetables, fruit, whole grains, legumes, nuts) and water, with no meat, dairy, sugar, refined grains, alcohol or caffeine. Usually kept for 21 days.',
};
const FASTING_ICON: Record<string, LucideIcon> = { none: CircleSlash, intermittent: Timer, water: Droplets, dry: DropletOff, daniel: Leaf };
const ico = (Icon: LucideIcon, size = 12) => <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
const input = { border,background:'#0D0E0C',color:'#F5F2EA',width:'100%',boxSizing:'border-box' as const,padding:6,fontSize:12 };
type Props = { cfg:DietConfig; setCfg:Dispatch<SetStateAction<DietConfig>> };
export const fastHatch = 'repeating-linear-gradient(135deg,rgba(199,216,163,.10),rgba(199,216,163,.10) 5px,transparent 5px,transparent 10px)';
const clock = (minutes: number) => `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;

export function DietFastingControls({ cfg,setCfg }: Props) {
  const f = cfg.fasting || defaultFasting();
  const change = (patch: Partial<typeof f>) => setCfg(c => ({ ...c,fasting:{ ...(c.fasting || defaultFasting()),...patch } }));
  const length = f.fullDay ? 24 : ((Number(f.end.slice(0,2))*60+Number(f.end.slice(3)) - Number(f.start.slice(0,2))*60-Number(f.start.slice(3))+1440)%1440)/60;
  return <div aria-label="Fasting settings" style={{ border,padding:12,marginBottom:14 }}>
    <div style={{color:acid,fontSize:11,marginBottom:8,display:'flex',alignItems:'center',gap:6}}>{ico(Hourglass)}Fasting schedule</div>
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{FASTING_TYPES.map(t => <button type="button" key={t.id} aria-pressed={f.type === t.id} style={{...button,display:'inline-flex',alignItems:'center',gap:5,color:f.type===t.id?acid:undefined}} onClick={() => change({type:t.id,...(t.id==='daniel'?{fullDay:false}:{})})}>{FASTING_ICON[t.id] && ico(FASTING_ICON[t.id])}{t.label}</button>)}</div>
    <p style={{borderLeft:`2px solid ${acid}`,padding:'2px 0 2px 10px',margin:'10px 0 0',fontSize:12,lineHeight:1.5,color:'#F5F2EA'}}><strong>{FASTING_TYPES.find(t=>t.id===f.type)?.label}:</strong> {FASTING_ABOUT[f.type]}</p>
    {f.type !== 'none' && <>
      {f.type !== 'daniel' && <>
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',marginTop:12}}>{[16,18,20].map(hours => <button type="button" key={hours} aria-pressed={!f.fullDay && length===hours} style={{...button,display:'inline-flex',alignItems:'center',gap:5}} onClick={() => change({start:'20:00',end:clock((20*60+hours*60)%1440),fullDay:false})}>{ico(Clock,11)}{hours}:{24-hours}</button>)}
          <label style={{fontSize:12}}><input type="checkbox" checked={!!f.fullDay} onChange={e => change({fullDay:e.target.checked})} /> Full-day fast (24h)</label>
          <span style={{fontSize:11,color:muted}}>{length}h fasting · {24-length}h eating window</span>
        </div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:10}}>
          <label style={{fontSize:11}}>Fast starts<input aria-label="Fast starts" type="time" disabled={f.fullDay} style={input} value={f.start} onChange={e => change({start:e.target.value})} /></label>
          <label style={{fontSize:11}}>Fast ends<input aria-label="Fast ends" type="time" disabled={f.fullDay} style={input} value={f.end} onChange={e => change({end:e.target.value})} /></label>
        </div>
      </>}
      <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center',marginTop:10}}><span style={{fontSize:11,color:muted}}>{f.fullDay?'Full fast days':'Fast start days'}:</span>{WEEK.map(w => <button type="button" key={w.day} aria-label={`Fast starts ${w.short}`} aria-pressed={f.days.includes(w.day)} style={{...button,color:f.days.includes(w.day)?acid:muted}} onClick={() => change({days:f.days.includes(w.day)?f.days.filter(d=>d!==w.day):[...f.days,w.day]})}>{w.short}</button>)}</div>
      <p style={{fontSize:11,color:muted,marginBottom:0}}>{f.type==='daniel' ? 'Daniel fasting restricts food types, not meal times. Choose plant-based meals and review ingredients against your Daniel-fast rules; recipes are not automatically certified compliant.' : 'Hatched periods are not eating windows. Overnight fasts continue into the next day. Existing meals remain for review; auto-fill skips these slots. Only plain-water matches are offered during food fasting; verify ingredients.'} Supplement timing remains editable—check any take-with-food instructions.</p>
      {f.type==='dry' && <p role="note" style={{fontSize:12,color:'#E8B86A'}}>Dry fasting restricts fluids and can be dangerous. This planner is not medical advice; seek qualified medical guidance.</p>}
    </>}
  </div>;
}

export function FastingDayCell({ cfg,day }: { cfg:DietConfig;day:number }) {
  const windows = fastingWindows(cfg,day).sort((a,b)=>a[0]-b[0]);
  const label = WEEK.find(w=>w.day===day)!.short;
  return <div aria-label={`${label} fasting periods`} style={{border,padding:6,fontSize:10,color:muted}}>
    <div style={{display:'flex',justifyContent:'space-between',fontSize:9}}><span>00</span><span>12</span><span>24</span></div>
    <div role="img" aria-label={windows.length?windows.map(([s,e])=>`${clock(s)}–${clock(e)} fasting`).join(', '):'No no-food period'} style={{position:'relative',height:18,background:'#171C12',border}}>{windows.map(([s,e])=><span key={s} style={{position:'absolute',top:0,bottom:0,left:`${s/14.4}%`,width:`${(e-s)/14.4}%`,background:fastHatch,borderLeft:border,borderRight:border}} />)}</div>
    <div style={{marginTop:4}}>{windows.length?windows.map(([s,e])=>`${clock(s)}–${clock(e)}`).join(' · '):cfg.fasting?.type==='daniel'&&cfg.fasting.days.includes(day)?'Daniel food restrictions':'No fasting window'}</div>
  </div>;
}

/** The supplement editor for one day and period (opened from that day's timeline): time, items, copy to all days. */
export function SupplementEditor({ cfg,setCfg,accessToken,day,period,onClose }: Props & { accessToken:string; day:number; period:SupplementPeriod; onClose:()=>void }) {
  const update = (d:number,p:SupplementPeriod,patch:Partial<ReturnType<typeof supplementCell>>) => setCfg(c => ({...c,supplementPlan:{...c.supplementPlan,[`${d}:${p}`]:{...supplementCell(c,d,p),...patch}}}));
  const selected = supplementCell(cfg,day,period);
  const short = WEEK.find(w=>w.day===day)!.short;
  return <div style={{gridColumn:'1 / -1',border,padding:14}}>
    <label style={{fontSize:11,color:muted,display:'inline-flex',alignItems:'center',gap:6,marginBottom:10}}>{ico(Clock,11)}Time<input type="time" aria-label={`${short} ${period} supplement time`} value={selected.time} style={{...input,width:120}} onChange={e=>update(day,period,{time:e.target.value})} /></label>
    <SupplementPicker key={`${day}:${period}`} accessToken={accessToken} title={`${short} ${period} supplements`} items={selected.items} onChange={items=>update(day,period,{items})} />
    <div style={{display:'flex',gap:8,marginTop:12}}><button type="button" style={button} onClick={()=>setCfg(c=>({...c,supplementPlan:{...c.supplementPlan,...Object.fromEntries(WEEK.map(w=>[`${w.day}:${period}`,structuredClone(supplementCell(c,day,period))]))}}))}>Apply this period to all days</button><button type="button" style={button} onClick={onClose}>Close supplement editor</button></div>
  </div>;
}
