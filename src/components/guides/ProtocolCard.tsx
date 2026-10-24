import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

/**
 * Protocol card: the Guardian profile card (dark picture on top, small-caps kicker, serif title, one line of copy,
 * "VIEW →") with two moves on the picture. Resting, it is a tilt-shift photograph in black and white: sharp across the
 * middle, the top and bottom blurred as if the scene were a miniature. On hover, focus, or when the card is open, the
 * colour comes in and the blur eases off, and the card lifts and leans a few degrees toward the pointer.
 * Touch screens cannot hover, so there the picture is in colour from the start.
 * Scoped CSS because index.css is prebuilt (no Tailwind JIT); `.r3-pcard*` classes only.
 */
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
/** Shown when a protocol has no picture of its own: the same plate the Guardian card uses. */
export const PROTOCOL_PLATE = '/images/guides/build-plate.png';

const GRADE = 'grayscale(1) contrast(1.05) brightness(.9)';
const COLOUR = 'grayscale(0) saturate(1.22) contrast(1.05) brightness(1)';
export const PROTOCOL_CARD_CSS = `
.r3-pcard{--ease:cubic-bezier(.16,1,.3,1);position:relative;display:flex;flex-direction:column;box-sizing:border-box;width:100%;min-height:390px;margin:0;padding:0;text-align:left;font-family:${sans};color:#11120F;text-decoration:none;background:#FFF;border:1px solid rgba(17,18,15,.18);border-radius:6px;overflow:hidden;cursor:pointer;transform:perspective(900px) rotateX(var(--tx,0deg)) rotateY(var(--ty,0deg)) translateY(var(--lift,0px));transition:transform 600ms var(--ease),box-shadow 600ms var(--ease),border-color 300ms ease}
.r3-pcard:hover,.r3-pcard:focus-visible{--lift:-4px;border-color:#667245;box-shadow:0 22px 44px -18px rgba(17,18,15,.4)}
.r3-pcard:focus-visible{outline:2px solid #9A6A2F;outline-offset:3px}
.r3-pcard[data-pressed=true]{border-color:#11120F}
.r3-pcard-media{position:relative;height:220px;flex:0 0 auto;background:#171812;overflow:hidden}
.r3-pcard-img,.r3-pcard-blur{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;filter:${GRADE};transform:scale(1.001);transition:filter 800ms var(--ease),transform 1000ms var(--ease)}
.r3-pcard-blur{pointer-events:none;filter:${GRADE} blur(7px);transform:scale(1.07)}
.r3-pcard-blur.top{-webkit-mask-image:linear-gradient(to bottom,#000 0,#000 8%,transparent 36%);mask-image:linear-gradient(to bottom,#000 0,#000 8%,transparent 36%)}
.r3-pcard-blur.bottom{-webkit-mask-image:linear-gradient(to top,#000 0,#000 8%,transparent 36%);mask-image:linear-gradient(to top,#000 0,#000 8%,transparent 36%)}
.r3-pcard-plate{position:absolute;left:50%;top:50%;width:150px;height:150px;object-fit:contain;transform:translate(-50%,-50%);filter:grayscale(1) brightness(.95);transition:filter 800ms var(--ease)}
.r3-pcard:hover .r3-pcard-img,.r3-pcard:focus-visible .r3-pcard-img,.r3-pcard[data-pressed=true] .r3-pcard-img{filter:${COLOUR};transform:scale(1.035)}
.r3-pcard:hover .r3-pcard-blur,.r3-pcard:focus-visible .r3-pcard-blur,.r3-pcard[data-pressed=true] .r3-pcard-blur{filter:${COLOUR} blur(3.5px);transform:scale(1.09)}
.r3-pcard:hover .r3-pcard-plate,.r3-pcard:focus-visible .r3-pcard-plate{filter:grayscale(0) brightness(1.05)}
.r3-pcard-body{display:flex;flex:1;flex-direction:column;padding:20px}
.r3-pcard-kicker{color:#667245;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.r3-pcard-title{font-family:${serif};font-size:28px;font-weight:300;line-height:1.02;margin:12px 0 8px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.r3-pcard-copy{color:#66645F;font-size:13px;line-height:1.5;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.r3-pcard-foot{margin-top:auto;padding-top:20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.r3-pcard-by{min-width:0;color:#66645F;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.r3-pcard-cta{display:inline-flex;flex:0 0 auto;align-items:center;gap:8px;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#11120F}
.r3-pcard-cta svg{transition:transform 400ms var(--ease)}
.r3-pcard:hover .r3-pcard-cta svg,.r3-pcard:focus-visible .r3-pcard-cta svg{transform:translateX(4px)}
@media (hover:none){
  .r3-pcard-img{filter:${COLOUR}}
  .r3-pcard-blur{filter:${COLOUR} blur(3.5px)}
  .r3-pcard-plate{filter:none}
}
@media (prefers-reduced-motion:reduce){
  .r3-pcard,.r3-pcard-img,.r3-pcard-blur,.r3-pcard-plate,.r3-pcard-cta svg{transition:none!important}
  .r3-pcard{transform:none!important}
  .r3-pcard-img,.r3-pcard-blur{transform:none!important}
}
`;

