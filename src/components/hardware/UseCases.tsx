import React from 'react';
import { DISPLAY, GRO, ed } from '../../config/editorialTheme';
import { USE_CASES, USE_CASES_TITLE, type UseCase } from './copy';

const ACCENT = '#C7D99F';
const smallCaps = { fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' } as const;
// A faint film grain (SVG turbulence), laid over the placeholder's paper-to-ink gradient.
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>')}")`;
const media = { position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden', margin: '0 0 20px' } as const;

/** The 16:9 picture: the item's image, or a styled placeholder (never a broken image) until one exists. */
function UseCaseMedia({ item }: { item: UseCase }) {
  if (item.image) {
    return (
      <div style={media}>
        <img src={item.image} alt={item.scene} loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={item.scene}
      data-testid={`usecase-placeholder-${item.id}`}
      style={{ ...media, display: 'flex', alignItems: 'flex-end', background: `linear-gradient(150deg, ${ed.paperAlt} 0%, #cfc4ae 38%, #5b5244 78%, ${ed.ink} 100%)` }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN, opacity: 0.35, mixBlendMode: 'multiply' }} />
      <p aria-hidden="true" style={{ ...smallCaps, position: 'relative', margin: 0, padding: '14px 16px', fontSize: 10, lineHeight: 1.5, color: ed.onDark }}>{item.scene}</p>
    </div>
  );
}

export function UseCaseCard({ item }: { item: UseCase }) {
  return (
    <article style={{ borderTop: `1px solid ${ed.onDarkHair}`, paddingTop: 20 }}>
      <UseCaseMedia item={item} />
      <h3 style={{ margin: '0 0 10px', fontFamily: DISPLAY, fontSize: 'clamp(1.4rem, 1.9vw, 1.9rem)', fontWeight: 400, lineHeight: 1.1 }}>{item.title}</h3>
      <p style={{ ...smallCaps, margin: '0 0 12px', lineHeight: 1.5, color: ACCENT }}>{item.gesture}</p>
      <p style={{ margin: 0, fontFamily: GRO, fontSize: 16, lineHeight: 1.55, color: ed.onDarkSoft }}>{item.result}</p>
    </article>
  );
}

export function UseCases() {
  return (
    <section aria-labelledby="use-cases-title" style={{ borderBottom: `1px solid ${ed.onDarkHair}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(56px, 8vw, 120px) clamp(20px, 5vw, 72px)' }}>
        <h2 id="use-cases-title" style={{ margin: '0 0 40px', fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 4.4vw, 4.4rem)', fontWeight: 380, lineHeight: 1, letterSpacing: '-0.03em' }}>{USE_CASES_TITLE}</h2>
        <div className="r3-hw-usecases" style={{ display: 'grid', gap: 'clamp(28px, 3.4vw, 48px) clamp(24px, 3vw, 40px)' }}>
          {USE_CASES.map((u) => <UseCaseCard key={u.id} item={u} />)}
        </div>
      </div>
      <style>{`
        .r3-hw-usecases { grid-template-columns: 1fr; }
        @media (min-width: 700px) { .r3-hw-usecases { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (min-width: 1100px) { .r3-hw-usecases { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      `}</style>
    </section>
  );
}
