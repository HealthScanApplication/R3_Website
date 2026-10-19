/*
 * VideoStudio — short videos for an offer path, made with Higgsfield on the Guardian's OWN account.
 * The Guardian connects once with their Higgsfield API key ID + secret (Higgsfield's REST API has no OAuth);
 * the `higgsfield` Edge Function keeps them encrypted and makes every call, so the browser never holds them.
 * The prompt is pre-filled from the same brief as the posts (audience, problem or goal, offer) and the selected
 * brand's look; a short script (hook, lines, CTA) is drafted in the brand's voice. The post's static text layer
 * (same text styles and positions as image posts) sits over the video and can be burned into the download.
 * Every draft stays editable; once edited, a brief change no longer overwrites it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, Film, ImageDown, KeyRound, LogIn, Loader2, RotateCcw, Type, Unplug } from 'lucide-react';
import { RatioGlyph, StyleThumb, drawPost, guardianHandle, qrLink, TEXT_POSITIONS, TEXT_STYLES, type PostBrand, type TextPosition, type TextStyleId } from './ContentStudio';
import { draftVideoScript, parseScript, scriptPrompt, scriptText } from '../../utils/videoScript';
import { OVERLAY_FORMATS, recordWithOverlay } from '../../utils/videoOverlay';
import { buildVideoPrompt, VIDEO_ASPECTS, VIDEO_PROMPT_MAX, type VideoAspect } from '../../utils/videoPrompt';
import type { BrandKit } from '../../utils/brandKit';
import { postCopy, type CopyKind, type CopyOffer } from '../../utils/postCopy';
import { connectHiggsfield, costCopy, startHiggsfieldLogin, takeLoginOutcome, disconnectHiggsfield, estimateVideo, generateVideo, higgsfieldStatus, isFinished, listVideos, pollDelay, pollVideo, progressOf, type HiggsfieldStatus, type VideoEstimate, type VideoJob } from '../../utils/higgsfieldVideo';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', acid = '#C7D8A3', warn = '#E8B07A';
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 38, border: `1px solid ${line}`, background: '#090A08', color: ink, padding: '0 10px', fontSize: 13, borderRadius: 2 };
const lab: React.CSSProperties = { display: 'block', color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', margin: '0 0 5px' };
const primary: React.CSSProperties = { height: 42, border: `1px solid ${ink}`, background: ink, color: '#090A08', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none' };
const quiet: React.CSSProperties = { border: 0, background: 'transparent', color: muted, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: 0 };
const ratio = (a: string) => a.replace(':', ' / ');

/** A suggested value the Guardian can edit; edits stick until "Use suggested" (a brief change won't overwrite them). */
function useDraft(suggested: string): [string, (v: string) => void, boolean, () => void] {
  const [value, setValue] = useState(suggested);
  const [edited, setEdited] = useState(false);
  useEffect(() => { if (!edited) setValue(suggested); }, [suggested, edited]);
  return [value, (v) => { setValue(v); setEdited(true); }, edited, () => setEdited(false)];
}
const saveBlob = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 10000); };

