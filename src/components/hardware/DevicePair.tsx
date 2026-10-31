import React from 'react';
import { DISPLAY, GRO, ed } from '../../config/editorialTheme';
import { RingArt, ClipArt } from './DeviceArt';

const label = { margin: '0 0 10px', fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#C7D99F' } as const;
const body = { margin: 0, maxWidth: 560, fontFamily: GRO, fontSize: 17, lineHeight: 1.55, color: ed.onDarkSoft } as const;
const name = { margin: '0 0 14px', fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 3.6vw, 4rem)', fontWeight: 400, lineHeight: 0.95 } as const;
const art = { overflow: 'hidden', aspectRatio: '1.23 / 1', marginBottom: 28 } as const;

export function DevicePair() {
  return (
    <section aria-labelledby="two-devices-title" style={{ borderBottom: `1px solid ${ed.onDarkHair}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(56px, 8vw, 120px) clamp(20px, 5vw, 72px)' }}>
        <h2 id="two-devices-title" style={{ margin: '0 0 40px', fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 4.4vw, 4.4rem)', fontWeight: 380, lineHeight: 1, letterSpacing: '-0.03em' }}>Two devices, one routine</h2>
        <div className="r3-hw-pair" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'clamp(24px, 4vw, 56px)' }}>
          <article>
            <div style={art}><RingArt /></div>
            <p style={label}>Controller</p>
            <h3 style={name}>R³ Ring</h3>
            <p style={body}>A controller worn on the finger. Its touch and slide surface controls the clip. Final ring specifications are not published yet.</p>
          </article>
          <article>
            <div style={art}><ClipArt /></div>
            <p style={label}>Camera pod</p>
            <h3 style={name}>R³ Clip</h3>
            <p style={body}>A camera pod you can wear as a necklace, a watch, or a clip. It captures your food, activity, voice notes, and AI requests.</p>
          </article>
        </div>
      </div>
      <style>{`
        .r3-hw-pair svg { width: 100%; height: 100%; display: block; }
        @media (max-width: 800px) { .r3-hw-pair { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}