/** The grid the cards sit in, with the cards' one stylesheet. Anything else placed in the grid (an open detail row) spans it with `gridColumn: '1 / -1'`. */
export function ProtocolCardGrid({ children, min = 250, style }: { children: ReactNode; min?: number; style?: CSSProperties }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${min}px,1fr))`, gap: 14, ...style }}><style>{PROTOCOL_CARD_CSS}</style>{children}</div>;
}

/** A description cut to a short line at a word boundary. */
export function clipCopy(text: string | null | undefined, max = 110): string | undefined {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, '')}…` : t;
}

export interface ProtocolCardProps {
  title: string;
  /** "Category · 7 days · Published". */
  kicker?: string;
  copy?: string;
  imageUrl?: string | null;
  /** Who made it. */
  by?: string;
  cta?: string;
  /** A link to another page. Without it the card is a button. */
  href?: string;
  onClick?: () => void;
  /** An open card (its detail is showing): colour picture, ink border. */
  pressed?: boolean;
}

export function ProtocolCard({ title, kicker, copy, imageUrl, by, cta = 'View protocol', href, onClick, pressed }: ProtocolCardProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [broken, setBroken] = useState(false);
  const photo = imageUrl && !broken ? imageUrl : null;
  // The lean is written straight to CSS variables: no render per pointer move across a grid of cards.
  const lean = (event: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || event.pointerType !== 'mouse') return;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    el.style.setProperty('--tx', `${(-((event.clientY - b.top) / b.height - 0.5) * 3).toFixed(2)}deg`);
    el.style.setProperty('--ty', `${(((event.clientX - b.left) / b.width - 0.5) * 4).toFixed(2)}deg`);
  };
  const rest = () => { ref.current?.style.removeProperty('--tx'); ref.current?.style.removeProperty('--ty'); };
  const inner = <>
    <div className="r3-pcard-media">
      {photo ? <>
        <img className="r3-pcard-img" src={photo} alt="" loading="lazy" onError={() => setBroken(true)} />
        <img className="r3-pcard-blur top" src={photo} alt="" aria-hidden="true" loading="lazy" />
        <img className="r3-pcard-blur bottom" src={photo} alt="" aria-hidden="true" loading="lazy" />
      </> : <img className="r3-pcard-plate" src={PROTOCOL_PLATE} alt="" loading="lazy" />}
    </div>
    <div className="r3-pcard-body">
      {kicker && <span className="r3-pcard-kicker">{kicker}</span>}
      <h3 className="r3-pcard-title">{title}</h3>
      {copy && <p className="r3-pcard-copy">{copy}</p>}
      <span className="r3-pcard-foot">
        <span className="r3-pcard-by">{by}</span>
        <span className="r3-pcard-cta">{cta}<ArrowRight size={13} aria-hidden="true" /></span>
      </span>
    </div>
  </>;
  const common = { ref: ref as React.Ref<never>, className: 'r3-pcard', 'data-pressed': pressed ? 'true' : undefined, onPointerMove: lean, onPointerLeave: rest } as const;
  return href
    ? <a {...common} href={href}>{inner}</a>
    : <button {...common} type="button" aria-pressed={pressed} onClick={onClick}>{inner}</button>;
}