export function VideoStudio({ creator, avatar = null, audience, problem, focusKind, offer, free, siteUrl = '', brandName, kit = null, brandId = null, postBrand = null, kind, copyOffer = null }: {
  kind?: CopyKind; copyOffer?: CopyOffer | null;
  creator: string; avatar?: string | null; audience: string; problem: string; focusKind?: 'problem' | 'goal'; offer?: string; free?: boolean; siteUrl?: string;
  brandName?: string; kit?: BrandKit | null; brandId?: string | null; postBrand?: PostBrand | null;
}) {
  const [status, setStatus] = useState<HiggsfieldStatus | null>(null);
  const [setupError, setSetupError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'connect' | 'login' | 'disconnect' | 'generate'>('');
  const [connectWith, setConnectWith] = useState<'login' | 'api_key'>('login');
  const [notice, setNotice] = useState('');
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [aspect, setAspect] = useState<VideoAspect>('9:16');
  const [modelId, setModelId] = useState('kling-3-std');
  const [duration, setDuration] = useState(5);
  const suggested = useMemo(() => buildVideoPrompt({ audience, problem, offer, brandName: brandName || creator, kit, aspect }), [audience, problem, offer, brandName, creator, kit, aspect]);
  const [prompt, setPrompt, edited, resetPrompt] = useDraft(suggested);
  // Script in the brand's voice. The static text layer uses the same short post copy as the Content studio
  // (≤5-word headline, ≤8-word subline) rather than the script's longer spoken lines.
  const scriptBrief = { audience, focus: problem, focusKind, offer, free, creator, brandName: brandName || creator, kit, format: `${aspect} video` };
  const draft = useMemo(() => draftVideoScript(scriptBrief), [audience, problem, focusKind, offer, free, creator, brandName, kit]); // eslint-disable-line react-hooks/exhaustive-deps
  const [script, setScript, scriptEdited, resetScript] = useDraft(scriptText(draft));
  const beats = parseScript(script);
  const short = useMemo(() => postCopy({ audience, problem, offer: copyOffer || (offer ? { title: offer, free } : null), kind: kind || (offer ? 'offer' : 'none') }), [audience, problem, offer, free, kind, copyOffer]);
  const [headline, setHeadline, headEdited, resetHead] = useDraft(short.headline || beats.hook);
  const [subline, setSubline, subEdited, resetSub] = useDraft(short.subline || beats.lines[0] || '');
  const [cta, setCta, ctaEdited, resetCta] = useDraft(short.cta || (beats.cta || '').replace(/\s+at the link in bio\.?$|\.$/i, ''));
  const [showText, setShowText] = useState(true);
  const [textStyle, setTextStyle] = useState<TextStyleId>('editorial');
  const [position, setPosition] = useState<TextPosition>('bottom-left');
  const [copied, setCopied] = useState('');
  const [exporting, setExporting] = useState<number | null>(null);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [recent, setRecent] = useState<VideoJob[]>([]);
  const [, tick] = useState(0);

  useEffect(() => {
    // Back from the Higgsfield login page?
    const outcome = takeLoginOutcome();
    if (outcome === 'connected') setNotice('Logged in with Higgsfield.');
    else if (outcome === 'cancelled') setNotice('Higgsfield login was cancelled.');
    else if (outcome === 'error') setError('Higgsfield login didn’t finish. Try again, or connect with an API key.');
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

  // The post's text layer, drawn transparent at the format's full size and laid over the video.
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fmt = OVERLAY_FORMATS[aspect];
  const qr = siteUrl ? qrLink(siteUrl) : undefined;
  useEffect(() => {
    let stale = false;
    if (overlayRef.current && showText) drawPost(overlayRef.current, fmt, '', { headline, subline, cta, credit: creator ? `Guidance by ${creator}${guardianHandle(siteUrl) ? ` · ${guardianHandle(siteUrl)}` : ''}` : '', qr, brand: postBrand, style: textStyle, position, avatar }, () => stale).catch(() => {}); // a font or logo that fails to load just leaves the layer as is
    return () => { stale = true; };
  }, [fmt, headline, subline, cta, creator, qr, postBrand, textStyle, position, showText, status?.connected, avatar]);
  const copyText = (key: string, text: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(key); window.setTimeout(() => setCopied(''), 1600); }); };
  const fileBase = `routine3-${problem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video'}-${aspect.replace(':', 'x')}`;
  const downloadTextLayer = () => overlayRef.current?.toBlob((b) => b && saveBlob(b, `${fileBase}-text.png`), 'image/png');
  const exportWithText = async () => {
    if (!job?.video_url || !overlayRef.current) return;
    setExporting(0); setError('');
    try { const { blob, ext } = await recordWithOverlay(job.video_url, overlayRef.current, setExporting); saveBlob(blob, `${fileBase}-with-text.${ext}`); }
    catch (e) { setError(`${(e as Error).message || 'Could not add the text to this video.'} You can download the video and the text layer separately.`); }
    finally { setExporting(null); }
  };

  const model = status?.models.find((m) => m.id === modelId) || status?.models[0];
  const delivered = model?.aspects.find((a) => a.aspect === aspect)?.delivered || aspect;
  useEffect(() => { if (model) setDuration((d) => Math.min(model.durations[1], Math.max(model.durations[0], d))); }, [model]);
  // Cost before generating; refreshed (debounced) when the model, format or length changes. Never spends anything.
  const [estimate, setEstimate] = useState<VideoEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  useEffect(() => {
    if (!status?.connected || !model || !(duration > 0)) return;
    let stale = false; setEstimating(true);
    const t = window.setTimeout(() => {
      estimateVideo({ model: model.id, aspect_ratio: aspect, duration })
        .then((r) => { if (!stale) setEstimate(r.estimate); }).catch(() => { if (!stale) setEstimate(null); })
        .finally(() => { if (!stale) setEstimating(false); });
    }, 400);
    return () => { stale = true; window.clearTimeout(t); };
  }, [status?.connected, model?.id, aspect, duration]); // eslint-disable-line react-hooks/exhaustive-deps
  const cost = costCopy(estimating ? null : estimate, duration, model?.label || 'this model');

  const connect = async () => {
    setBusy('connect'); setError('');
    try { const r = await connectHiggsfield(keyId, secret); setStatus((s) => s && { ...s, connected: true, method: 'api_key', key_hint: r.key_hint }); setKeyId(''); setSecret(''); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const login = async () => {
    setBusy('login'); setError('');
    try { const { url } = await startHiggsfieldLogin(window.location.href); window.location.assign(url); }
    catch (e) { setError((e as Error).message); setBusy(''); }
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
        <span>{status.method === 'oauth' ? `Logged in with Higgsfield · ${status.key_hint || ''}` : `Connected · key …${status.key_hint}`}</span>
        <button type="button" onClick={disconnect} disabled={busy === 'disconnect'} style={quiet}><Unplug size={12} />Disconnect</button>
      </span>}
    </div>
    {children}
 {notice && <p role="status" style={{ color: acid, fontSize: 12, margin: '0 0 12px' }}>{notice}</p>}
    {error && <p role="alert" style={{ color: warn, fontSize: 12, margin: '12px 0 0' }}>{error}</p>}
  </section>;

  if (setupError) return shell(<p style={{ color: muted, fontSize: 12, margin: 0 }}>Video generation isn’t switched on here yet. ({setupError})</p>);
  if (!status) return shell(<p style={{ color: muted, fontSize: 12, margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={14} className="animate-spin" />Checking your Higgsfield connection…</p>);

  const tab = (id: 'login' | 'api_key', title: string, note: string) => <button type="button" aria-pressed={connectWith === id} onClick={() => setConnectWith(id)} style={{ border: `1px solid ${connectWith === id ? acid : line}`, background: connectWith === id ? '#20251B' : 'transparent', color: ink, textAlign: 'left', padding: '9px 11px', cursor: 'pointer' }}><strong style={{ display: 'block', fontSize: 12 }}>{title}</strong><span style={{ display: 'block', color: muted, fontSize: 10, marginTop: 2 }}>{note}</span></button>;
  if (!status.connected) return shell(<div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
    <p style={{ color: ink, fontSize: 13, lineHeight: 1.55, margin: 0 }}>Make videos with your own Higgsfield account. Choose how to connect it:</p>
    <div role="group" aria-label="How to connect Higgsfield" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {tab('login', 'Log in with Higgsfield', 'Uses your Higgsfield plan credits')}
      {tab('api_key', 'Use an API key', 'Uses your Higgsfield API balance')}
    </div>
    {connectWith === 'login' ? <>
      <p style={{ color: muted, fontSize: 12, lineHeight: 1.55, margin: 0 }}>You’ll sign in on Higgsfield and approve ROUTINE³, then come straight back here. Needs a paid Higgsfield plan.</p>
      <button type="button" onClick={login} disabled={busy === 'login'} style={primary}>{busy === 'login' ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />} Log in with Higgsfield</button>
      <p style={{ color: muted, fontSize: 10.5, lineHeight: 1.5, margin: 0 }}>ROUTINE³ never sees your Higgsfield password. The login is stored encrypted, and you can disconnect at any time.</p>
    </> : <>
      <ol style={{ color: muted, fontSize: 12, lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
        <li>Open <a href="https://open.higgsfield.ai" target="_blank" rel="noopener noreferrer" style={{ color: acid }}>open.higgsfield.ai</a>, add API balance, and create an API key. API balance is separate from a Higgsfield plan.</li>
        <li>Paste its key ID and secret below. The secret is shown only once on Higgsfield.</li>
      </ol>
      <label><span style={lab}>API key ID</span><input value={keyId} onChange={(e) => setKeyId(e.target.value)} autoComplete="off" spellCheck={false} style={field} /></label>
      <label><span style={lab}>API key secret</span><input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" spellCheck={false} style={field} /></label>
      <button type="button" onClick={connect} disabled={!keyId.trim() || busy === 'connect'} style={{ ...primary, opacity: keyId.trim() ? 1 : 0.5 }}>{busy === 'connect' ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Connect Higgsfield</button>
      <p style={{ color: muted, fontSize: 10.5, lineHeight: 1.5, margin: 0 }}>ROUTINE³ stores the key encrypted and uses it only when you click Generate. It never reaches your browser again, and you can disconnect at any time.</p>
    </>}
  </div>);

  const progress = job ? progressOf(job) : null;
  return shell(<div className="g-split">
    <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
      <div><span style={lab}>Format</span><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>{VIDEO_ASPECTS.map((f) => <button key={f.id} type="button" aria-pressed={aspect === f.id} onClick={() => setAspect(f.id)} style={{ minHeight: 44, border: `1px solid ${aspect === f.id ? acid : line}`, background: aspect === f.id ? '#20251B' : 'transparent', color: ink, textAlign: 'left', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}><RatioGlyph ratio={f.id} on={aspect === f.id} /><span><strong style={{ display: 'block', fontSize: 12 }}>{f.id}</strong><span style={{ display: 'block', color: muted, fontSize: 9.5 }}>{f.platforms}</span></span></button>)}</div>
        {delivered !== aspect && <span style={{ display: 'block', color: muted, fontSize: 10, marginTop: 5 }}>Higgsfield has no {aspect} video, so this renders at {delivered}; Instagram’s feed shows it as {aspect}.</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8 }}>
        <label><span style={lab}>Model</span><select value={model?.id} onChange={(e) => setModelId(e.target.value)} style={field}>{status.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        <label><span style={lab}>Seconds</span><input type="number" min={model?.durations[0]} max={model?.durations[1]} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={field} /></label>
      </div>
      <div><div style={{ ...lab, display: 'flex', justifyContent: 'space-between' }}><label htmlFor="video-prompt">Prompt</label>{edited && <button type="button" onClick={resetPrompt} style={quiet}><RotateCcw size={11} />Use suggested</button>}</div>
        <textarea id="video-prompt" value={prompt} maxLength={VIDEO_PROMPT_MAX} onChange={(e) => setPrompt(e.target.value)} rows={8} style={{ ...field, height: 'auto', padding: 10, lineHeight: 1.5, resize: 'vertical' }} />
        <span style={{ display: 'block', color: muted, fontSize: 9.5, marginTop: 4 }}>Built from your audience, {problem.toLowerCase()}{offer ? ', the offer' : ''}{kit && brandName ? ` and ${brandName}’s visual language` : ''}. {prompt.length}/{VIDEO_PROMPT_MAX}</span>
      </div>
      <button type="button" onClick={generate} disabled={busy === 'generate' || (!!job && !isFinished(job.status)) || prompt.trim().length < 10} style={primary}>{busy === 'generate' ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />} Generate {duration}s video{cost.short ? ` · ${cost.short}` : ''}</button>
      <span aria-live="polite" style={{ color: muted, fontSize: 10, lineHeight: 1.5 }}>{estimating ? 'Checking the price…' : cost.detail} {status.method === 'oauth' ? 'Paid from your Higgsfield plan' : 'Paid from your Higgsfield API balance'}{status.live ? '' : ' (test mode: nothing is spent)'}.{status.live && status.method === 'oauth' ? ' Making videos through a Higgsfield login is still being set up; connect with an API key to generate now.' : ''} Failed or blocked videos aren’t charged.</span>
      <div style={{ borderTop: `1px solid ${line}`, paddingTop: 12 }}><div style={{ ...lab, display: 'flex', justifyContent: 'space-between', gap: 8 }}><label htmlFor="video-script">Script · hook, lines, call to action</label>{scriptEdited && <button type="button" onClick={resetScript} style={quiet}><RotateCcw size={11} />Use suggested</button>}</div>
        <textarea id="video-script" value={script} onChange={(e) => setScript(e.target.value)} rows={5} style={{ ...field, height: 'auto', padding: 10, lineHeight: 1.5, resize: 'vertical' }} />
        <span style={{ display: 'flex', gap: 14, marginTop: 5 }}>
          <button type="button" onClick={() => copyText('script', script)} style={quiet}><Copy size={11} />{copied === 'script' ? 'Copied' : 'Copy script'}</button>
          <button type="button" onClick={() => copyText('ai', scriptPrompt(scriptBrief))} style={quiet}><Copy size={11} />{copied === 'ai' ? 'Copied' : 'Copy AI prompt for a script'}</button>
        </span>
        <span style={{ display: 'block', color: muted, fontSize: 9.5, marginTop: 4 }}>For your voice-over or captions{kit?.voice ? `, in ${brandName || 'your brand'}’s voice` : ''}. The first line is the hook, the last is the call to action.</span>
      </div>
      <div style={{ borderTop: `1px solid ${line}`, paddingTop: 12, display: 'grid', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: ink, fontSize: 12, cursor: 'pointer' }}><input type="checkbox" checked={showText} onChange={(e) => setShowText(e.target.checked)} /><Type size={13} />Text on the video, like the image posts</label>
        {showText && <>
          <div><span style={lab}>Text style</span><div role="group" aria-label="Video text style" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
{TEXT_STYLES.map((t) => <button key={t.id} type="button" aria-pressed={textStyle === t.id} aria-label={`${t.label} text style`} onClick={() => setTextStyle(t.id)} style={{ border: `1px solid ${textStyle === t.id ? acid : line}`, outline: textStyle === t.id ? `1px solid ${acid}` : 'none', background: '#090A08', padding: 4, cursor: 'pointer', display: 'grid', gap: 4 }}>
            <StyleThumb styleId={t.id} bg="/images/content/12-evening-reset.webp" headline={headline} subline={subline} cta={cta} credit={creator ? `Guidance by ${creator}${guardianHandle(siteUrl) ? ` · ${guardianHandle(siteUrl)}` : ''}` : ''} brand={postBrand} position={position} fontsReady={0} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: textStyle === t.id ? acid : muted, padding: '1px 0 2px' }}>{t.label}</span></button>)}</div></div>
          <label><span style={lab}>Text position</span><select aria-label="Video text position" value={position} onChange={(e) => setPosition(e.target.value as TextPosition)} style={field}>{TEXT_POSITIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          {([['Headline', headline, setHeadline, headEdited, resetHead], ['Subline', subline, setSubline, subEdited, resetSub], ['Button', cta, setCta, ctaEdited, resetCta]] as const).map(([name, value, set, isEdited, reset]) => <div key={name}>
            <div style={{ ...lab, display: 'flex', justifyContent: 'space-between' }}><label htmlFor={`video-${name}`}>Video {name.toLowerCase()}</label>{isEdited && <button type="button" onClick={reset} style={quiet}><RotateCcw size={11} />From script</button>}</div>
            <input id={`video-${name}`} value={value} onChange={(e) => set(e.target.value)} style={field} /></div>)}
        </>}
      </div>
      {recent.length > 0 && <div><span style={lab}>Recent</span><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{recent.map((r) => <button key={r.id} type="button" onClick={() => setJob(r)} title={r.prompt} style={{ border: `1px solid ${job?.id === r.id ? acid : line}`, background: 'transparent', color: ink, fontSize: 10, padding: '5px 8px', cursor: 'pointer' }}>{r.aspect_ratio} · {new Date(r.created_at).toLocaleDateString()} · {progressOf(r).label}</button>)}</div></div>}
    </div>
    <div className="g-sticky" style={{ display: 'grid', placeItems: 'center', gap: 10 }}>
      <div style={{ width: aspect === '16:9' ? '100%' : `${Math.round(560 * Number(aspect.split(':')[0]) / Number(aspect.split(':')[1]))}px`, maxWidth: '100%', aspectRatio: ratio(aspect), background: '#090A08', border: `1px solid ${line}`, display: 'grid', placeItems: 'center', overflow: 'hidden', boxShadow: '0 14px 36px rgba(0,0,0,.4)', position: 'relative' }}>
        {job?.status === 'completed' && job.video_url
          ? <video key={job.video_url} src={job.video_url} controls autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ padding: 20, textAlign: 'center', color: muted, fontSize: 12, lineHeight: 1.5 }}>
            {!job && <><Film size={22} color={acid} /><div style={{ marginTop: 8 }}>Your {aspect} video appears here.</div></>}
            {job && !isFinished(job.status) && <><Loader2 size={22} color={acid} className="animate-spin" /><div style={{ marginTop: 8 }}>{progress!.label}…</div></>}
            {job?.status === 'completed' && job.mock && <div>Test mode finished. A real video appears here once Higgsfield is switched on.</div>}
            {job && isFinished(job.status) && job.status !== 'completed' && <div style={{ color: warn }}>{job.error || progress!.label}</div>}
          </div>}
        {showText && <canvas ref={overlayRef} aria-label="Text on the video" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />}
      </div>
      {job && <div style={{ width: '100%', maxWidth: 420 }}>
        <div role="progressbar" aria-label="Video progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress!.fraction * 100)} style={{ height: 3, background: line }}><div style={{ height: '100%', width: '100%', transformOrigin: 'left', transform: `scaleX(${progress!.fraction})`, background: job.status === 'completed' || !isFinished(job.status) ? acid : warn, transition: 'transform .8s ease' }} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: muted, fontSize: 10, marginTop: 6 }}><span>{progress!.label}</span><span>{job.aspect_ratio} · {job.duration_seconds}s</span></div>
      </div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {job?.status === 'completed' && job.video_url && showText && <button type="button" onClick={exportWithText} disabled={exporting !== null} style={{ ...primary, padding: '0 18px' }}>{exporting !== null ? <><Loader2 size={14} className="animate-spin" /> Adding text… {Math.round(exporting * 100)}%</> : <><Download size={14} /> Download with text</>}</button>}
        {job?.status === 'completed' && job.video_url && <a href={job.video_url} download style={{ ...primary, padding: '0 18px', background: 'transparent', color: ink }}><Download size={14} /> {showText ? 'Video only' : 'Download MP4'}</a>}
        {showText && <button type="button" onClick={downloadTextLayer} style={{ ...primary, padding: '0 14px', background: 'transparent', color: ink, border: `1px solid ${line}` }}><ImageDown size={14} /> Text layer PNG</button>}
      </div>
    </div>
  </div>);
}
