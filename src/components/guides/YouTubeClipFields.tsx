/*
 * "Video 1" and "Video 2" for the hero background: paste a YouTube link, say where the clip starts and ends, and a few
 * seconds of it play muted behind the headline. A slot only becomes a clip once the link and times are valid; the problem
 * is shown beside it until then. Up to two clips play one after the other.
 *
 * Controlled by GuidePortal through `clips` / `onChange`.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { DEFAULT_ZOOM, MAX_CLIPS, MAX_CLIP_SECONDS, MAX_ZOOM, buildClip, clipPoster, clipsToLinks, formatTime, type YtClip } from '../../utils/youtubeClip';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', panel = '#11120F', acid = '#C7D8A3', black = '#090A08';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const field: React.CSSProperties = { boxSizing: 'border-box', width: '100%', minHeight: 40, padding: '0 12px', border: `1px solid ${line}`, background: black, color: ink, fontFamily: sans, fontSize: 13 };
const label: React.CSSProperties = { display: 'block', color: muted, fontFamily: sans, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 5 };

interface Draft { link: string; start: string; end: string; zoom: string }
const EMPTY: Draft = { link: '', start: '', end: '', zoom: '' };
const toDraft = (clip?: YtClip): Draft => clip ? { link: `https://www.youtube.com/watch?v=${clip.id}`, start: formatTime(clip.start), end: formatTime(clip.end), zoom: clip.zoom ? String(clip.zoom) : '' } : EMPTY;
const validClips = (drafts: Draft[]): YtClip[] => drafts.flatMap((draft) => { const { clip } = buildClip(draft.link, draft.start, draft.end, draft.zoom); return clip ? [clip] : []; });

export function YouTubeClipFields({ clips, onChange }: { clips: YtClip[]; onChange: (clips: YtClip[]) => void }) {
  const [drafts, setDrafts] = useState<Draft[]>(() => Array.from({ length: MAX_CLIPS }, (_, index) => toDraft(clips[index])));
  // Clips restored from the saved profile arrive after the first render: show them, but never overwrite what is being typed.
  const saved = clipsToLinks(clips);
  useEffect(() => { if (saved !== clipsToLinks(validClips(drafts))) setDrafts(Array.from({ length: MAX_CLIPS }, (_, index) => toDraft(clips[index]))); }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (index: number, patch: Partial<Draft>) => {
    const next = drafts.map((draft, position) => position === index ? { ...draft, ...patch } : draft);
    setDrafts(next);
    onChange(validClips(next));
  };

  return (
    <section aria-label="Video clips for your background" style={{ marginBottom: 14, padding: 14, border: `1px solid ${line}`, background: panel }}>
      <span style={{ ...label, color: ink, marginBottom: 6 }}>Or use a few seconds of a YouTube video</span>
      <p style={{ color: muted, fontFamily: sans, fontSize: 11, lineHeight: 1.55, margin: '0 0 12px' }}>
        Paste a link and choose where the clip starts and ends (up to {MAX_CLIP_SECONDS} seconds). It plays muted and looping behind your headline instead of the background above. Add a second and they play one after the other. Black bars at the sides (an older 4:3 video)? Raise Zoom to about 1.35, up to {MAX_ZOOM}. Only use videos you made or have permission to use.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {drafts.map((draft, index) => {
          const n = index + 1;
          const { clip, problem } = buildClip(draft.link, draft.start, draft.end, draft.zoom);
          const touched = !!(draft.link.trim() || draft.start.trim() || draft.end.trim() || draft.zoom.trim());
          return (
            <fieldset key={n} style={{ margin: 0, padding: 12, border: `1px solid ${clip ? acid : line}`, minWidth: 0 }}>
              <legend style={{ ...label, padding: '0 6px', marginBottom: 0 }}>Video {n}</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 8 }}>
                <input style={field} value={draft.link} onChange={(event) => update(index, { link: event.target.value })} placeholder="Paste a YouTube link" aria-label={`Video ${n} YouTube link`} inputMode="url" autoComplete="off" spellCheck={false} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
                  <label><span style={label}>Start</span><input style={field} value={draft.start} onChange={(event) => update(index, { start: event.target.value })} placeholder="0:45" aria-label={`Video ${n} start`} inputMode="text" autoComplete="off" /></label>
                  <label><span style={label}>End</span><input style={field} value={draft.end} onChange={(event) => update(index, { end: event.target.value })} placeholder="0:53" aria-label={`Video ${n} end`} inputMode="text" autoComplete="off" /></label>
                  <label><span style={label}>Zoom</span><input style={field} value={draft.zoom} onChange={(event) => update(index, { zoom: event.target.value })} placeholder={String(DEFAULT_ZOOM)} aria-label={`Video ${n} zoom`} inputMode="decimal" autoComplete="off" /></label>
                </div>
              </div>
              {clip && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <img src={clipPoster(clip)} alt="" width={64} height={36} style={{ objectFit: 'cover', border: `1px solid ${line}` }} />
                  <span role="status" style={{ color: acid, fontFamily: sans, fontSize: 11 }}>Plays {formatTime(clip.start)} to {formatTime(clip.end)} ({clip.end - clip.start} seconds)</span>
                </div>
              )}
              {touched && problem && <p role="alert" style={{ color: '#F0A7A7', fontFamily: sans, fontSize: 11, margin: '8px 0 0' }}>{problem}</p>}
              {touched && (
                <button type="button" onClick={() => update(index, EMPTY)} aria-label={`Clear video ${n}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10, minHeight: 30, padding: '0 10px', border: `1px solid ${line}`, background: 'transparent', color: muted, fontFamily: sans, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}><X size={11} />Clear</button>
              )}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}
