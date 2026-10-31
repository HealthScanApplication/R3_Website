import React from 'react';
import { DISPLAY, GRO, ed } from '../../config/editorialTheme';
import { PRODUCTS, formatUsd } from './copy';
import { BackerBar } from './BackerBar';
import { RingViewer } from './RingViewer';

const ACCENT = '#C7D99F';
const linkBase = {
  display: 'inline-flex', alignItems: 'center', minHeight: 52, padding: '0 24px', fontFamily: GRO,
  fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none',
} as const;

export function HardwareHero() {
  return (
    <section aria-labelledby="hardware-hero-title" style={{ borderBottom: `1px solid ${ed.onDarkHair}` }}>
      <div className="r3-hw-hero" style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(56px, 8vw, 120px) clamp(20px, 5vw, 72px)', display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: 'clamp(32px, 6vw, 96px)', alignItems: 'center' }}>
        <div>
          <p style={{ margin: '0 0 18px', fontFamily: GRO, fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: ACCENT }}>R³ hardware · first batch</p>
          <h1 id="hardware-hero-title" style={{ margin: 0, fontFamily: DISPLAY, fontSize: 'clamp(3rem, 6.4vw, 6.6rem)', fontWeight: 380, lineHeight: 0.95, letterSpacing: '-0.04em' }}>
            Track your routine without lifting a finger.
          </h1>
          <p style={{ margin: '28px 0 32px', maxWidth: 560, fontFamily: GRO, fontSize: 'clamp(16px, 1.4vw, 20px)', lineHeight: 1.55, color: ed.onDarkSoft }}>
            Touch or slide the R³ Note to control the R³ Clip's camera, record a voice note, or hand a request to your AI assistant.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
            <a href="#preorder" style={{ ...linkBase, background: ACCENT, color: ed.dark }}>Reserve the R³ Note — {formatUsd(PRODUCTS.ring.priceCents)}</a>
            <a href="#preorder" style={{ ...linkBase, border: `1px solid ${ed.onDark}`, color: ed.onDark }}>R³ Note + Clip — {formatUsd(PRODUCTS.bundle.priceCents)}</a>
          </div>
          <BackerBar />
        </div>
        <div style={{ aspectRatio: '1 / 1', width: '100%', overflow: 'hidden' }}>
          <RingViewer />
        </div>
      </div>
      <style>{`@media (max-width: 800px) { .r3-hw-hero { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
