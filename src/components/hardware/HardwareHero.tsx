import React, { useEffect, useState } from 'react';
import { ed, GRO, coverStyle, deckStyle, folioStyle } from '../../config/editorialTheme';
import { GOAL_WORDS } from '../../config/goalWords';
import { useHeroBackground } from '../../hooks/useHeroBackground';
import { FlutedGlassBackground } from '../FlutedGlassBackground';
import heroPoster from '../../assets/5f38caf68dd6b8af22362056b70854ea4cf4b933.png';
import { HeroDevices } from './HeroDevices';
import { PreorderBlock } from './PreorderBlock';

const DECK = "Touch or slide the R³ Note to control the R³ Clip's camera, record a voice note, or hand a request to your AI assistant.";
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
const fill: React.CSSProperties = { position: 'absolute', inset: 0 };
const overline: React.CSSProperties = { fontFamily: GRO, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: ed.inkSoft, margin: 0 };

export function HardwareHero() {
  const { reduceMotion, backgroundVideos } = useHeroBackground();
  const [wordIndex, setWordIndex] = useState(0);
  const [wordVisible, setWordVisible] = useState(true);
  const [posterLoaded, setPosterLoaded] = useState(false);

  // Same rotation as HeroSection.tsx: 3200 ms interval, 320 ms fade.
  useEffect(() => {
    if (reduceMotion) { setWordIndex(0); setWordVisible(true); return; }
    let fade: ReturnType<typeof setTimeout> | undefined;
    const t = setInterval(() => {
      setWordVisible(false);
      fade = setTimeout(() => { setWordIndex((i) => (i + 1) % GOAL_WORDS.length); setWordVisible(true); }, 320);
    }, 3200);
    return () => { clearInterval(t); if (fade) clearTimeout(fade); };
  }, [reduceMotion]);

  return (
    <section id="hardware-hero" aria-labelledby="hardware-hero-title" style={{ position: 'relative', minHeight: '100svh', background: ed.paper, overflow: 'hidden' }}>
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
        {!reduceMotion && backgroundVideos.length > 0 && (
          <FlutedGlassBackground videos={backgroundVideos} poster={heroPoster} style={{ ...fill, width: '100%', height: '100%', display: 'block' }} />
        )}
        <div style={{ ...fill, background: 'linear-gradient(150deg, rgba(197,106,58,0.16) 0%, rgba(224,169,106,0.06) 55%, rgba(176,90,54,0.14) 100%)', mixBlendMode: 'soft-light' }} />
        <div style={{ ...fill, background: 'linear-gradient(158deg, rgba(250,245,236,0.30) 0%, rgba(250,245,236,0.40) 40%, rgba(250,245,236,0.72) 78%, rgba(250,245,236,0.88) 100%)' }} />
        <div style={{ ...fill, background: 'linear-gradient(90deg, rgba(250,245,236,0.55) 0%, rgba(250,245,236,0.12) 42%, rgba(250,245,236,0) 70%)' }} />
        <div style={{ ...fill, background: 'radial-gradient(110% 100% at 50% 42%, rgba(40,24,14,0) 46%, rgba(40,24,14,0.14) 78%, rgba(30,17,9,0.34) 100%)' }} />
        <div style={{ ...fill, background: 'radial-gradient(70% 70% at 0% 100%, rgba(176,90,54,0.72) 0%, rgba(176,90,54,0.38) 40%, rgba(176,90,54,0) 74%)' }} />
        <div style={{ ...fill, opacity: 0.05, mixBlendMode: 'multiply', backgroundImage: GRAIN, backgroundSize: '180px 180px' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 2, minHeight: '100svh', display: 'flex', flexDirection: 'column', maxWidth: 1440, margin: '0 auto', paddingLeft: 'clamp(20px, 5vw, 72px)', paddingRight: 'clamp(20px, 5vw, 72px)', paddingTop: 'clamp(88px, 9vh, 104px)', paddingBottom: 'clamp(32px, 5vh, 56px)', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1px solid ${ed.hair}`, paddingTop: 14, paddingLeft: 'clamp(16px, 2vw, 28px)', paddingRight: 'clamp(16px, 2vw, 28px)' }}>
          <p style={overline}>R³ hardware · first batch</p>
          <p style={folioStyle}>Early-backer preorder</p>
        </div>

        <div style={{ flex: 1, minHeight: 'clamp(24px, 5vh, 80px)' }} />

        <div className="r3-hw-hero-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: 'clamp(28px, 5vw, 80px)', alignItems: 'end' }}>
          <div>
            <h1 id="hardware-hero-title" style={{ ...coverStyle, color: '#FFFFFF', textShadow: '0 4px 24px rgba(0,0,0,0.38)' }}>
              <span style={{ display: 'block' }}>Track a routine</span>
              <span style={{ display: 'block' }}>
                for{' '}
                <span style={{ fontStyle: 'italic', color: ed.ink, textShadow: 'none', transition: reduceMotion ? undefined : 'opacity 320ms ease', opacity: wordVisible ? 1 : 0 }}>
                  {GOAL_WORDS[reduceMotion ? 0 : wordIndex]}
                </span>
              </span>
            </h1>
            <p style={{ ...deckStyle, color: ed.ink, marginTop: 'clamp(20px, 3vw, 36px)', maxWidth: '34ch' }}>{DECK}</p>
            <div id="hero-preorder" style={{ marginTop: 'clamp(28px, 4vh, 48px)', maxWidth: 560 }}>
              <PreorderBlock />
            </div>
          </div>
          <div className="r3-hw-hero-devices" style={{ position: 'relative', width: '100%', aspectRatio: '4 / 5', minHeight: 420 }}>
            <HeroDevices />
          </div>
        </div>
      </div>
      <style>{`@supports not (min-height: 100svh) { #hardware-hero, #hardware-hero > div { min-height: 100vh !important; } }
@media (max-width: 800px) { .r3-hw-hero-grid { grid-template-columns: 1fr !important; } .r3-hw-hero-devices { aspect-ratio: 1 / 1 !important; min-height: 0 !important; max-height: 52svh; } }`}</style>
    </section>
  );
}
