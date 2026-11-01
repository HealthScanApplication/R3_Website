/*
 * A short YouTube clip (or two, one after the other) as a muted, looping hero background. It uses YouTube's own embedded
 * player, so nothing is downloaded or re-hosted, and it fills its parent like a CSS "cover" image. Place it inside a
 * `position: relative` box; it is decorative (aria-hidden, no pointer events) and sits under the hero's own overlay.
 *
 * People who ask for reduced motion get the video's poster picture instead of moving video, and if YouTube's API cannot
 * load the clip falls back to a plain embed of the first clip.
 */
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_ZOOM, clipEmbedUrl, clipPoster, nextClipIndex, type YtClip } from '../../utils/youtubeClip';

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }

let apiLoad: Promise<any> | null = null;
/** Loads YouTube's iframe API once and resolves with `window.YT`. */
function loadYouTubeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiLoad) return apiLoad;
  apiLoad = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => { apiLoad = null; reject(new Error('YouTube could not be loaded')); };
    document.head.appendChild(script);
  });
  return apiLoad;
}

const prefersReducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function YouTubeClipBackground({ clips, greyscale = false }: { clips: YtClip[]; greyscale?: boolean }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [reduced] = useState(prefersReducedMotion);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0); // the clip that is playing, so each can have its own zoom
  const key = clips.map((clip) => `${clip.id}:${clip.start}-${clip.end}`).join('|');

  useEffect(() => {
    setFailed(false);
    setActive(0);
    if (!clips.length || reduced) return;
    let player: any = null;
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !holder.current) return;
      let index = 0;
      const target = document.createElement('div');
      holder.current.appendChild(target);
      const first = clips[0];
      player = new YT.Player(target, {
        videoId: first.id,
        playerVars: { autoplay: 1, mute: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, cc_load_policy: 0, playsinline: 1, start: first.start, end: first.end, origin: window.location.origin },
        events: {
          onReady: (event: any) => { event.target.mute(); event.target.playVideo(); },
          // A clip ends at its end time: play the next one (the same one again when there is only one).
          onStateChange: (event: any) => {
            if (event.data !== YT.PlayerState.ENDED) return;
            index = nextClipIndex(index, clips.length);
            setActive(index);
            const next = clips[index];
            event.target.loadVideoById({ videoId: next.id, startSeconds: next.start, endSeconds: next.end });
          },
          onError: () => setFailed(true),
        },
      });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; try { player?.destroy?.(); } catch { /* already gone */ } };
  }, [key, reduced]);

  if (!clips.length) return null;
  // The player is drawn larger than its box (the box clips it): this crops off its title bar, burned-in captions and the black bars of a 4:3 video.
  const zoom = clips[Math.min(active, clips.length - 1)]?.zoom ?? DEFAULT_ZOOM;
  const filter = greyscale ? 'grayscale(1)' : 'saturate(.9) contrast(1.05)';
  return (
    <div aria-hidden="true" data-youtube-clip style={{ position: 'absolute', inset: 0, overflow: 'hidden', containerType: 'size', pointerEvents: 'none', background: '#0D0E0B' }}>
      <style>{'.g-yt-cover iframe{position:absolute;inset:0;width:100%;height:100%;border:0}'}</style>
      {/* The poster sits underneath: it is what shows while the video loads, for reduced motion, and if it cannot play. */}
      <img src={clipPoster(clips[0])} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter }} />
      {!reduced && !failed && <div ref={holder} className="g-yt-cover" style={{ position: 'absolute', top: '50%', left: '50%', width: 'max(100%, 177.78cqh)', height: 'max(100%, 56.25cqw)', transform: `translate(-50%, -50%) scale(${zoom})`, filter }} />}
      {!reduced && failed && <iframe src={clipEmbedUrl(clips[0])} title="Background video" tabIndex={-1} allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" style={{ position: 'absolute', top: '50%', left: '50%', width: 'max(100%, 177.78cqh)', height: 'max(100%, 56.25cqw)', transform: `translate(-50%, -50%) scale(${clips[0].zoom ?? DEFAULT_ZOOM})`, border: 0, filter }} />}
    </div>
  );
}
