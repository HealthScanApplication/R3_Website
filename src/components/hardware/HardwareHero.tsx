import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ed, GRO, coverStyle, deckStyle } from '../../config/editorialTheme';
import { useHeroBackground } from '../../hooks/useHeroBackground';
import { HeroBackdrop } from './HeroBackdrop';
import { HeroDevices } from './HeroDevices';
import { PreorderBlock } from './PreorderBlock';
import { HERO_CLIPS, HERO_FEATURE_WORDS } from './copy';

const DECK = 'See it, say it, do it — in real time, without a phone. Tap the R³ Ring and the R³ Clip takes the photo, logs the activity or saves the voice note.';
const overline: React.CSSProperties = { fontFamily: GRO, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: ed.inkSoft, margin: 0 };

export function HardwareHero() {
  const { reduceMotion } = useHeroBackground();
  const [wordIndex, setWordIndex] = useState(0);
  const [wordVisible, setWordVisible] = useState(true);
  // Once the background clips play, each clip start sets the word (HERO_MOMENTS pairs them); until then,
  // or when there is no video, the word rotates on its own.
  const [clipDriven, setClipDriven] = useState(false);
  const wordRef = useRef(0);
  wordRef.current = wordIndex;
  const fadeRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (fadeRef.current) clearTimeout(fadeRef.current); }, []);

  const showWord = useCallback((i: number) => {
    setClipDriven(true);
    if (i === wordRef.current) return;
    setWordVisible(false);
    if (fadeRef.current) clearTimeout(fadeRef.current);
    fadeRef.current = setTimeout(() => { setWordIndex(i); setWordVisible(true); }, 320);
  }, []);

  // Same rotation as HeroSection.tsx: 3200 ms interval, 320 ms fade.
  useEffect(() => {
    if (reduceMotion) { setWordIndex(0); setWordVisible(true); return; }
    if (clipDriven) return;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const t = setInterval(() => {
      setWordVisible(false);
      fade = setTimeout(() => { setWordIndex((i) => (i + 1) % HERO_FEATURE_WORDS.length); setWordVisible(true); }, 320);
    }, 3200);
    return () => { clearInterval(t); if (fade) clearTimeout(fade); };
  }, [reduceMotion, clipDriven]);

  return (
    <section id="hardware-hero" aria-labelledby="hardware-hero-title" style={{ position: 'relative', minHeight: '100svh', background: ed.paper, overflow: 'hidden' }}>
      <HeroBackdrop clips={HERO_CLIPS} onClipStart={showWord} />

      <div style={{ position: 'relative', zIndex: 2, minHeight: '100svh', display: 'flex', flexDirection: 'column', maxWidth: 1440, margin: '0 auto', paddingLeft: 'clamp(20px, 5vw, 72px)', paddingRight: 'clamp(20px, 5vw, 72px)', paddingTop: 'clamp(88px, 9vh, 104px)', paddingBottom: 'clamp(104px, 14vh, 128px)', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1px solid ${ed.hair}`, paddingTop: 14, paddingLeft: 'clamp(16px, 2vw, 28px)', paddingRight: 'clamp(16px, 2vw, 28px)' }}>
          <p style={overline}>Set · Track · Adapt</p>
        </div>

        <div className="r3-hw-hero-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: 'clamp(28px, 5vw, 80px)', alignItems: 'end', paddingTop: 'clamp(24px, 5vh, 80px)' }}>
          <div style={{ alignSelf: 'center', marginBottom: 'clamp(16px, 12vh, 120px)' }}>
            {/* Two lines on a wide screen (the title may run past its column over the devices' empty top); it wraps on a phone. */}
            <h1 id="hardware-hero-title" className="r3-hw-title" style={{ ...coverStyle, fontSize: 'clamp(2.8rem, 7.4vw, 8.2rem)', color: ed.ink, position: 'relative', zIndex: 3 }}>
              <span style={{ display: 'block', whiteSpace: 'nowrap' }}>
                Capture your{' '}
                <span style={{ fontStyle: 'italic', color: '#FFFFFF', textShadow: '0 4px 24px rgba(0,0,0,0.38)', transition: reduceMotion ? undefined : 'opacity 320ms ease', opacity: wordVisible ? 1 : 0 }}>
                  {HERO_FEATURE_WORDS[reduceMotion ? 0 : wordIndex]}
                </span>
              </span>
              <span style={{ display: 'block', whiteSpace: 'nowrap' }}>without a phone.</span>
            </h1>
            <p style={{ ...deckStyle, color: ed.ink, marginTop: 'clamp(20px, 3vw, 36px)', maxWidth: '34ch' }}>{DECK}</p>
            <div id="preorder" style={{ scrollMarginTop: 'calc(64px + 64px + 16px)', marginTop: 'clamp(28px, 4vh, 48px)', maxWidth: 640 }}>
              <PreorderBlock variant="hero" />
            </div>
          </div>
          <div className="r3-hw-hero-devices" style={{ position: 'relative', width: '100%', aspectRatio: '4 / 5', minHeight: 420, alignSelf: 'center' }}>
            <HeroDevices />
          </div>
        </div>
      </div>
      <style>{`@supports not (min-height: 100svh) { #hardware-hero, #hardware-hero > div { min-height: 100vh !important; } }
@media (max-width: 800px) { .r3-hw-title span { white-space: normal !important; } .r3-hw-hero-grid { grid-template-columns: minmax(0, 1fr) !important; align-content: end; } .r3-hw-hero-devices { aspect-ratio: 1 / 1 !important; min-height: 0 !important; max-height: 52svh; } }`}</style>
    </section>
  );
}
