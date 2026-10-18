/*
 * VideoStudio — short videos for an offer path, made with Higgsfield on the Guardian's OWN account.
 * The Guardian connects once with their Higgsfield API key ID + secret (Higgsfield's REST API has no OAuth);
 * the `higgsfield` Edge Function keeps them encrypted and makes every call, so the browser never holds them.
 * The prompt is pre-filled from the same brief as the posts (audience, problem or goal, offer) and the selected
 * brand's tone and look, and stays editable.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Film, KeyRound, Loader2, RotateCcw, Unplug } from 'lucide-react';
import { buildVideoPrompt, VIDEO_ASPECTS, VIDEO_PROMPT_MAX, type BrandStyle, type VideoAspect } from '../../utils/videoPrompt';
import { connectHiggsfield, disconnectHiggsfield, generateVideo, higgsfieldStatus, isFinished, listVideos, pollDelay, pollVideo, progressOf, type HiggsfieldStatus, type VideoJob } from '../../utils/higgsfieldVideo';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', acid = '#C7D8A3', warn = '#E8B07A';
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 38, border: `1px solid ${line}`, background: '#090A08', color: ink, padding: '0 10px', fontSize: 13, borderRadius: 2 };
const lab: React.CSSProperties = { display: 'block', color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', margin: '0 0 5px' };
const primary: React.CSSProperties = { height: 42, border: `1px solid ${ink}`, background: ink, color: '#090A08', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none' };
const quiet: React.CSSProperties = { border: 0, background: 'transparent', color: muted, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: 0 };
const ratio = (a: string) => a.replace(':', ' / ');

export function VideoStudio({ creator, audience, problem, offer, brand = null, brandId = null }: { creator: string; audience: string; problem: string; offer?: string; brand?: BrandStyle | null; brandId?: string | null }) {
  const [status, setStatus] = useState<HiggsfieldStatus | null>(null);
  const [setupError, setSetupError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'connect' | 'disconnect' | 'generate'>('');
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [aspect, setAspect] = useState<VideoAspect>('9:16');
  const [modelId, setModelId] = useState('kling-3-std');
  const [duration, setDuration] = useState(5);
  const suggested = useMemo(() => buildVideoPrompt({ audience, problem, offer, creator, brand, aspect }), [audience, problem, offer, creator, brand, aspect]);
  const [prompt, setPrompt] = useState(suggested);
  const [edited, setEdited] = useState(false);
  useEffect(() => { if (!edited) setPrompt(suggested); }, [suggested, edited]);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [recent, setRecent] = useState<VideoJob[]>([]);
  const [, tick] = useState(0);

  useEffect(() => {
    higgsfieldStatus().then((s) => { setStatus(s); if (s.connected) listVideos().then((r) => setRecent(r.jobs)).catch(() => {}); })
      .catch((e) => setSetupError((e as Error).message || 'Video generation is not available here yet.'));
  }, []);

  // Poll the running job with backoff (2 s → 10 s); stop when it finishes or the component unmounts.
  const jobId = job && !isFinished(job.status) ? job.id : null;
  const attempt = useRef(0);
  useEffect(() => {
    if (!jobId) return;
    let stop = false, timer = 0;
    attempt.current = 0;
    const next = () => { timer = window.setTimeout(async () => {
      try {
        const { job: j, warning } = await pollVideo(jobId);
        if (stop) return;
        setJob(j); if (warning) setError(warning);
        if (isFinished(j.status)) { setRecent((list) => [j, ...list.filter((x) => x.id !== j.id)].slice(0, 12)); return; }
      } catch (e) { if (!stop) setError((e as Error).message); }
      attempt.current += 1; if (!stop) next();
    }, pollDelay(attempt.current)); };
    next();
    const clock = window.setInterval(() => tick((n) => n + 1), 1000); // keeps the progress bar moving between polls
    return () => { stop = true; window.clearTimeout(timer); window.clearInterval(clock); };
  }, [jobId]);

  const model = status?.models.find((m) => m.id === modelId) || status?.models[0];
  const delivered = model?.aspects.find((a) => a.aspect === aspect)?.delivered || aspect;
  useEffect(() => { if (model) setDuration((d) => Math.min(model.durations[1], Math.max(model.durations[0], d))); }, [model]);

  const connect = async () => {
    setBusy('connect'); setError('');
    try { const r = await connectHiggsfield(keyId, secret); setStatus((s) => s && { ...s, connected: true, key_hint: r.key_hint }); setKeyId(''); setSecret(''); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect Higgsfield? Your key is deleted from ROUTINE³. Videos you made stay here.')) return;
    setBusy('disconnect'); setError('');
    try { await disconnectHiggsfield(); setStatus((s) => s && { ...s, connected: false, key_hint: null }); setJob(null); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const generate = async () => {
    if (!model) return;
    setBusy('generate'); setError('');
    try { const r = await generateVideo({ model: model.id, prompt, aspect_ratio: aspect, duration, brand_id: brandId }); setJob(r.job); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  const shell = (children: React.ReactNode) => <section aria-label="Video studio" style={{ borderTop: `1px solid ${line}`, padding: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <span><span style={{ ...lab, color: acid, marginBottom: 6 }}>Video · Higgsfield</span><strong style={{ color: ink, fontSize: 20, fontWeight: 400, fontFamily: '"CanelaText", Georgia, serif' }}>Generate a short video</strong></span>
      {status?.connected && <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center', color: muted, fontSize: 10 }}>
        {!status.live && <span title="The video service runs in test mode on this environment: no Higgsfield calls, no credits spent." style={{ border: `1px solid ${warn}`, color: warn, padding: '3px 7px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 9 }}>Test mode</span>}
        <span>Connected · key …{status.key_hint}</span>
        <button type="button" onClick={disconnect} disabled={busy === 'disconnect'} style={quiet}><Unplug size={12} />Disconnect</button>
      </span>}
    </div>
    {children}
    {error && <p role="alert" style={{ color: warn, fontSize: 12, margin: '12px 0 0' }}>{error}</p>}
  </section>;

  if (setupError) return shell(<p style={{ color: muted, fontSize: 12, margin: 0 }}>Video generation isn’t switched on here yet. ({setupError})</p>);
  if (!status) return shell(<p style={{ color: muted, fontSize: 12, margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={14} className="animate-spin" />Checking your Higgsfield connection…</p>);

  if (!status.connected) return shell(<div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
    <p style={{ color: ink, fontSize: 13, lineHeight: 1.55, margin: 0 }}>Make videos with your own Higgsfield account. Videos are paid from your <strong>Higgsfield API balance</strong>, which is separate from a Higgsfield subscription.</p>
    <ol style={{ color: muted, fontSize: 12, lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
      <li>Open <a href="https://open.higgsfield.ai" target="_blank" rel="noopener noreferrer" style={{ color: acid }}>open.higgsfield.ai</a>, add API balance, and create an API key.</li>
      <li>Paste its key ID and secret below. The secret is shown only once on Higgsfield.</li>
    </ol>
    <label><span style={lab}>API key ID</span><input value={keyId} onChange={(e) => setKeyId(e.target.value)} autoComplete="off" spellCheck={false} style={field} /></label>
    <label><span style={lab}>API key secret</span><input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" spellCheck={false} style={field} /></label>
    <button type="button" onClick={connect} disabled={!keyId.trim() || busy === 'connect'} style={{ ...primary, opacity: keyId.trim() ? 1 : 0.5 }}>{busy === 'connect' ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Connect Higgsfield</button>
    <p style={{ color: muted, fontSize: 10.5, lineHeight: 1.5, margin: 0 }}>ROUTINE³ stores the key encrypted and uses it only when you click Generate. It never reaches your browser again, and you can disconnect at any time.</p>
  </div>);

  const progress = job ? progressOf(job) : null;
  return shell(<div className="g-split">
    <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
      <div><span style={lab}>Format</span><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>{VIDEO_ASPECTS.map((f) => <button key={f.id} type="button" aria-pressed={aspect === f.id} onClick={() => setAspect(f.id)} style={{ minHeight: 44, border: `1px solid ${aspect === f.id ? acid : line}`, background: aspect === f.id ? '#20251B' : 'transparent', color: ink, textAlign: 'left', padding: '6px 10px', cursor: 'pointer' }}><strong style={{ display: 'block', fontSize: 12 }}>{f.id}</strong><span style={{ display: 'block', color: muted, fontSize: 9.5 }}>{f.platforms}</span></button>)}</div>
        {delivered !== aspect && <span style={{ display: 'block', color: muted, fontSize: 10, marginTop: 5 }}>Higgsfield has no {aspect} video, so this renders at {delivered}; Instagram’s feed shows it as {aspect}.</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8 }}>
        <label><span style={lab}>Model</span><select value={model?.id} onChange={(e) => setModelId(e.target.value)} style={field}>{status.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        <label><span style={lab}>Seconds</span><input type="number" min={model?.durations[0]} max={model?.durations[1]} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={field} /></label>
      </div>
      <div><div style={{ ...lab, display: 'flex', justifyContent: 'space-between' }}><label htmlFor="video-prompt">Prompt</label>{edited && <button type="button" onClick={() => setEdited(false)} style={quiet}><RotateCcw size={11} />Use suggested</button>}</div>
        <textarea id="video-prompt" value={prompt} maxLength={VIDEO_PROMPT_MAX} onChange={(e) => { setPrompt(e.target.value); setEdited(true); }} rows={8} style={{ ...field, height: 'auto', padding: 10, lineHeight: 1.5, resize: 'vertical' }} />
        <span style={{ display: 'block', color: muted, fontSize: 9.5, marginTop: 4 }}>Built from your audience, {problem.toLowerCase()}{offer ? ', the offer' : ''}{brand ? ` and ${brand.name}’s tone and look` : ''}. {prompt.length}/{VIDEO_PROMPT_MAX}</span>
      </div>
      <button type="button" onClick={generate} disabled={busy === 'generate' || (!!job && !isFinished(job.status)) || prompt.trim().length < 10} style={primary}>{busy === 'generate' ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />} Generate {duration}s video</button>
      <span style={{ color: muted, fontSize: 10 }}>Uses your Higgsfield API balance{status.live ? '' : ' (test mode: nothing is spent)'}. Failed or blocked videos aren’t charged.</span>
      {recent.length > 0 && <div><span style={lab}>Recent</span><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{recent.map((r) => <button key={r.id} type="button" onClick={() => setJob(r)} title={r.prompt} style={{ border: `1px solid ${job?.id === r.id ? acid : line}`, background: 'transparent', color: ink, fontSize: 10, padding: '5px 8px', cursor: 'pointer' }}>{r.aspect_ratio} · {new Date(r.created_at).toLocaleDateString()} · {progressOf(r).label}</button>)}</div></div>}
    </div>
    <div className="g-sticky" style={{ display: 'grid', placeItems: 'center', gap: 10 }}>
      <div style={{ width: aspect === '16:9' ? '100%' : `${Math.round(560 * Number(aspect.split(':')[0]) / Number(aspect.split(':')[1]))}px`, maxWidth: '100%', aspectRatio: ratio(aspect), background: '#090A08', border: `1px solid ${line}`, display: 'grid', placeItems: 'center', overflow: 'hidden', boxShadow: '0 14px 36px rgba(0,0,0,.4)' }}>
        {job?.status === 'completed' && job.video_url
          ? <video key={job.video_url} src={job.video_url} controls autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ padding: 20, textAlign: 'center', color: muted, fontSize: 12, lineHeight: 1.5 }}>
            {!job && <><Film size={22} color={acid} /><div style={{ marginTop: 8 }}>Your {aspect} video appears here.</div></>}
            {job && !isFinished(job.status) && <><Loader2 size={22} color={acid} className="animate-spin" /><div style={{ marginTop: 8 }}>{progress!.label}…</div></>}
            {job?.status === 'completed' && job.mock && <div>Test mode finished. A real video appears here once Higgsfield is switched on.</div>}
            {job && isFinished(job.status) && job.status !== 'completed' && <div style={{ color: warn }}>{job.error || progress!.label}</div>}
          </div>}
      </div>
      {job && <div style={{ width: '100%', maxWidth: 420 }}>
        <div role="progressbar" aria-label="Video progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress!.fraction * 100)} style={{ height: 3, background: line }}><div style={{ height: '100%', width: '100%', transformOrigin: 'left', transform: `scaleX(${progress!.fraction})`, background: job.status === 'completed' || !isFinished(job.status) ? acid : warn, transition: 'transform .8s ease' }} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: muted, fontSize: 10, marginTop: 6 }}><span>{progress!.label}</span><span>{job.aspect_ratio} · {job.duration_seconds}s</span></div>
      </div>}
      {job?.status === 'completed' && job.video_url && <a href={job.video_url} download style={{ ...primary, padding: '0 18px' }}><Download size={14} /> Download MP4</a>}
    </div>
  </div>);
}
