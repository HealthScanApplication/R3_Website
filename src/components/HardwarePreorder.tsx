import React, { useEffect, useRef, useState } from 'react';
import { GRO, coverStyle, deckStyle, ed } from '../config/editorialTheme';
import { RingArt, ClipArt } from './hardware/DeviceArt';
import { HeroBackdrop } from './hardware/HeroBackdrop';
import { HeroDevices } from './hardware/HeroDevices';
import { PREORDER_TERMS, PRODUCTS, formatUsd } from './hardware/copy';

const DECK = 'A touch-and-slide ring controls a camera clip you can wear as a necklace, a watch, or a clip. Your AI assistant manages your routine, calendar, and email.';
const overline: React.CSSProperties = { fontFamily: GRO, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: ed.inkSoft, margin: 0 };

/** Mounts HeroDevices (and so the three.js import) only once the section is within 400px of the viewport. */
function LazyHeroDevices({ targetRef }: { targetRef: React.RefObject<HTMLElement | null> }) {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near || !targetRef.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); }
    }, { rootMargin: '400px' });
    io.observe(targetRef.current);
    return () => io.disconnect();
  }, [near, targetRef]);
  if (near) return <HeroDevices />;
  return (
    <div data-testid="devices-fallback" style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}><RingArt /></div>
      <div style={{ flex: 1, minWidth: 0 }}><ClipArt /></div>
    </div>
  );
}

export function HardwarePreorder() {
  const sectionRef = useRef<HTMLElement>(null);
  return (
    <section ref={sectionRef} id="hardware-preorder" aria-labelledby="hardware-preorder-title" style={{ position: 'relative', minHeight: '100svh', background: ed.paper, overflow: 'hidden' }}>
      <HeroBackdrop />

      <div style={{ position: 'relative', zIndex: 2, minHeight: '100svh', display: 'flex', flexDirection: 'column', maxWidth: 1440, margin: '0 auto', paddingLeft: 'clamp(20px, 5vw, 72px)', paddingRight: 'clamp(20px, 5vw, 72px)', paddingTop: 'clamp(64px, 9vh, 104px)', paddingBottom: 'clamp(32px, 5vh, 56px)', boxSizing: 'border-box' }}>
        <div style={{ borderTop: `1px solid ${ed.hair}`, paddingTop: 14, paddingLeft: 'clamp(16px, 2vw, 28px)', paddingRight: 'clamp(16px, 2vw, 28px)' }}>
          <p style={overline}>R³ hardware · first batch</p>
        </div>

        <div className="r3-hw-teaser-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: 'clamp(28px, 5vw, 80px)', alignItems: 'end', paddingTop: 'clamp(24px, 5vh, 80px)' }}>
          <div style={{ alignSelf: 'center' }}>
            <h2 id="hardware-preorder-title" style={{ ...coverStyle, fontSize: 'clamp(2.8rem, 7vw, 7.5rem)', color: '#FFFFFF', textShadow: '0 4px 24px rgba(0,0,0,0.38)' }}>
              Meet the R³ Note and R³ Clip.
            </h2>
            <p style={{ ...deckStyle, color: ed.ink, marginTop: 'clamp(20px, 3vw, 36px)', maxWidth: '34ch' }}>{DECK}</p>
            <div style={{ marginTop: 'clamp(28px, 4vh, 48px)', maxWidth: 560 }}>
              <a href="/ring" style={{ display: 'inline-flex', alignItems: 'center', height: 42, boxSizing: 'border-box', padding: '0 16px', background: '#FFFFFF', color: '#16140F', border: '1px solid #FFFFFF', borderRadius: 2, fontFamily: '"Archivo", "Inter", sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none' }}>
                {`See the R³ Note — from ${formatUsd(PRODUCTS.ring.priceCents)}`}
              </a>
              <p style={{ margin: '16px 0 0', fontFamily: GRO, fontSize: 14, lineHeight: 1.55, color: ed.ink }}>{PREORDER_TERMS}</p>
            </div>
          </div>
          <div className="r3-hw-teaser-devices" style={{ position: 'relative', width: '100%', aspectRatio: '4 / 5', minHeight: 420, alignSelf: 'center' }}>
            <LazyHeroDevices targetRef={sectionRef} />
          </div>
        </div>
      </div>
      <style>{`@supports not (min-height: 100svh) { #hardware-preorder, #hardware-preorder > div { min-height: 100vh !important; } }
.r3-hw-teaser-devices svg { width: 100%; height: 100%; display: block; }
@media (max-width: 800px) { .r3-hw-teaser-grid { grid-template-columns: 1fr !important; align-content: end; } .r3-hw-teaser-devices { aspect-ratio: 1 / 1 !important; min-height: 0 !important; max-height: 52svh; } }`}</style>
    </section>
  );
}
