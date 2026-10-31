/*
 * The "R3 house style" helper under the Guardian profile image row: a large Before / After example of the default
 * profile image, a plain description of the style, and the button that creates the Guardian's own. Once they have a
 * result, the same panel shows their own original and result with Use this avatar / Try again / Cancel.
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

export const HOUSE_STYLE_EXAMPLE = {
  before: '/images/guides/house-style/example-before.webp',
  after: '/images/guides/house-style/example-after.webp',
};

export interface HouseStyleAvatarPanelProps {
  /** The element id the toggle button points at with aria-controls. */
  id: string;
  open: boolean;
  /** The Guardian's current source portrait (shown as "Original" once there is a result). */
  sourceUrl: string | null;
  /** True while the source is still a stock avatar: converting it would be pointless, so the button asks for a photo. */
  needsUpload: boolean;
  converting: boolean;
  applying: boolean;
  uploading: boolean;
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
        <img src={src} alt={alt} width={size} height={size} decoding="async" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', filter: grey ? 'grayscale(1)' : undefined }} />
        {tag && <span style={badge}>{tag}</span>}
      </div>
      <figcaption style={{ ...label, marginTop: 8 }}>{caption}</figcaption>
    </figure>
  );
}

export function HouseStyleAvatarPanel({ id, open, sourceUrl, needsUpload, converting, applying, uploading, resultUrl, resultMock, error, onCreate, onUpload, onApply, onCancel }: HouseStyleAvatarPanelProps) {
  const busy = converting || applying;
  const noteId = `${id}-note`;
  return (
    <div id={id}>
      {open && (
        <section aria-label="R3 house style profile image" style={{ maxWidth: 640, marginTop: 14, padding: 16, border: `1px solid ${line}`, background: 'rgba(245,242,234,.025)' }}>
          <h3 style={{ ...label, margin: '0 0 12px' }}>{resultUrl ? 'Your R3 house style' : 'Example of the R3 house style'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            {resultUrl ? (
              <>
                <Shot src={sourceUrl || ''} alt="Your original portrait" caption="Original" />
                <Shot src={resultUrl} alt={resultMock ? 'Placeholder test image standing in for your R3 house style portrait' : 'Your portrait in the R3 house style'} caption="R3 house style" tag={resultMock ? 'Test image' : undefined} grey />
              </>
            ) : (
              <>
                <Shot src={HOUSE_STYLE_EXAMPLE.before} alt="A stone bust of a young man on a plain white background, with an open book at its base." caption="Before" tag="Example" size={1000} />
                <Shot src={HOUSE_STYLE_EXAMPLE.after} alt="The same bust without the book, framed head and shoulders in black and white on a soft warm grey backdrop with gentle window light." caption="After" tag="Example" size={1000} />
              </>
            )}
          </div>
          {!resultUrl && (
            <p style={{ color: muted, fontSize: 12, lineHeight: 1.6, margin: '14px 0 0' }}>
              This is the default profile image before and after. R3 house style makes a calm editorial portrait: black and white, soft window light, a warm grey backdrop, framed head and shoulders. It keeps you looking like you, with no retouching, and removes the old background, text, logos and other people.
            </p>
          )}
          {resultUrl && resultMock && (
            <p id={noteId} style={{ color: muted, fontSize: 12, lineHeight: 1.6, margin: '14px 0 0' }}>
              Live image generation is currently in test mode. This is a placeholder, so it cannot be saved as your avatar yet.
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 14 }}>
            {resultUrl ? (
              <>
                <button type="button" onClick={onApply} disabled={applying || resultMock} aria-describedby={resultMock ? noteId : undefined} style={{ ...primary, opacity: resultMock ? 0.45 : 1, cursor: applying ? 'wait' : resultMock ? 'not-allowed' : 'pointer' }}>{applying ? 'Applying…' : 'Use this avatar'}</button>
                <button type="button" onClick={onCreate} disabled={busy} style={{ ...secondary, cursor: converting ? 'wait' : 'pointer' }}>{converting ? 'Creating…' : 'Try again'}</button>
                <button type="button" onClick={onCancel} disabled={applying} style={{ ...secondary, border: 0, color: muted, padding: '0 6px', cursor: 'pointer' }}>Cancel</button>
              </>
            ) : needsUpload ? (
              <button type="button" onClick={onUpload} disabled={uploading} style={{ ...primary, cursor: uploading ? 'wait' : 'pointer' }}>
                <Upload size={13} />Upload your photo to create yours
              </button>
            ) : (
              <button type="button" onClick={onCreate} disabled={busy} aria-busy={converting} style={{ ...primary, cursor: converting ? 'wait' : 'pointer' }}>
                {converting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{converting ? 'Creating your portrait…' : 'Create my R3 house style'}
              </button>
            )}
          </div>
          {!resultUrl && needsUpload && <p style={{ color: muted, fontSize: 11, lineHeight: 1.5, margin: '10px 0 0' }}>You are using a stock image, so there is nothing of yours to convert yet.</p>}
          {error && <p role="alert" style={{ color: ink, background: 'rgba(245,242,234,.06)', borderLeft: `2px solid ${acid}`, fontSize: 12, lineHeight: 1.5, margin: '12px 0 0', padding: '8px 10px' }}>{error}</p>}
        </section>
      )}
    </div>
  );
}
