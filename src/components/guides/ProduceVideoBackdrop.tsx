/**
 * The default hero background of a Guardian site: the same fresh fruit and vegetable footage as the ROUTINE³ home page,
 * several clips one after the other, muted. It is only used when the Guardian has chosen no picture, video or clip of their own.
 *
 * It fills its parent like a CSS "cover" image (place it in a `position: relative` box), is decorative (aria-hidden, no
 * pointer events), and for people who ask for reduced motion shows one still frame instead of moving footage.
 */
import { useEffect, useRef, useState } from 'react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

export const PRODUCE_CLIP_COUNT = 6;

let produceClips: Promise<string[]> | null = null;

/** Fruit and vegetable clip URLs from the catalog, shuffled; fetched once and shared by every backdrop on the page. */
export function loadProduceClips(): Promise<string[]> {
  if (!produceClips) {
    produceClips = (async () => {
      try {
        const base = `https://${projectId}.supabase.co/rest/v1`;
        const headers = { apikey: publicAnonKey, Authorization: `Bearer ${publicAnonKey}` };
        const response = await fetch(`${base}/catalog_ingredients?select=video_url&video_url=not.is.null&video_url=neq.&or=(category.ilike.*fruit*,category.ilike.*veget*)&limit=80`, { headers });
        const rows: { video_url?: string }[] = response.ok ? await response.json() : [];
        return shuffle(rows.map((row) => row.video_url || '').filter(Boolean)).slice(0, PRODUCE_CLIP_COUNT);
      } catch {
        return [];
      }
    })();
    produceClips.then((clips) => { if (!clips.length) produceClips = null; });
  }
  return produceClips;
}

export function shuffle<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function ProduceVideoBackdrop({ greyscale = false }: { greyscale?: boolean }) {
  const [clips, setClips] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    let live = true;
    loadProduceClips().then((urls) => { if (live) setClips(urls); });
    return () => { live = false; };
  }, []);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const filter = greyscale ? 'grayscale(1)' : 'saturate(.9) contrast(1.05)';
  return <div data-produce-backdrop aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#151A12', pointerEvents: 'none' }}>
    {clips.map((url, position) => position === index || position === (index + 1) % clips.length
      ? <ProduceClip key={url} url={url} active={position === index} still={reduced} single={clips.length === 1} filter={filter} onEnded={() => setIndex((current) => (current + 1) % clips.length)} />
      : null)}
  </div>;
}

function ProduceClip({ url, active, still, single, filter, onEnded }: { url: string; active: boolean; still: boolean; single: boolean; filter: string; onEnded: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (active && !still) { element.currentTime = 0; element.play().catch(() => {}); } else element.pause();
  }, [active, still]);
  return <video ref={video} src={url} muted playsInline preload="auto" loop={single} onEnded={onEnded}
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter, opacity: active ? 1 : 0, transition: 'opacity 700ms ease' }} />;
}
