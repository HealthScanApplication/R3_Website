import React from 'react';
import { DISPLAY, ed } from '../../config/editorialTheme';
import { HardwareHero } from './HardwareHero';
import { HowItWorks } from './HowItWorks';
import { DevicePair } from './DevicePair';
import { AiAssistant } from './AiAssistant';
import { SpecSheet } from './SpecSheet';
import { PreorderBlock } from './PreorderBlock';

export function HardwarePage() {
  return (
    <div id="hardware-page" style={{ background: ed.dark, color: ed.onDark, minHeight: '60vh' }}>
      <HardwareHero />
      <HowItWorks />
      <DevicePair />
      <AiAssistant />
      <SpecSheet />
      <section id="preorder" aria-labelledby="preorder-title" style={{ scrollMarginTop: 'calc(64px + 64px + 16px)' }}>
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(56px, 8vw, 120px) clamp(20px, 5vw, 72px)' }}>
          <h2 id="preorder-title" style={{ margin: '0 0 40px', fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 4.4vw, 4.4rem)', fontWeight: 380, lineHeight: 1, letterSpacing: '-0.03em' }}>Reserve your early-backer price</h2>
          <PreorderBlock />
        </div>
      </section>
    </div>
  );
}
