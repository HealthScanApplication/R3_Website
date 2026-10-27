/*
 * "Replace with AI" for a Guardian's product or offer image: draw a new picture in the house style, look at it, and
 * only then keep it.
 *
 * It does not run a pipeline of its own. The picture comes from the same `guardian-images` Edge Function the Content
 * builder uses (R³'s daily allowance, or the Guardian's own OpenAI key), through the same browser calls in
 * utils/guardianImages.ts. The prompt is the offer's title and description plus the style: the brand kit's Visual
 * language (Site builder, Brand), or the house pencil sketch when that field is empty. Nothing is generated until the
 * person presses the button that shows the price, nothing replaces the current image until they press Accept, and
 * Accept stores the picture in the guide-assets bucket under their own folder before the caller sets it.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { GuardianModal } from './GuardianModal';
import { chooseImageProvider, dataUrlToFile, generateImage, imageStatus, priceLabel, type GeneratedImage, type ImageStatus } from '../../utils/guardianImages';
import { HOUSE_IMAGE_STYLE, buildImagePrompt, resolveImageStyle, visualLanguageOf } from '../../utils/guardianImageStyle';
import { listGuideBrands, uploadGuideImage } from '../../utils/guidePortal';

const ink = '#F5F2EA';
const muted = '#B8B6AF';
const line = 'rgba(245,242,234,0.24)';
const black = '#090A08';
const acid = '#C7D8A3';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const btn: React.CSSProperties = { minHeight: 40, border: `1px solid ${line}`, background: 'transparent', color: ink, padding: '0 16px', borderRadius: 4, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 };
const primary: React.CSSProperties = { ...btn, background: acid, color: black, borderColor: acid };
const label: React.CSSProperties = { display: 'block', color: muted, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7 };
const linkBtn: React.CSSProperties = { border: 0, background: 'transparent', color: muted, fontFamily: sans, fontSize: 11, textDecoration: 'underline', cursor: 'pointer', padding: 0 };
const frame: React.CSSProperties = { width: '100%', aspectRatio: '1', border: `1px solid ${line}`, background: '#fff', objectFit: 'cover', display: 'block' };
const emptyFrame: React.CSSProperties = { width: '100%', aspectRatio: '1', border: `1px dashed ${line}`, display: 'grid', placeItems: 'center', textAlign: 'center', color: muted, fontFamily: sans, fontSize: 11, padding: 10, boxSizing: 'border-box' };

const ASPECT = '1:1' as const;
const QUALITY = 'medium' as const;
const errorText = (error: unknown) => (error as { message?: string } | null)?.message || 'Something went wrong. Please try again.';

export interface AiImageReplaceProps {
  /** The signed-in Guardian: their folder in guide-assets, and whose brand kit supplies the visual language. */
  userId: string;
  title: string;
  description?: string | null;
  /** guide_offers.kind, or "product" for a shop product. */
  kind?: string | null;
  currentUrl?: string | null;
  /** Called with the stored picture's public address once the person has accepted it. May save it somewhere; a rejection keeps the preview open. */
  onAccepted: (url: string) => void | Promise<void>;
  /** Where the Guardian connects an image provider (the Content builder). Without it the refusal gives the instruction in words only. */
  onOpenContentBuilder?: () => void;
  disabled?: boolean;
  buttonStyle?: React.CSSProperties;
}

export function AiImageReplace({ currentUrl, disabled, buttonStyle, ...rest }: AiImageReplaceProps) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} disabled={disabled} style={{ ...btn, opacity: disabled ? 0.5 : 1, ...buttonStyle }}><Sparkles size={13} aria-hidden="true" />{currentUrl ? 'Replace with AI' : 'Add image with AI'}</button>
    {/* The dialog owns all its state, so closing it throws away any picture that was not accepted. */}
    {open && <ReplaceDialog {...rest} currentUrl={currentUrl} onClose={() => setOpen(false)} />}
  </>;
}

