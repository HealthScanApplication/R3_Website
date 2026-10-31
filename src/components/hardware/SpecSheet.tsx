import React from 'react';
import { DISPLAY, GRO, ed } from '../../config/editorialTheme';

type Row = [string, string];
const RING: Row[] = [['Control', 'Touch and slide'], ['Works with', 'R³ Clip']];
const CLIP: Row[] = [
  ['Camera', '8 MP wide-angle, 160° field of view'],
  ['Captures', 'Food, activity, voice notes, AI requests'],
  ['Tracks', 'Heart rate'],
  ['Worn as', 'Necklace, watch, or clip'],
  ['Privacy', 'Physical slider cuts the camera, microphones, and radios; red LED while the camera is on'],
];

function SpecList({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontFamily: DISPLAY, fontSize: 'clamp(1.5rem, 2.2vw, 2.2rem)', fontWeight: 400 }}>{title}</h3>
      <dl style={{ margin: 0 }}>
        {rows.map(([term, value]) => (
          <div key={term} style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 16, padding: '14px 0', borderTop: `1px solid ${ed.onDarkHair}` }}>
            <dt style={{ fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C7D99F' }}>{term}</dt>
            <dd style={{ margin: 0, fontFamily: GRO, fontSize: 16, lineHeight: 1.5, color: ed.onDarkSoft }}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SpecSheet() {
  return (
    <section aria-labelledby="specs-title" style={{ borderBottom: `1px solid ${ed.onDarkHair}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(56px, 8vw, 120px) clamp(20px, 5vw, 72px)' }}>
        <h2 id="specs-title" style={{ margin: '0 0 16px', fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 4.4vw, 4.4rem)', fontWeight: 380, lineHeight: 1, letterSpacing: '-0.03em' }}>Specifications</h2>
        <p style={{ margin: '0 0 40px', fontFamily: GRO, fontSize: 15, color: ed.onDarkSoft }}>Planned specifications. Final details are confirmed before manufacturing.</p>
        <div className="r3-hw-specs" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'clamp(24px, 4vw, 56px)', alignItems: 'start' }}>
          <SpecList title="R³ Note" rows={RING} />
          <SpecList title="R³ Clip" rows={CLIP} />
        </div>
      </div>
      <style>{`@media (max-width: 800px) { .r3-hw-specs { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
