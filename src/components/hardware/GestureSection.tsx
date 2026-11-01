import React from 'react';
import { DISPLAY, GRO, ed } from '../../config/editorialTheme';
import { GESTURES, GESTURES_TITLE, type GestureGlyph } from './copy';

const ACCENT = '#C7D99F';
const LINE = '#f4f1ea';

/** One small line glyph per gesture, in DeviceArt's line style (cream strokes, one accent mark). Decorative only. */
function Glyph({ kind }: { kind: GestureGlyph }) {
  const common = { fill: 'none', stroke: LINE, strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      {kind === 'tap' && (
        <>
          <circle cx="32" cy="32" r="17" {...common} opacity=".35" />
          <circle cx="32" cy="32" r="7" fill={ACCENT} />
        </>
      )}
      {kind === 'double' && (
        <>
          <circle cx="21" cy="32" r="7" fill={ACCENT} />
          <circle cx="43" cy="32" r="7" fill={ACCENT} />
          <circle cx="21" cy="32" r="13" {...common} opacity=".35" />
          <circle cx="43" cy="32" r="13" {...common} opacity=".35" />
        </>
      )}
      {kind === 'hold' && (
        <>
          <circle cx="32" cy="32" r="7" fill={ACCENT} />
          <circle cx="32" cy="32" r="18" {...common} opacity=".35" />
          <path d="M32 14a18 18 0 0 1 17.1 23.6" {...common} />
        </>
      )}
      {kind === 'swipe' && (
        <>
          <circle cx="16" cy="32" r="6" fill={ACCENT} />
          <path d="M26 32h24M42 24l8 8-8 8" {...common} />
        </>
      )}
    </svg>
  );
}

export function GestureSection() {
  return (
    <section aria-labelledby="gestures-title" style={{ borderBottom: `1px solid ${ed.onDarkHair}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(56px, 8vw, 120px) clamp(20px, 5vw, 72px)' }}>
        <h2 id="gestures-title" style={{ margin: '0 0 40px', fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 4.4vw, 4.4rem)', fontWeight: 380, lineHeight: 1, letterSpacing: '-0.03em' }}>{GESTURES_TITLE}</h2>
        <ul className="r3-hw-gestures" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'clamp(24px, 4vw, 56px)' }}>
          {GESTURES.map((g) => (
            <li key={g.id} style={{ borderTop: `1px solid ${ed.onDarkHair}`, paddingTop: 20 }}>
              <div style={{ margin: '0 0 16px' }}><Glyph kind={g.id} /></div>
              <h3 style={{ margin: '0 0 12px', fontFamily: DISPLAY, fontSize: 'clamp(1.5rem, 2.2vw, 2.2rem)', fontWeight: 400 }}>{g.name}</h3>
              <p style={{ margin: 0, fontFamily: GRO, fontSize: 16, lineHeight: 1.55, color: ed.onDarkSoft }}>{g.line}</p>
            </li>
          ))}
        </ul>
      </div>
      <style>{`
        @media (max-width: 1000px) { .r3-hw-gestures { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; row-gap: 36px !important; } }
        @media (max-width: 340px) { .r3-hw-gestures { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}
