/*
 * YouTube clips for a Guardian's hero background: a link, a start and an end, played muted on a loop by YouTube's own
 * embedded player. Nothing is downloaded or re-hosted. A clip is kept short (2 to 30 seconds) so it reads as a
 * background, not a film, and a Guardian can set two ("Video 1" and "Video 2") that play one after the other.
 *
 * Pure functions only, so the link, time and clamping rules are tested without a browser or the YouTube API.
 */

export interface YtClip { id: string; start: number; end: number }

export const MAX_CLIPS = 2;
export const MIN_CLIP_SECONDS = 2;
export const MAX_CLIP_SECONDS = 30;

const ID = /^[A-Za-z0-9_-]{11}$/;

/** The 11-character video id from any usual YouTube link (watch, youtu.be, shorts, embed, live), or from a bare id. */
export function parseYouTubeId(input: string): string | null {
  const text = String(input || '').trim();
  if (!text) return null;
  if (ID.test(text)) return text;
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let candidate: string | null = null;
  if (host === 'youtu.be') candidate = url.pathname.split('/')[1] || null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') candidate = url.searchParams.get('v');
    else { const [, kind, id] = url.pathname.split('/'); if (['shorts', 'embed', 'live', 'v'].includes(kind)) candidate = id || null; }
  }
  return candidate && ID.test(candidate) ? candidate : null;
}

/** "45", "1:05", "1:02:03", "1m5s" or "90s" as seconds; null when it is not a time. */
export function parseTime(input: string | number | null | undefined): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? Math.floor(input) : null;
  const text = String(input ?? '').trim().toLowerCase();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.floor(Number(text));
  if (/^\d+(:\d{1,2}){1,2}$/.test(text)) return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  const match = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (match && (match[1] || match[2] || match[3])) return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  return null;
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * A usable clip from what a Guardian typed, or null (and a reason) when it cannot be one. An end that is missing or too
 * far from the start is pulled in to the longest allowed clip, a start with no end becomes a default-length clip, and
 * an end before the start is refused.
 */
export function buildClip(link: string, startInput: string | number, endInput: string | number): { clip: YtClip | null; problem: string | null } {
  const id = parseYouTubeId(link);
  if (!id) return { clip: null, problem: link.trim() ? 'That is not a YouTube link.' : null };
  const start = parseTime(startInput);
  if (start === null) return { clip: null, problem: 'Add a start time, like 0:45.' };
  const rawEnd = parseTime(endInput);
  if (rawEnd !== null && rawEnd <= start) return { clip: null, problem: 'The end must come after the start.' };
  let end = rawEnd === null ? start + 8 : rawEnd;
  end = Math.min(end, start + MAX_CLIP_SECONDS);
  if (end - start < MIN_CLIP_SECONDS) return { clip: null, problem: `A clip needs at least ${MIN_CLIP_SECONDS} seconds.` };
  return { clip: { id, start, end }, problem: null };
}

/** The clips saved on a profile (theme_background_clips is a JSON array), keeping only valid ones, at most two. */
export function clipsFromLinks(value: unknown): YtClip[] {
  let list: unknown;
  try { list = typeof value === 'string' ? JSON.parse(value || '[]') : value; } catch { return []; }
  if (!Array.isArray(list)) return [];
  const out: YtClip[] = [];
  for (const item of list) {
    const { id, start, end } = (item || {}) as Partial<YtClip>;
    if (typeof id !== 'string' || !ID.test(id) || typeof start !== 'number' || typeof end !== 'number') continue;
    if (!(start >= 0) || !(end > start) || end - start > MAX_CLIP_SECONDS || end - start < MIN_CLIP_SECONDS) continue;
    out.push({ id, start: Math.floor(start), end: Math.floor(end) });
    if (out.length === MAX_CLIPS) break;
  }
  return out;
}

export const clipsToLinks = (clips: YtClip[]): string => JSON.stringify(clips.slice(0, MAX_CLIPS).map(({ id, start, end }) => ({ id, start, end })));

/** The index of the clip to play after `current`; with one clip it repeats, with two they alternate. */
export const nextClipIndex = (current: number, count: number): number => (count <= 1 ? 0 : (current + 1) % count);

/** YouTube's own thumbnail, used instead of moving video for people who ask for reduced motion. */
export const clipPoster = (clip: YtClip): string => `https://i.ytimg.com/vi/${clip.id}/hqdefault.jpg`;

/** The embed address for a clip: muted, no controls, no related videos, looping the clip. Used as the no-API fallback. */
export function clipEmbedUrl(clip: YtClip): string {
  const params = new URLSearchParams({ autoplay: '1', mute: '1', controls: '0', loop: '1', playlist: clip.id, start: String(clip.start), end: String(clip.end), playsinline: '1', modestbranding: '1', rel: '0', iv_load_policy: '3', disablekb: '1', fs: '0' });
  return `https://www.youtube-nocookie.com/embed/${clip.id}?${params.toString()}`;
}
