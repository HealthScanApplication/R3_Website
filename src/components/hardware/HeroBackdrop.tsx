import React, { useEffect, useRef, useState } from 'react';
import { ed } from '../../config/editorialTheme';
import { useHeroBackground } from '../../hooks/useHeroBackground';
import { FlutedGlassBackground } from '../FlutedGlassBackground';
import heroPoster from '../../assets/5f38caf68dd6b8af22362056b70854ea4cf4b933.png';

const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
const fill: React.CSSProperties = { position: 'absolute', inset: 0 };

/**
 * Plays `clips` back to back, muted and inline. The next clip waits, preloaded, underneath the current one,
 * so a swap never shows an empty frame.
 */
function ClipSequence({ clips }: { clips: readonly string[] }) {
  const [index, setIndex] = useState(0);
  const refs = useRef<Record<string, HTMLVideoElement | null>>({});
  const current = clips[index % clips.length];
  const next = clips[(index + 1) % clips.length];
  useEffect(() => {
    const v = refs.current[current];
    if (!v) return;
    v.currentTime = 0;
    v.play()?.catch(() => {});
  }, [current]);
  return (
    <>
      {[...new Set([next, current])].map((src) => (
        <video
          key={src}
          ref={(el) => { refs.current[src] = el; }}
          src={src}
          muted
          playsInline
          preload="auto"
          data-hero-clip={src === current ? 'current' : 'next'}
          onEnded={src === current ? () => setIndex((i) => i + 1) : undefined}
          style={{ ...fill, width: '100%', height: '100%', objectFit: 'cover', opacity: src === current ? 1 : 0, zIndex: src === current ? 1 : 0 }}
        />
      ))}
    </>
  );
}

/**
 * The hero background: poster, then either the given `clips` in sequence or the fluted-glass produce videos
 * (both gated by useHeroBackground), then the warm tint and grain.
 */
export function HeroBackdrop({ clips }: { clips?: readonly string[] }) {
  const { reduceMotion, allowVideo, backgroundVideos } = useHeroBackground({ produce: !clips });
  const [posterLoaded, setPosterLoaded] = useState(false);
  const playClips = !!clips && clips.length > 0 && !reduceMotion && allowVideo;
  return (
    <div aria-hidden="true" style={{ ...fill, zIndex: 0, background: ed.paperAlt }}>
      <img
        src={heroPoster}
        alt=""
        aria-hidden="true"
        decoding="async"
        ref={(el) => { if (el?.complete) setPosterLoaded(true); }}
        onLoad={() => setPosterLoaded(true)}
        style={{ ...fill, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.95) contrast(1.03)', opacity: posterLoaded ? 1 : 0, transition: 'opacity 1.1s ease' }}
      />
      {playClips && <ClipSequence clips={clips} />}
      {!clips && !reduceMotion && backgroundVideos.length > 0 && (
        <FlutedGlassBackground videos={backgroundVideos} poster={heroPoster} style={{ ...fill, width: '100%', height: '100%', display: 'block' }} />
      )}
      <div style={{ ...fill, background: 'linear-gradient(150deg, rgba(197,106,58,0.16) 0%, rgba(224,169,106,0.06) 55%, rgba(176,90,54,0.14) 100%)', mixBlendMode: 'soft-light' }} />
      {/* The product clips carry the hero, so they get a lighter paper wash than the produce clips. */}
      <div style={{ ...fill, background: clips
        ? 'linear-gradient(158deg, rgba(250,245,236,0.10) 0%, rgba(250,245,236,0.16) 40%, rgba(250,245,236,0.45) 78%, rgba(250,245,236,0.70) 100%)'
        : 'linear-gradient(158deg, rgba(250,245,236,0.30) 0%, rgba(250,245,236,0.40) 40%, rgba(250,245,236,0.72) 78%, rgba(250,245,236,0.88) 100%)' }} />
      <div style={{ ...fill, background: 'linear-gradient(90deg, rgba(250,245,236,0.55) 0%, rgba(250,245,236,0.12) 42%, rgba(250,245,236,0) 70%)' }} />
      <div style={{ ...fill, background: 'radial-gradient(110% 100% at 50% 42%, rgba(40,24,14,0) 46%, rgba(40,24,14,0.14) 78%, rgba(30,17,9,0.34) 100%)' }} />
      <div style={{ ...fill, background: 'radial-gradient(70% 70% at 0% 100%, rgba(176,90,54,0.72) 0%, rgba(176,90,54,0.38) 40%, rgba(176,90,54,0) 74%)' }} />
      <div style={{ ...fill, opacity: 0.05, mixBlendMode: 'multiply', backgroundImage: GRAIN, backgroundSize: '180px 180px' }} />
    </div>
  );
}
