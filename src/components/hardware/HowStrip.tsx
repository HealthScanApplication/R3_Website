import React from 'react';
import type { HowIcon, UseCase } from './copy';

const ACCENT = '#C7D99F';
const SOFT = 'rgba(244, 241, 234, 0.55)';

/** 24px line icons for the "how" strip, drawn in the GestureSection glyph style. Decorative only. */
function Icon({ name }: { name: HowIcon }) {
  const common = { fill: 'none', stroke: ACCENT, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const ring = <circle cx="12" cy="15" r="5.5" {...common} strokeWidth={2.6} />;
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" data-how-icon={name} style={{ display: 'block', flexShrink: 0 }}>
      {name === 'ring' && ring}
      {name === 'ring-tap' && <>{ring}<path d="M12 3.5v3M7.5 5l1.4 2M16.5 5l-1.4 2" {...common} /></>}
      {name === 'ring-double' && <>{ring}<circle cx="9.5" cy="5" r="1.5" fill={ACCENT} /><circle cx="14.5" cy="5" r="1.5" fill={ACCENT} /></>}
      {name === 'ring-hold' && <>{ring}<path d="M12 6.5a8.5 8.5 0 0 1 8.5 8.5" {...common} /><circle cx="12" cy="15" r="1.4" fill={ACCENT} /></>}
      {name === 'ring-swipe' && <>{ring}<path d="M4 5h15M16 2l3 3-3 3" {...common} /></>}
      {name === 'watch' && <><path d="M9 3h6l3 3v12l-3 3H9l-3-3V6z" {...common} /><path d="M9.5 10h5M9.5 13h3" {...common} /></>}
      {name === 'cap' && <><path d="M4 16a8 8 0 0 1 16 0z" {...common} /><path d="M2.5 16H21" {...common} /><circle cx="12" cy="11.5" r="1.6" fill={ACCENT} /></>}
      {name === 'camera' && <><rect x="3" y="7" width="18" height="13" rx="2" {...common} /><path d="M8.5 7l1.5-2.5h4L15.5 7" {...common} /><circle cx="12" cy="13.5" r="3.5" {...common} /></>}
      {name === 'video' && <><rect x="2.5" y="6.5" width="13" height="11" rx="2" {...common} /><path d="M15.5 10.5l6-3v9l-6-3z" {...common} /></>}
      {name === 'mic' && <><rect x="9" y="3" width="6" height="11" rx="3" {...common} /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" {...common} /></>}
      {name === 'calendar' && <><rect x="3.5" y="5" width="17" height="15.5" rx="2" {...common} /><path d="M3.5 10h17M8 3v4M16 3v4" {...common} /></>}
      {name === 'arrow' && <path d="M12 21V4M5.5 10.5L12 4l6.5 6.5" {...common} />}
      {name === 'agent' && <><rect x="4" y="5" width="16" height="14" rx="2" {...common} /><rect x="8" y="9" width="2" height="2" fill={ACCENT} /><rect x="14" y="9" width="2" height="2" fill={ACCENT} /><path d="M9 14.5h6" {...common} /></>}
      {name === 'note' && <><path d="M9 17.5V5l10-2v12.5" {...common} /><circle cx="6.5" cy="17.5" r="2.5" {...common} /><circle cx="16.5" cy="15.5" r="2.5" {...common} /></>}
      {name === 'check' && <path d="M5 12.5l4.5 4.5L19 7" {...common} />}
      {name === 'moon' && <path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z" {...common} />}
    </svg>
  );
}

/** The card's tag box: what you do → what the devices do, then the gesture line. */
export function HowStrip({ item, textStyle }: { item: UseCase; textStyle: React.CSSProperties }) {
  return (
    <div
      data-testid={`usecase-how-${item.id}`}
      style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 12px', padding: '8px 12px', border: '1px solid rgba(199, 217, 159, 0.32)', borderRadius: 4 }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        {item.how.from.map((n) => <Icon key={`f-${n}`} name={n} />)}
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" style={{ display: 'block', flexShrink: 0 }}>
          <path d="M2 8h11M9.5 4.5L13 8l-3.5 3.5" fill="none" stroke={SOFT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {item.how.to.map((n) => <Icon key={`t-${n}`} name={n} />)}
      </span>
      <p style={{ ...textStyle, margin: 0 }}>{item.gesture}</p>
    </div>
  );
}
