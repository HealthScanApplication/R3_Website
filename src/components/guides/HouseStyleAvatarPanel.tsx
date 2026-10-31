/*
 * The Guardian's profile image, as one full-width, centred card: their current photo featured first, then a single
 * Replace and a single "Create my R3 house style" (each action appears once). Once they have a result the card shows
 * their original beside it with Use this avatar / Try again / Cancel. Before there is a result, an empty slot beside their
 * photo shows where it will appear. One reference image of the style stays below as the goal.
 *
 * Presentational: GuidePortal owns the state and the handlers (convert, apply, upload), this only lays them out.
 */
import { Loader2, Sparkles, Upload } from 'lucide-react';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', black = '#090A08', panel = '#11120F', acid = '#C7D8A3';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const label: React.CSSProperties = { display: 'block', color: muted, fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.35 };
const badge: React.CSSProperties = { position: 'absolute', top: 8, left: 8, padding: '3px 7px', background: black, color: ink, border: `1px solid ${line}`, fontFamily: sans, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' };
const primary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40, padding: '0 16px', border: `1px solid ${ink}`, background: ink, color: black, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase' };
const secondary: React.CSSProperties = { minHeight: 40, padding: '0 14px', border: `1px solid ${line}`, background: 'transparent', color: ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase' };

/** The one reference image of the style: a carved stone bust. Their own result is the "after", so there is no example pair. */
export const HOUSE_STYLE_EXAMPLE = {
  goal: '/images/guides/house-style/example-before.webp',
};

export interface HouseStyleAvatarPanelProps {
  id: string;
  /** The photo conversions start from; shown as "Original" beside a result. */
  sourceUrl: string | null;
  /** The profile image that is live now: featured on its own while there is no result. Falls back to the source. */
  currentUrl?: string | null;
  /** True while the photo is still a stock avatar: converting it would be pointless, so they are asked to replace it. */
  needsUpload: boolean;
  converting: boolean;
  applying: boolean;
  uploading: boolean;
  /** A file is being dragged over the card. */
  dragging?: boolean;
  resultUrl: string | null;
  /** The function is in test mode: the result is a placeholder SVG that cannot be saved as an avatar. */
  resultMock: boolean;
  error: string;
  onCreate: () => void;
  onUpload: () => void;
  onApply: () => void;
  onCancel: () => void;
}

/** One square picture with a caption; `tag` is the small badge laid over the corner (Example, Test image). */
function Shot({ src, alt, caption, tag, grey, size }: { src: string; alt: string; caption: string; tag?: string; grey?: boolean; size?: number }) {
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <div style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', background: panel, border: `1px solid ${line}` }}>
        <img src={src} alt={alt} width={size} height={size} decoding="async" referrerPolicy="no-referrer" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', filter: grey ? 'grayscale(1)' : undefined }} />
        {tag && <span style={badge}>{tag}</span>}
      </div>
      <figcaption style={{ ...label, marginTop: 8, textAlign: 'center' }}>{caption}</figcaption>
    </figure>
  );
}

export function HouseStyleAvatarPanel({ id, sourceUrl, currentUrl, needsUpload, converting, applying, uploading, dragging, resultUrl, resultMock, error, onCreate, onUpload, onApply, onCancel }: HouseStyleAvatarPanelProps) {
  const busy = converting || applying;
  const noteId = `${id}-note`;
  const featured = resultUrl ? sourceUrl : currentUrl || sourceUrl;
  const pairColumns = featured ? 'repeat(2,minmax(0,260px))' : 'minmax(0,280px)';
  return (
    <section id={id} aria-label="R3 house style profile image" style={{ width: '100%', boxSizing: 'border-box', marginTop: 18, padding: 20, border: `1px solid ${dragging ? ink : line}`, outline: dragging ? `2px dashed ${ink}` : 'none', background: 'rgba(245,242,234,.025)', textAlign: 'center' }}>
      <h3 style={{ ...label, margin: '0 0 14px', textAlign: 'center' }}>Profile image · optional</h3>
      <div style={{ display: 'grid', gridTemplateColumns: pairColumns, gap: 16, justifyContent: 'center' }}>
        {featured && <Shot src={featured} alt={resultUrl ? 'Your original portrait' : 'Your current profile image'} caption={resultUrl ? 'Original' : 'Your photo'} />}
        {!resultUrl && featured && (
          <figure style={{ margin: 0, minWidth: 0 }}>
            <div aria-label="Your R3 house style will appear here" style={{ aspectRatio: '1', display: 'grid', placeItems: 'center', padding: 16, boxSizing: 'border-box', border: `1px dashed ${line}`, background: panel, color: muted, fontSize: 12, lineHeight: 1.5 }}>
              {converting ? 'Carving your bust…' : 'Your R3 house style appears here'}
            </div>
            <figcaption style={{ ...label, marginTop: 8, textAlign: 'center' }}>R3 house style</figcaption>
          </figure>
        )}
        {resultUrl && <Shot src={resultUrl} alt={resultMock ? 'Placeholder test image standing in for your R3 house style portrait' : 'Your portrait in the R3 house style'} caption="R3 house style" tag={resultMock ? 'Test image' : undefined} grey />}
      </div>
      {resultUrl && resultMock && (
        <p id={noteId} style={{ color: muted, fontSize: 12, lineHeight: 1.6, margin: '14px auto 0', maxWidth: 480 }}>
          Live image generation is currently in test mode. This is a placeholder, so it cannot be saved as your avatar yet.
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
        {resultUrl ? (
          <>
            <button type="button" onClick={onApply} disabled={applying || resultMock} aria-describedby={resultMock ? noteId : undefined} style={{ ...primary, opacity: resultMock ? 0.45 : 1, cursor: applying ? 'wait' : resultMock ? 'not-allowed' : 'pointer' }}>{applying ? 'Saving…' : 'Use this avatar'}</button>
            <button type="button" onClick={onCreate} disabled={busy} style={{ ...secondary, cursor: converting ? 'wait' : 'pointer' }}>{converting ? 'Creating…' : 'Try again'}</button>
            <button type="button" onClick={onCancel} disabled={applying} style={{ ...secondary, border: 0, color: muted, padding: '0 6px', cursor: 'pointer' }}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" onClick={onCreate} disabled={busy || needsUpload} aria-busy={converting} style={{ ...primary, opacity: needsUpload ? 0.45 : 1, cursor: converting ? 'wait' : needsUpload ? 'not-allowed' : 'pointer' }}>
              {converting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{converting ? 'Creating your portrait…' : 'Create my R3 house style'}
            </button>
            <button type="button" onClick={onUpload} disabled={uploading} aria-label={featured ? 'Replace profile image' : 'Upload profile image'} style={{ ...secondary, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: uploading ? 'wait' : 'pointer' }}>
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}{uploading ? 'Uploading' : featured ? 'Replace photo' : 'Upload photo'}
            </button>
          </>
        )}
      </div>
      <p style={{ color: muted, fontSize: 11, lineHeight: 1.5, margin: '10px 0 0' }}>
        {dragging ? 'Drop to upload' : needsUpload ? 'This is a stock image. Replace it with your own photo to create your house style, or drag one here.' : 'or drag a photo here'}
      </p>
      {error && <p role="alert" style={{ color: ink, background: 'rgba(245,242,234,.06)', borderLeft: `2px solid ${acid}`, fontSize: 12, lineHeight: 1.5, margin: '12px auto 0', padding: '8px 10px', maxWidth: 480, textAlign: 'left' }}>{error}</p>}
      <div aria-label="The R3 house style to aim for" style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${line}` }}>
        <span style={{ ...label, textAlign: 'center' }}>The R3 house style to aim for</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,200px)', justifyContent: 'center', marginTop: 12 }}>
          <Shot src={HOUSE_STYLE_EXAMPLE.goal} alt="A carved grey stone bust of a young man with an open book at its base, lit softly on a plain white background." caption="The goal" tag="Example" size={400} />
        </div>
        <p style={{ color: muted, fontSize: 12, lineHeight: 1.6, margin: '12px auto 0', maxWidth: 520 }}>
          R3 house style turns your photo into a carved stone bust, like the figures on As-Tro: grey stone with visible grain, one soft side light, a round stone base and a near-black backdrop. It keeps you looking like you.
        </p>
      </div>
    </section>
  );
}
