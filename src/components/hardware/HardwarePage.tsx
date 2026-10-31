import React from 'react';
import { DISPLAY, ed } from '../../config/editorialTheme';
import { HardwareHero } from './HardwareHero';
import { HowItWorks } from './HowItWorks';
import { DevicePair } from './DevicePair';
import { AiAssistant } from './AiAssistant';
import { SpecSheet } from './SpecSheet';
import { PRODUCTS, formatUsd } from './copy';

export function HardwarePage() {
  return (
    <div id="hardware-page" style={{ background: ed.dark, color: ed.onDark, minHeight: '60vh' }}>
      <HardwareHero />
      <HowItWorks />
      <DevicePair />
      <AiAssistant />
      <SpecSheet />
      <section aria-labelledby="hardware-closing-title">
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(56px, 8vw, 120px) clamp(20px, 5vw, 72px)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 32 }}>
          <h2 id="hardware-closing-title" style={{ margin: 0, fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 4.4vw, 4.4rem)', fontWeight: 380, lineHeight: 1, letterSpacing: '-0.03em' }}>Ready when you are.</h2>
          <a href="#preorder" style={{ display: 'inline-block', padding: '16px 28px', borderRadius: 999, background: ed.ink, color: '#FFFFFF', textDecoration: 'none', fontWeight: 600 }}>Reserve the R³ Note — {formatUsd(PRODUCTS.ring.priceCents)}</a>
        </div>
      </section>
    </div>
  );
}
