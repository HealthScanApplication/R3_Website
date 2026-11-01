import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { convertGuardianAvatar, generatedImageFile } from '../../utils/guardianImages';
import { uploadGuideImage } from '../../utils/guidePortal';

// Same tokens as GuidePortal.
const ink = '#F5F2EA', black = '#090A08', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', panel = '#11120F';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const caption: React.CSSProperties = { display: 'block', marginTop: 7, color: muted, fontFamily: sans, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' };
const button = (primary: boolean, busy: boolean): React.CSSProperties => ({ minHeight: 36, padding: '0 14px', border: `1px solid ${primary ? ink : line}`, background: primary ? ink : 'transparent', color: primary ? black : ink, fontFamily: sans, fontSize: 9, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer' });

/**
 * Converts a Guardian's photo to the R³ house style as soon as it opens, shows the original beside the result,
 * and uploads the result when the Guardian accepts it. `onApplied` gets the uploaded image's URL.
 */
export function HouseAvatarReview({ userId, name, source, onApplied, onCancel }: { userId: string; name: string; source: string; onApplied: (url: string) => void; onCancel: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  async function convert() {
    setConverting(true); setMessage(''); setPreview(null);
    try {
      const result = await convertGuardianAvatar(source, name || 'Guardian');
      if (!live.current) return;
      setPreview(result.image);
      if (result.mock) setMessage('Live image generation is in test mode, so this is a placeholder.');
    } catch (error) {
      if (live.current) setMessage(error instanceof Error ? error.message : 'Could not convert that portrait.');
    } finally { if (live.current) setConverting(false); }
  }
  useEffect(() => { void convert(); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  async function apply() {
    if (!preview) return;
    setApplying(true); setMessage('');
    try {
      onApplied(await uploadGuideImage(userId, generatedImageFile(preview)));
    } catch (error) {
      if (live.current) setMessage(error instanceof Error ? error.message : 'Could not save the converted avatar.');
    } finally { if (live.current) setApplying(false); }
  }

  return <div aria-live="polite" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, maxWidth: 430, marginTop: 14, padding: 12, border: `1px solid ${line}`, background: 'rgba(245,242,234,.025)' }}>
    <figure style={{ margin: 0 }}><div style={{ aspectRatio: '1', overflow: 'hidden', background: panel }}><img src={source} alt="Original portrait" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div><figcaption style={caption}>Original</figcaption></figure>
    <figure style={{ margin: 0 }}><div style={{ aspectRatio: '1', overflow: 'hidden', background: panel, display: 'grid', placeItems: 'center' }}>{preview ? <img src={preview} alt="R3 house-style avatar preview" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1)' }} /> : converting ? <Loader2 size={18} className="animate-spin" color={muted} /> : null}</div><figcaption style={caption}>R³ house style</figcaption></figure>
    {message && <p style={{ gridColumn: '1 / -1', margin: 0, color: muted, fontFamily: sans, fontSize: 11, lineHeight: 1.5 }}>{message}</p>}
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <button type="button" onClick={apply} disabled={!preview || applying || converting} style={button(true, applying)}>{applying ? 'Applying…' : 'Use this avatar'}</button>
      <button type="button" onClick={() => void convert()} disabled={converting || applying} style={button(false, converting)}>{converting ? 'Converting…' : 'Try again'}</button>
      <button type="button" onClick={onCancel} disabled={applying} style={{ ...button(false, false), border: 0, padding: '0 6px', color: muted }}>Cancel</button>
    </div>
  </div>;
}
