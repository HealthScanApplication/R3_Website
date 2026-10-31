import React from 'react';
import { DISPLAY, GRO, ed } from '../../config/editorialTheme';
import { HardwareHero } from './HardwareHero';
import { GestureSection } from './GestureSection';
import { DevicePair } from './DevicePair';
import { UseCases } from './UseCases';
import { WearModes } from './WearModes';
import { AiAssistant } from './AiAssistant';
import { SpecSheet } from './SpecSheet';
import { PRODUCTS, formatUsd } from './copy';

const ACCENT = '#C7D99F';

export function HardwarePage() {
  return (
    <div id="hardware-page" style={{ background: ed.dark, color: ed.onDark, minHeight: '60vh' }}>
      <HardwareHero />
      <GestureSection />
      <DevicePair />
      <UseCases />
      <WearModes />
      <AiAssistant />
      <SpecSheet />
      <section aria-labelledby="hardware-closing-title">
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(56px, 8vw, 120px) clamp(20px, 5vw, 72px)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 32 }}>
          <h2 id="hardware-closing-title" style={{ margin: 0, fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 4.4vw, 4.4rem)', fontWeight: 380, lineHeight: 1, letterSpacing: '-0.03em' }}>Ready when you are.</h2>
          <a className="r3-hw-closing-cta" href="#preorder" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 60, padding: '0 26px', borderRadius: 0, background: ACCENT, color: ed.dark, fontFamily: GRO, fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', textDecoration: 'none' }}>Reserve the R³ Ring — {formatUsd(PRODUCTS.ring.priceCents)}</a>
          <style>{`.r3-hw-closing-cta:focus-visible { outline: 2px solid #C7D99F; outline-offset: 3px; }`}</style>
        </div>
      </section>
    </div>
  );
}
