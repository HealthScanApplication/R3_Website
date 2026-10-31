import React from 'react';
import { DISPLAY, GRO, ed } from '../../config/editorialTheme';

const STEPS = [
  { title: 'Touch or slide', body: 'The R³ Ring has a touch and slide surface that controls the R³ Clip.' },
  { title: 'Capture', body: 'The R³ Clip captures your food, activity, voice notes, and AI requests.' },
  { title: 'Your assistant handles it', body: 'Your AI assistant manages your routine, your calendar, and your email.' },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-title" style={{ borderBottom: `1px solid ${ed.onDarkHair}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(56px, 8vw, 120px) clamp(20px, 5vw, 72px)' }}>
        <h2 id="how-it-works-title" style={{ margin: '0 0 40px', fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 4.4vw, 4.4rem)', fontWeight: 380, lineHeight: 1, letterSpacing: '-0.03em' }}>How it works</h2>
        <ol className="r3-hw-steps" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'clamp(24px, 4vw, 56px)' }}>
          {STEPS.map((step, i) => (
            <li key={step.title} style={{ borderTop: `1px solid ${ed.onDarkHair}`, paddingTop: 20 }}>
              <p style={{ margin: '0 0 10px', fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: '#C7D99F' }}>{String(i + 1).padStart(2, '0')}</p>
              <h3 style={{ margin: '0 0 12px', fontFamily: DISPLAY, fontSize: 'clamp(1.5rem, 2.2vw, 2.2rem)', fontWeight: 400 }}>{step.title}</h3>
              <p style={{ margin: 0, fontFamily: GRO, fontSize: 16, lineHeight: 1.55, color: ed.onDarkSoft }}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
      <style>{`@media (max-width: 800px) { .r3-hw-steps { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
