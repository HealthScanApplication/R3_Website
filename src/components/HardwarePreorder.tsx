import React from 'react';
import { DISPLAY, GRO, ed } from '../config/editorialTheme';
import { RingArt, ClipArt } from './hardware/DeviceArt';
import { PREORDER_TERMS, PRODUCTS, formatUsd } from './hardware/copy';

const ACCENT = '#C7D99F';
const label = { margin: '0 0 10px', fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: ACCENT } as const;
const name = { margin: '0 0 14px', fontFamily: DISPLAY, fontSize: 'clamp(2.5rem, 4vw, 4.7rem)', fontWeight: 400, lineHeight: 0.95 } as const;
const body = { margin: 0, maxWidth: 620, fontFamily: GRO, fontSize: 17, lineHeight: 1.55, color: ed.onDarkSoft } as const;

export function HardwarePreorder() {
  return (
    <section id="hardware-preorder" aria-labelledby="hardware-preorder-title" style={{ background: ed.dark, color: ed.onDark, borderTop: `1px solid ${ed.onDarkHair}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(88px, 10vw, 156px) clamp(20px, 5vw, 72px)' }}>
        <header className="r3-hw-teaser-header" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(280px, .55fr)', gap: 'clamp(32px, 7vw, 112px)', alignItems: 'end', marginBottom: 'clamp(48px, 7vw, 92px)' }}>
          <div>
            <p style={{ ...label, margin: '0 0 18px', fontSize: 12, letterSpacing: '0.18em' }}>R³ hardware · first batch</p>
            <h2 id="hardware-preorder-title" style={{ margin: 0, maxWidth: 920, fontFamily: DISPLAY, fontSize: 'clamp(3.5rem, 7.4vw, 8.2rem)', fontWeight: 380, lineHeight: 0.9, letterSpacing: '-0.045em' }}>
              Meet the R³ Ring and R³ Clip.
            </h2>
          </div>
          <p style={{ ...body, fontSize: 'clamp(16px, 1.4vw, 21px)' }}>
            A touch-and-slide ring controls a camera clip you can wear as a necklace, a watch, or a clip. Your AI assistant manages your routine, calendar, and email.
          </p>
        </header>

        <div className="r3-hw-teaser-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', borderTop: `1px solid ${ed.onDarkHair}`, borderBottom: `1px solid ${ed.onDarkHair}` }}>
          <article style={{ padding: 'clamp(28px, 4vw, 54px) clamp(0px, 3vw, 48px) clamp(42px, 5vw, 68px) 0', borderRight: `1px solid ${ed.onDarkHair}` }}>
            <div style={{ overflow: 'hidden', aspectRatio: '1.23 / 1', marginBottom: 30 }}><RingArt /></div>
            <p style={label}>Controller</p>
            <h3 style={name}>R³ Ring</h3>
            <p style={body}>A controller worn on the finger. Its touch and slide surface controls the clip.</p>
          </article>
          <article style={{ padding: 'clamp(28px, 4vw, 54px) 0 clamp(42px, 5vw, 68px) clamp(0px, 3vw, 48px)' }}>
            <div style={{ overflow: 'hidden', aspectRatio: '1.23 / 1', marginBottom: 30 }}><ClipArt /></div>
            <p style={label}>Camera pod</p>
            <h3 style={name}>R³ Clip</h3>
            <p style={body}>A camera pod you can wear as a necklace, a watch, or a clip. It captures your food, activity, voice notes, and AI requests.</p>
          </article>
        </div>

        <div style={{ paddingTop: 'clamp(40px, 6vw, 72px)' }}>
          <a href="/ring" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 60, background: ACCENT, color: ed.dark, padding: '0 28px', fontFamily: GRO, fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', textDecoration: 'none' }}>
            {`See the R³ Ring — from ${formatUsd(PRODUCTS.ring.priceCents)}`}
          </a>
          <p style={{ margin: '18px 0 0', fontFamily: GRO, fontSize: 15, lineHeight: 1.55, color: ed.onDarkSoft }}>
            {PREORDER_TERMS}
          </p>
        </div>
      </div>
      <style>{`
        .r3-hw-teaser-grid svg { width: 100%; height: 100%; display: block; }
        @media (max-width: 800px) {
          .r3-hw-teaser-header, .r3-hw-teaser-grid { grid-template-columns: 1fr !important; }
          .r3-hw-teaser-grid article:first-child { border-right: 0 !important; border-bottom: 1px solid ${ed.onDarkHair}; padding-right: 0 !important; }
          .r3-hw-teaser-grid article:last-child { padding-left: 0 !important; }
        }
      `}</style>
    </section>
  );
}
