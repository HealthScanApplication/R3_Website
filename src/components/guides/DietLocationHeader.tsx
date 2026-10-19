import {useEffect,useRef,useState} from 'react';
import {nearestPlannerCity,plannerDate,searchPlannerCities,sunriseForDate,type PlannerLocation} from '../../utils/plannerSunrise';
const control={border:'1px solid rgba(245,242,234,.24)',background:'#11120F',color:'#F5F2EA',padding:'8px 10px',borderRadius:3,fontSize:12};
export function DietLocationHeader({city,onChange,now}:{city?:PlannerLocation;onChange:(city?:PlannerLocation)=>void;now:Date}) {
  const [query,setQuery]=useState(''),[results,setResults]=useState<PlannerLocation[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef(0);
  useEffect(()=>()=>{request.current++;},[]);
  const choose=(value?:PlannerLocation)=>{request.current++;setBusy(false);setOpen(false);onChange(value);setResults([]);setQuery('');setError('');};
  const find=async()=>{const id=++request.current;setBusy(true);setError('');try{const matches=await searchPlannerCities(query);if(id!==request.current)return;setResults(matches);if(!matches.length)setError('No matching city. Try a nearby city or include the country.');}catch{if(id===request.current)setError('City list could not load. Please try again.');}finally{if(id===request.current)setBusy(false);}};
  const locate=()=>{
    if(!navigator.geolocation){setError('Location is unavailable. Choose a city manually.');return;}
    const id=++request.current;setBusy(true);setError('');
    navigator.geolocation.getCurrentPosition(async position=>{try{const next=await nearestPlannerCity(position.coords.latitude,position.coords.longitude);if(id===request.current)choose(next);}catch{if(id===request.current){setBusy(false);setError('City lookup failed. Choose a city manually.');}}},()=>{if(id===request.current){setBusy(false);setError('Location permission was denied or unavailable. Choose a city manually.');}},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  };
  const sunrise=city?sunriseForDate(city,plannerDate(city.timezone,now)):null;
  // With a city set this is one line (each day's sunrise is in its column header); the search opens on Change.
  const [open,setOpen]=useState(false);
  const showForm=!city||open;
  if(city&&!showForm) return <div aria-label="Planner location and sunrise" style={{margin:'12px 0 18px',border:control.border,padding:'8px 12px',display:'flex',alignItems:'center',gap:'6px 14px',flexWrap:'wrap',fontSize:12}}>
    <span style={{color:'#C7D8A3',fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase'}}>Home city</span>
    <span>{city.name}, {city.country} <span style={{color:'#B8B6AF'}}>· {city.timezone}</span></span>
    <span style={{color:'#B8B6AF'}}>Sunrise today · {sunrise?`≈ ${sunrise}`:'No sunrise on this date'} · {plannerDate(city.timezone,now)} (local time)</span>
    <span style={{marginLeft:'auto',display:'flex',gap:6}}><button type="button" style={{...control,padding:'5px 9px'}} onClick={()=>setOpen(true)}>Change city</button><button type="button" style={{...control,padding:'5px 9px'}} onClick={()=>choose()}>Clear city</button></span>
  </div>;
  return <div aria-label="Planner location and sunrise" style={{margin:'12px 0 18px',border:control.border,padding:12}}>
    <div style={{color:'#C7D8A3',fontSize:13,marginBottom:8}}>{city?`${city.name}, ${city.country} · ${city.timezone}`:'Choose a city for sunrise'}</div>
    {city&&<div style={{fontSize:12,marginBottom:10}}>Sunrise today · {sunrise?`≈ ${sunrise}`:'No sunrise on this date'} · {plannerDate(city.timezone,now)} (local time)</div>}
    <form onSubmit={e=>{e.preventDefault();find();}} style={{display:'flex',flexWrap:'wrap',gap:7}}>
      <input aria-label="Planner city" placeholder="City, country" style={{...control,flex:'1 1 180px',minWidth:0}} value={query} onChange={e=>{request.current++;setBusy(false);setResults([]);setQuery(e.target.value);}} />
      <button type="submit" disabled={busy||query.trim().length<2} style={control}>Find city</button>
      <button type="button" disabled={busy} style={control} onClick={locate}>Use my location</button>
      {city&&<button type="button" style={control} onClick={()=>setOpen(false)}>Keep {city.name}</button>}
    </form>
    <div style={{fontSize:10,color:'#B8B6AF',marginTop:7}}>Approximate sunrise for the city centre. Location is requested only when you click; city matching stays on this device. Check the suggested city, especially near borders. No tracking.</div>
    {busy&&<div role="status" style={{fontSize:12,marginTop:8}}>Finding city…</div>}
    {error&&<div role="alert" style={{fontSize:12,color:'#E8B07A',marginTop:8}}>{error}</div>}
    {results.length>0&&<div aria-label="Matching cities" style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>{results.map(c=><button key={`${c.name}:${c.latitude}:${c.longitude}`} type="button" style={control} onClick={()=>choose(c)}>{c.name}, {c.country} · {c.timezone}</button>)}</div>}
  </div>;
}
