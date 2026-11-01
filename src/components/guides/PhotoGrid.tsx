/*
 * The Guardian's photo grid: four cells laid out in a row (two by two on a phone). The first cell is their account photo,
 * the one that comes with their email, so the grid is never empty to begin with; the rest are empty slots to fill. They are
 * asked for at least two and up to four, because a page with a face and one or two real photos reads as a person.
 *
 * Presentational: GuidePortal owns the photos, the uploads and the save.
 */
import { Loader2, Plus, Save, X } from 'lucide-react';
import { SaveStatus, type SaveState } from './SaveButton';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', black = '#090A08', panel = '#11120F', acid = '#C7D8A3';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const label: React.CSSProperties = { display: 'block', color: muted, fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.35 };

export const PHOTO_SLOTS = 4;
export const PHOTO_MIN = 2;

export interface PhotoGridProps {
  photos: string[];
  /** The photo that comes with their account email, shown in the first cell when there is one. */
  accountAvatarUrl: string | null;
  uploading: boolean;
  onAdd: (files: FileList | null) => void;
  onRemove: (index: number) => void;
  save: SaveState;
  onSave: () => void;
  /** Sits inside another card (the profile image card): no box of its own, just a divider above. */
  embedded?: boolean;
  /** The brand these photos belong to; shown when the Guardian has more than one brand. */
  forBrand?: string;
  /** 'quad' is a square two-by-two block that sits beside the house-style result; 'row' is the full-width row of four. */
  layout?: 'row' | 'quad';
}

export function PhotoGrid({ photos, accountAvatarUrl, uploading, onAdd, onRemove, save, onSave, embedded = false, forBrand, layout = 'row' }: PhotoGridProps) {
  const filled = photos.slice(0, PHOTO_SLOTS);
  const cells = Array.from({ length: PHOTO_SLOTS }, (_, index) => filled[index] || null);
  const enough = filled.length >= PHOTO_MIN;
  if (layout === 'quad') {
    return (
      <figure data-photo-quad aria-label="Your photos" style={{ margin: 0, minWidth: 0 }}>
        <div style={{ aspectRatio: '1', display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 6 }}>
          {cells.map((url, index) => url ? (
            <div key={`${url}-${index}`} style={{ position: 'relative', overflow: 'hidden', border: `1px solid ${line}`, background: panel, minWidth: 0, minHeight: 0 }}>
              <img src={url} alt={url === accountAvatarUrl ? 'Your account photo' : `Photo ${index + 1}`} referrerPolicy="no-referrer" decoding="async" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
              <button type="button" onClick={() => onRemove(index)} aria-label={`Remove photo ${index + 1}`} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, display: 'grid', placeItems: 'center', border: `1px solid ${line}`, background: black, color: ink, cursor: 'pointer', padding: 0 }}><X size={12} /></button>
            </div>
          ) : (
            <label key={`empty-${index}`} style={{ position: 'relative', display: 'grid', placeItems: 'center', border: `1px dashed ${line}`, background: panel, color: muted, cursor: uploading ? 'wait' : 'pointer', fontFamily: sans, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', minWidth: 0, minHeight: 0 }}>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={uploading} aria-label={`Add photo ${index + 1}`} onChange={(event) => { onAdd(event.target.files); event.target.value = ''; }} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
              <span style={{ display: 'grid', placeItems: 'center', gap: 4 }}>{uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}<span>{index < PHOTO_MIN ? 'Add photo' : 'Optional'}</span></span>
            </label>
          ))}
        </div>
        <figcaption style={{ ...label, marginTop: 8, textAlign: 'center' }}>Your photos · {filled.length} of {PHOTO_SLOTS}</figcaption>
        {forBrand && <p style={{ ...label, color: acid, margin: '4px 0 0', textAlign: 'center' }}>For {forBrand}</p>}
        <p style={{ color: enough ? acid : muted, fontFamily: sans, fontSize: 11, lineHeight: 1.5, margin: '4px 0 0', textAlign: 'center' }}>{enough ? 'Add up to 4. The first is used for your house style.' : `Add at least ${PHOTO_MIN} real photos of you.`}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
          <button type="button" onClick={onSave} disabled={save.status === 'saving'} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 36, padding: '0 14px', border: `1px solid ${ink}`, background: 'transparent', color: ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', cursor: save.status === 'saving' ? 'wait' : 'pointer' }}>
            {save.status === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Save photos
          </button>
          <SaveStatus state={save} />
        </div>
      </figure>
    );
  }
  return (
    <section aria-label="Your photos" style={embedded ? { width: '100%', boxSizing: 'border-box', marginTop: 20, paddingTop: 18, borderTop: `1px solid ${line}`, textAlign: 'center' } : { width: '100%', boxSizing: 'border-box', marginTop: 18, padding: 20, border: `1px solid ${line}`, background: 'rgba(245,242,234,.025)', textAlign: 'center' }}>
      <h3 style={{ ...label, margin: '0 0 6px', textAlign: 'center' }}>Your photos · add 2 to 4</h3>
      {forBrand && <p style={{ ...label, color: acid, margin: '0 0 6px', textAlign: 'center' }}>For {forBrand}</p>}
      <p style={{ color: enough ? acid : muted, fontSize: 12, lineHeight: 1.6, margin: '0 auto 14px', maxWidth: 520 }}>
        {enough ? `${filled.length} of ${PHOTO_SLOTS} added. Add up to ${PHOTO_SLOTS - filled.length} more if you like.` : `Add at least ${PHOTO_MIN} real photos of you, your work or your space. Pages with real photos feel like a person, not a template.`}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,120px),1fr))', gap: 12, maxWidth: 640, margin: '0 auto' }}>
        {cells.map((url, index) => url ? (
          <figure key={`${url}-${index}`} style={{ margin: 0, position: 'relative' }}>
            <div style={{ aspectRatio: '1', overflow: 'hidden', border: `1px solid ${line}`, background: panel }}>
              <img src={url} alt={url === accountAvatarUrl ? 'Your account photo' : `Photo ${index + 1}`} referrerPolicy="no-referrer" decoding="async" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <button type="button" onClick={() => onRemove(index)} aria-label={`Remove photo ${index + 1}`} style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, display: 'grid', placeItems: 'center', border: `1px solid ${line}`, background: black, color: ink, cursor: 'pointer', padding: 0 }}><X size={12} /></button>
            <figcaption style={{ ...label, marginTop: 6, textAlign: 'center', fontSize: 9 }}>{url === accountAvatarUrl ? 'From your account' : `Photo ${index + 1}`}</figcaption>
          </figure>
        ) : (
          <label key={`empty-${index}`} style={{ display: 'grid', placeItems: 'center', gap: 6, aspectRatio: '1', border: `1px dashed ${line}`, background: panel, color: muted, cursor: uploading ? 'wait' : 'pointer', fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', textAlign: 'center' }}>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={uploading} aria-label={`Add photo ${index + 1}`} onChange={(event) => { onAdd(event.target.files); event.target.value = ''; }} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
            <span style={{ display: 'grid', placeItems: 'center', gap: 6 }}>{uploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}<span>{index < PHOTO_MIN ? 'Add photo' : 'Optional'}</span></span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
        <button type="button" onClick={onSave} disabled={save.status === 'saving'} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40, padding: '0 16px', border: `1px solid ${ink}`, background: 'transparent', color: ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', cursor: save.status === 'saving' ? 'wait' : 'pointer' }}>
          {save.status === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Save photos
        </button>
        <SaveStatus state={save} />
      </div>
    </section>
  );
}
