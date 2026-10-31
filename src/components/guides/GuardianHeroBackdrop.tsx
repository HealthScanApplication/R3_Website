import React, { useState } from 'react';
import { useHeroBackground } from '../../hooks/useHeroBackground';
import { FlutedGlassBackground } from '../FlutedGlassBackground';

/** The "Become a Guardian." hero clips, in order: one Guardian at work per clip. */
export const GUARDIAN_CLIPS = ['trainer', 'dietitian', 'herbalist', 'breathwork', 'yoga', 'sleep'].map((id) => `/videos/guardians/${id}.mp4`);
export const GUARDIAN_POSTER = '/images/guides/templates/community-table.webp';

const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
const fill: React.CSSProperties = { position: 'absolute', inset: 0 };

/**
 * The /guardians hero background: the poster, the Guardian clips behind the fluted glass (same gate as the
 * /wearables hero: no video under reduced motion, save-data or slow mobile), then the dark ink wash that keeps
 * the white headline readable, the /wearables vignette and grain.
 */
export function GuardianHeroBackdrop() {
  const { reduceMotion, allowVideo } = useHeroBackground({ produce: false });
  const [posterLoaded, setPosterLoaded] = useState(false);
  return (
    <div aria-hidden="true" style={{ ...fill, zIndex: 0, background: '#090A08' }}>
      <img
        src={GUARDIAN_POSTER}
        alt=""
        decoding="async"
        ref={(el) => { if (el?.complete) setPosterLoaded(true); }}
        onLoad={() => setPosterLoaded(true)}
        style={{ ...fill, width: '100%', height: '100%', objectFit: 'cover', opacity: posterLoaded ? 1 : 0, transition: 'opacity 1.1s ease' }}
      />
      {!reduceMotion && allowVideo && (
        <FlutedGlassBackground videos={GUARDIAN_CLIPS} poster={GUARDIAN_POSTER} style={{ ...fill, width: '100%', height: '100%', display: 'block' }} />
      )}
      <div style={{ ...fill, background: 'linear-gradient(rgba(9,10,8,.22), rgba(9,10,8,.84))' }} />
      <div style={{ ...fill, background: 'linear-gradient(90deg, rgba(9,10,8,.55) 0%, rgba(9,10,8,.14) 46%, rgba(9,10,8,0) 72%)' }} />
      <div style={{ ...fill, background: 'radial-gradient(110% 100% at 50% 42%, rgba(40,24,14,0) 46%, rgba(40,24,14,0.14) 78%, rgba(30,17,9,0.34) 100%)' }} />
      <div style={{ ...fill, opacity: 0.05, mixBlendMode: 'multiply', backgroundImage: GRAIN, backgroundSize: '180px 180px' }} />
    </div>
  );
}
