import React from 'react';
import { DISPLAY, GRO, ed } from '../../config/editorialTheme';

const ITEMS = [
  { title: 'Routine', body: 'Your AI assistant manages your routine.' },
  { title: 'Calendar', body: 'It manages your calendar.' },
  { title: 'Email', body: 'It manages your email.' },
];

export function AiAssistant() {
  return (
    <section aria-labelledby="ai-assistant-title" style={{ borderBottom: `1px solid ${ed.onDarkHair}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(56px, 8vw, 120px) clamp(20px, 5vw, 72px)' }}>
        <h2 id="ai-assistant-title" style={{ margin: '0 0 40px', fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 4.4vw, 4.4rem)', fontWeight: 380, lineHeight: 1, letterSpacing: '-0.03em' }}>A personal assistant for your routine</h2>
        <div className="r3-hw-ai" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'clamp(24px, 4vw, 56px)' }}>
          {ITEMS.map((item) => (
            <div key={item.title} style={{ borderTop: `1px solid ${ed.onDarkHair}`, paddingTop: 20 }}>
              <h3 style={{ margin: '0 0 12px', fontFamily: DISPLAY, fontSize: 'clamp(1.5rem, 2.2vw, 2.2rem)', fontWeight: 400 }}>{item.title}</h3>
              <p style={{ margin: 0, fontFamily: GRO, fontSize: 16, lineHeight: 1.55, color: ed.onDarkSoft }}>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
      <style>{`@media (max-width: 800px) { .r3-hw-ai { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