function ReplaceDialog({ userId, title, description, kind, currentUrl, onAccepted, onOpenContentBuilder, onClose }: Omit<AiImageReplaceProps, 'disabled' | 'buttonStyle'> & { onClose: () => void }) {
  const styleId = useId();
  const [status, setStatus] = useState<ImageStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [brandVisual, setBrandVisual] = useState('');
  const [style, setStyle] = useState(HOUSE_IMAGE_STYLE);
  const touched = useRef(false); // the person has edited the style: a brand kit that arrives later must not overwrite it
  const [phase, setPhase] = useState<'idle' | 'generating' | 'saving'>('idle');
  const [result, setResult] = useState<GeneratedImage | null>(null);
  const [error, setError] = useState('');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    imageStatus().then((s) => { if (alive.current) setStatus(s); }).catch((e) => { if (alive.current) setStatusError(errorText(e)); });
    listGuideBrands(userId).then(visualLanguageOf).catch(() => '').then((visual) => {
      if (!alive.current) return;
      setBrandVisual(visual);
      if (!touched.current) setStyle(resolveImageStyle(visual).text);
    });
    return () => { alive.current = false; };
  }, [userId]);

  const choice = status ? chooseImageProvider(status) : null;
  const prompt = buildImagePrompt({ title, description, kind, style });
  const brand = brandVisual.trim();
  const styleNote = style === HOUSE_IMAGE_STYLE ? 'House pencil sketch style, the default: a graphite pencil drawing on white, like our portrait drawings. Edit it to change the look of this image.'
    : brand && style === brand ? 'From your brand’s Visual language (Site builder → Brand). Edit it to change the look of this image only.'
    : 'Edited for this image. Your brand kit is not changed.';
  const busy = phase !== 'idle';

  async function make() {
    if (!choice?.ok) return;
    setPhase('generating'); setError('');
    try {
      const made = await generateImage(prompt, ASPECT, QUALITY, choice.source);
      if (!alive.current) return;
      setResult(made);
      if (choice.source === 'house' && !made.mock) setStatus((s) => s && { ...s, house_left: Math.max(0, s.house_left - 1) });
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally { if (alive.current) setPhase('idle'); }
  }

  async function accept() {
    if (!result || result.mock) return;
    setPhase('saving'); setError('');
    try {
      const url = await uploadGuideImage(userId, dataUrlToFile(result.image, 'ai-image'), 'ai-image');
      await onAccepted(url);
      if (alive.current) onClose();
    } catch (e) {
      if (alive.current) { setError(errorText(e)); setPhase('idle'); }
    }
  }

  const price = status ? priceLabel(status.prices, ASPECT, QUALITY) : '';
  const generateLabel = !choice?.ok ? 'Generate' : choice.test ? 'Generate test image · free' : `Generate · ${price}${choice.source === 'own' ? ' on your OpenAI account' : ''}`;

  const footer = choice?.ok
    ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {result
        ? <>
          <button type="button" onClick={onClose} disabled={phase === 'saving'} style={btn}><X size={13} aria-hidden="true" />Cancel</button>
          <button type="button" onClick={() => void make()} disabled={busy} style={btn}>{phase === 'generating' ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={13} aria-hidden="true" />}Try again</button>
          <button type="button" onClick={() => void accept()} disabled={busy || result.mock} style={{ ...primary, opacity: busy || result.mock ? 0.5 : 1 }}>{phase === 'saving' ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}Accept</button>
        </>
        : <>
          <button type="button" onClick={onClose} style={btn}>Cancel</button>
          <button type="button" onClick={() => void make()} disabled={busy} style={primary}>{phase === 'generating' ? <><Loader2 size={13} className="animate-spin" aria-hidden="true" />Drawing…</> : generateLabel}</button>
        </>}
    </div>
    : <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" onClick={onClose} style={btn}>Close</button></div>;

  // The dialog sits inside the caller's drop target in the React tree, so a file dropped on it must not reach that target and become an upload.
  const keepDropsHere = { onDragEnter: (e: React.DragEvent) => e.stopPropagation(), onDragOver: (e: React.DragEvent) => e.stopPropagation(), onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); } };

  return <div style={{ display: 'contents' }} {...keepDropsHere}><GuardianModal
    label="Replace image with AI"
    onClose={onClose}
    closeLabel="Close"
    panelStyle={{ background: '#11120F', color: ink, border: `1px solid ${line}`, borderRadius: 6 }}
    headerStyle={{ padding: '22px 24px 8px' }}
    bodyStyle={{ padding: '8px 24px 20px' }}
    footerStyle={{ borderTop: `1px solid ${line}`, padding: '16px 24px' }}
    footer={footer}
    header={<div><div style={{ ...label, color: acid, margin: 0 }}>AI image</div><h2 style={{ fontFamily: serif, fontSize: 28, fontWeight: 300, lineHeight: 1.1, margin: '6px 0 0' }}>{currentUrl ? 'Replace the image' : 'Add an image'}</h2><p style={{ color: muted, fontFamily: sans, fontSize: 12, margin: '6px 0 0' }}>for “{title.trim() || 'this offer'}”. Nothing changes until you accept the new picture.</p></div>}
  >
    <div style={{ fontFamily: sans, display: 'grid', gap: 16 }}>
      {statusError && <p role="alert" style={{ color: '#E8A39B', fontSize: 12, margin: 0 }}>{statusError}</p>}
      {!status && !statusError && <p role="status" style={{ color: muted, fontSize: 12, margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={13} className="animate-spin" aria-hidden="true" />Checking your image settings…</p>}

      {choice && !choice.ok && <div style={{ border: `1px solid ${line}`, padding: 14, display: 'grid', gap: 10 }}>
        <p role="alert" style={{ color: ink, fontSize: 13, lineHeight: 1.55, margin: 0 }}>{choice.message}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {onOpenContentBuilder && <button type="button" onClick={() => { onClose(); onOpenContentBuilder(); }} style={primary}>Open the Content builder</button>}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: acid, fontSize: 12 }}>platform.openai.com → API keys</a>
        </div>
        <p style={{ color: muted, fontSize: 11, margin: 0 }}>Your current image stays as it is. You can still upload one yourself.</p>
      </div>}

      {choice?.ok && <>
        <div>
          <label htmlFor={styleId} style={label}>Image style</label>
          <textarea id={styleId} value={style} maxLength={1200} rows={5} onChange={(event) => { touched.current = true; setStyle(event.target.value); }} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${line}`, background: '#0D0E0C', color: ink, borderRadius: 2, padding: 10, fontFamily: sans, fontSize: 12, lineHeight: 1.5, resize: 'vertical', outline: 'none' }} />
          <p style={{ color: muted, fontSize: 11, lineHeight: 1.5, margin: '6px 0 0' }}>{styleNote}</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
            {style !== HOUSE_IMAGE_STYLE && <button type="button" onClick={() => { touched.current = true; setStyle(HOUSE_IMAGE_STYLE); }} style={linkBtn}>Use the house pencil style</button>}
            {brand && style !== brand && <button type="button" onClick={() => { touched.current = true; setStyle(brand); }} style={linkBtn}>Use my brand’s visual language</button>}
          </div>
          <details style={{ marginTop: 8 }}>
            <summary style={{ color: muted, fontSize: 11, cursor: 'pointer' }}>See the full prompt</summary>
            <pre style={{ whiteSpace: 'pre-wrap', color: muted, fontFamily: sans, fontSize: 11, lineHeight: 1.5, margin: '6px 0 0' }}>{prompt}</pre>
          </details>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          <figure style={{ margin: 0 }}>
            <figcaption style={label}>Current</figcaption>
            {currentUrl ? <img src={currentUrl} alt="Current image" style={frame} /> : <div style={emptyFrame}>No image yet</div>}
          </figure>
          <figure style={{ margin: 0 }}>
            <figcaption style={{ ...label, color: result ? acid : muted }}>New</figcaption>
            {result ? <img src={result.image} alt="New image" style={frame} />
              : <div style={emptyFrame}>{phase === 'generating' ? <span style={{ display: 'grid', gap: 8, justifyItems: 'center' }}><Loader2 size={20} className="animate-spin" aria-hidden="true" />Drawing it. This can take up to a minute.</span> : 'Your new image appears here.'}</div>}
          </figure>
        </div>
        {result?.mock && <p style={{ color: '#E8B86A', fontSize: 12, lineHeight: 1.5, margin: 0 }}>This is the free test image: it shows the flow works, but nothing real was drawn, so it cannot be kept as a cover.</p>}

        <p style={{ color: muted, fontSize: 11, lineHeight: 1.5, margin: 0 }}>{choice.note} {!choice.test && (result ? 'Try again draws another picture and is charged again.' : 'Nothing is spent until you press the button that shows the price.')}</p>
      </>}
      {error && <p role="alert" style={{ color: '#E8A39B', fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  </GuardianModal></div>;
}
