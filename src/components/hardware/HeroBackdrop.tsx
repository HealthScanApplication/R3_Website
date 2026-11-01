import React, { useState } from 'react';
import { ed } from '../../config/editorialTheme';
import { useHeroBackground } from '../../hooks/useHeroBackground';
import { FlutedGlassBackground } from '../FlutedGlassBackground';
import heroPoster from '../../assets/5f38caf68dd6b8af22362056b70854ea4cf4b933.png';

const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
const fill: React.CSSProperties = { position: 'absolute', inset: 0 };

/**
 * The hero background: poster, fluted-glass video (gated by useHeroBackground), warm tint, vignette and grain.
 * The glass plays the given `clips` in order, reporting each start to `onClipStart`; without them it plays
 * the produce clips the hook fetches.
 */
export function HeroBackdrop({ clips, onClipStart }: { clips?: readonly string[]; onClipStart?: (index: number) => void }) {
  const { reduceMotion, allowVideo, backgroundVideos } = useHeroBackground({ produce: !clips });
  const [posterLoaded, setPosterLoaded] = useState(false);
  const videos = clips ? (allowVideo ? [...clips] : []) : backgroundVideos;
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
      {!reduceMotion && videos.length > 0 && (
        <FlutedGlassBackground videos={videos} poster={heroPoster} onClipStart={clips ? onClipStart : undefined} style={{ ...fill, width: '100%', height: '100%', display: 'block' }} />
      )}
      <div style={{ ...fill, background: 'linear-gradient(150deg, rgba(197,106,58,0.16) 0%, rgba(224,169,106,0.06) 55%, rgba(176,90,54,0.14) 100%)', mixBlendMode: 'soft-light' }} />
      <div style={{ ...fill, background: 'linear-gradient(158deg, rgba(250,245,236,0.30) 0%, rgba(250,245,236,0.40) 40%, rgba(250,245,236,0.72) 78%, rgba(250,245,236,0.88) 100%)' }} />
      <div style={{ ...fill, background: 'linear-gradient(90deg, rgba(250,245,236,0.55) 0%, rgba(250,245,236,0.12) 42%, rgba(250,245,236,0) 70%)' }} />
      <div style={{ ...fill, background: 'radial-gradient(110% 100% at 50% 42%, rgba(40,24,14,0) 46%, rgba(40,24,14,0.14) 78%, rgba(30,17,9,0.34) 100%)' }} />
      <div style={{ ...fill, background: 'radial-gradient(70% 70% at 0% 100%, rgba(176,90,54,0.72) 0%, rgba(176,90,54,0.38) 40%, rgba(176,90,54,0) 74%)' }} />
      <div style={{ ...fill, opacity: 0.05, mixBlendMode: 'multiply', backgroundImage: GRAIN, backgroundSize: '180px 180px' }} />
    </div>
  );
}
