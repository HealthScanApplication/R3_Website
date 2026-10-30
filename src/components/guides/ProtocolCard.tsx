import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Pencil, Trash2 } from 'lucide-react';

/**
 * Protocol card: the Guardian profile card (dark picture on top, small-caps kicker, serif title, a short description,
 * "VIEW →") with two moves on the picture. Resting, it is a tilt-shift photograph in black and white: sharp across the
 * middle, the top and bottom blurred as if the scene were a miniature. On hover, focus, or when the card is open, the
 * colour comes in and the blur eases off, and the card lifts and leans a few degrees toward the pointer.
 * Touch screens cannot hover, so there the picture is in colour from the start.
 * Under the title, small tags say what it is (category) and who it is for (gender, ages); a tag with no data is left out.
 * An offer uses the same card: a price badge and format tags sit on the picture, the author is in the foot, and a card with no
 * photo shows the offer's own art on the plate (see `badge`, `corner`, `plate`, `byAvatar`, `extra`).
 * An owner's card also carries Edit and Delete: two icon buttons that appear on hover or focus (always on touch), beside the card's
 * main link or button, never inside it.
 * Scoped CSS because index.css is prebuilt (no Tailwind JIT); `.r3-pcard*` classes only.
 */
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
/** Shown when a protocol has no picture of its own: the same plate the Guardian card uses. */
export const PROTOCOL_PLATE = '/images/guides/build-plate.png';

const GRADE = 'grayscale(1) contrast(1.05) brightness(.9)';
const COLOUR = 'grayscale(0) saturate(1.22) contrast(1.05) brightness(1)';
export const PROTOCOL_CARD_CSS = `
.r3-pcard{--ease:cubic-bezier(.16,1,.3,1);position:relative;display:flex;flex-direction:column;box-sizing:border-box;width:100%;min-height:390px;font-family:${sans};color:#11120F;background:#FFF;border:1px solid rgba(17,18,15,.18);border-radius:6px;overflow:hidden;transform:perspective(900px) rotateX(var(--tx,0deg)) rotateY(var(--ty,0deg)) translateY(var(--lift,0px));transition:transform 600ms var(--ease),box-shadow 600ms var(--ease),border-color 300ms ease}
.r3-pcard-main{display:flex;flex:1;flex-direction:column;box-sizing:border-box;width:100%;margin:0;padding:0;border:0;background:transparent;font:inherit;color:inherit;text-align:left;text-decoration:none;cursor:pointer}
.r3-pcard:hover,.r3-pcard:focus-within{--lift:-4px;border-color:#667245;box-shadow:0 22px 44px -18px rgba(17,18,15,.4)}
.r3-pcard-main[data-inert]{cursor:default}
.r3-pcard-main:focus-visible{outline:2px solid #9A6A2F;outline-offset:-4px}
@supports selector(:has(a)){.r3-pcard-main:focus-visible{outline:none}.r3-pcard:has(.r3-pcard-main:focus-visible){outline:2px solid #9A6A2F;outline-offset:2px}}
.r3-pcard[data-pressed=true]{border-color:#11120F}
.r3-pcard-actions{position:absolute;top:46px;right:10px;z-index:3;display:flex;gap:6px;opacity:0;pointer-events:none;transform:translateY(-4px);transition:opacity 300ms var(--ease),transform 300ms var(--ease)}
.r3-pcard:hover .r3-pcard-actions,.r3-pcard:focus-within .r3-pcard-actions{opacity:1;pointer-events:auto;transform:none}
.r3-pcard-act{position:relative;display:grid;place-items:center;width:34px;height:34px;margin:0;padding:0;border:1px solid rgba(17,18,15,.55);border-radius:4px;background:rgba(255,255,255,.92);color:#11120F;cursor:pointer;transition:background 200ms ease,color 200ms ease,border-color 200ms ease}
.r3-pcard-act::after{content:"";position:absolute;inset:-5px}
.r3-pcard-act:hover{background:#11120F;border-color:#11120F;color:#FFF}
.r3-pcard-act.danger:hover{background:#B4472F;border-color:#B4472F}
.r3-pcard-act:focus-visible{outline:2px solid #9A6A2F;outline-offset:2px}
.r3-pcard-media{position:relative;height:220px;flex:0 0 auto;background:#171812;overflow:hidden;container-type:inline-size}
.r3-pcard-img,.r3-pcard-blur{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;filter:${GRADE};transform:scale(1.001);transition:filter 800ms var(--ease),transform 1000ms var(--ease)}
.r3-pcard-blur{pointer-events:none;filter:${GRADE} blur(7px);transform:scale(1.07)}
.r3-pcard-blur.top{-webkit-mask-image:linear-gradient(to bottom,#000 0,#000 8%,transparent 36%);mask-image:linear-gradient(to bottom,#000 0,#000 8%,transparent 36%)}
.r3-pcard-blur.bottom{-webkit-mask-image:linear-gradient(to top,#000 0,#000 8%,transparent 36%);mask-image:linear-gradient(to top,#000 0,#000 8%,transparent 36%)}
.r3-pcard-plate,.r3-pcard-plate-slot{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);filter:grayscale(1) brightness(.95);transition:filter 800ms var(--ease)}
.r3-pcard-plate{width:150px;height:150px;object-fit:contain}
.r3-pcard-plate-slot{width:max-content}
.r3-pcard-plate-slot>*{max-width:none}
.r3-pcard-glow{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(70% 80% at 50% 58%,rgba(196,138,60,.62),rgba(102,114,69,.45) 48%,transparent 80%);transition:opacity 800ms var(--ease)}
.r3-pcard:hover .r3-pcard-glow,.r3-pcard:focus-within .r3-pcard-glow,.r3-pcard[data-pressed=true] .r3-pcard-glow{opacity:1}
.r3-pcard-badge{position:absolute;z-index:2;top:12px;left:12px;padding:6px 10px;border-radius:2px;background:#F5F2EA;color:#11120F;font-size:10px;font-weight:700;letter-spacing:.12em;line-height:1;text-transform:uppercase}
.r3-pcard-ownership{position:absolute;z-index:2;top:12px;right:12px;display:flex;align-items:center;gap:6px;max-width:calc(100% - 24px)}
.r3-pcard-ownership>[data-card-owner],.r3-pcard-ownership>[data-card-visibility]{box-sizing:border-box;padding:5px 8px;border:1px solid rgba(245,242,234,.82);border-radius:2px;background:rgba(17,18,15,.88);color:#F5F2EA;font-family:${sans};font-size:9px;font-weight:800;line-height:1;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}
.r3-pcard-corner{position:absolute;z-index:2;left:12px;bottom:12px;display:flex;align-items:center;gap:6px;max-width:calc(100% - 24px)}
.r3-pcard-corner>*{max-width:100%;box-sizing:border-box}
.r3-pcard:hover .r3-pcard-img,.r3-pcard:focus-within .r3-pcard-img,.r3-pcard[data-pressed=true] .r3-pcard-img{filter:${COLOUR};transform:scale(1.035)}
.r3-pcard:hover .r3-pcard-blur,.r3-pcard:focus-within .r3-pcard-blur,.r3-pcard[data-pressed=true] .r3-pcard-blur{filter:${COLOUR} blur(3.5px);transform:scale(1.09)}
.r3-pcard:hover .r3-pcard-plate,.r3-pcard:focus-within .r3-pcard-plate,.r3-pcard[data-pressed=true] .r3-pcard-plate,.r3-pcard:hover .r3-pcard-plate-slot,.r3-pcard:focus-within .r3-pcard-plate-slot,.r3-pcard[data-pressed=true] .r3-pcard-plate-slot{filter:grayscale(0) brightness(1.05)}
.r3-pcard-body{display:flex;flex:1;flex-direction:column;padding:20px}
.r3-pcard-footer-corner{position:absolute;right:12px;bottom:12px;z-index:2;display:grid;place-items:center;filter:none!important}
.r3-pcard-kicker{color:#667245;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.r3-pcard-title{font-family:${serif};font-size:28px;font-weight:300;line-height:1.14;margin:10px 0 8px;padding:.05em 0 .06em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.r3-pcard-tags{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;padding:0;list-style:none}
.r3-pcard-tag{margin:0;padding:5px 8px;border:1px solid rgba(17,18,15,.24);border-radius:2px;color:#4A4944;font-size:10px;font-weight:600;letter-spacing:.08em;line-height:1;text-transform:uppercase;white-space:nowrap;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.r3-pcard-tag[data-kind=category]{border-color:rgba(102,114,69,.55);background:rgba(102,114,69,.1);color:#4C5732}
.r3-pcard-copy{color:#66645F;font-size:13px;line-height:1.5;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.r3-pcard-extra{margin-top:10px}
.r3-pcard-foot{margin-top:auto;padding-top:20px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 12px}
.r3-pcard-by{display:flex;flex:1 1 100px;align-items:center;gap:8px;min-width:0;color:#66645F;font-size:11px}
.r3-pcard-by-name{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.r3-pcard-cta{display:inline-flex;flex:0 0 auto;margin-left:auto;align-items:center;gap:8px;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#11120F}
.r3-pcard-cta svg{transition:transform 400ms var(--ease)}
.r3-pcard:hover .r3-pcard-cta svg,.r3-pcard:focus-within .r3-pcard-cta svg{transform:translateX(4px)}
@container (max-width:330px){.r3-pcard-corner{max-width:calc(100% - 24px);transform:scale(.9);transform-origin:left bottom}.r3-pcard-ownership{gap:4px}.r3-pcard-ownership>[data-card-owner],.r3-pcard-ownership>[data-card-visibility]{padding:4px 6px}}
@media (hover:none),(pointer:coarse){
  .r3-pcard-actions{opacity:1;pointer-events:auto;transform:none}
  .r3-pcard-img{filter:${COLOUR}}
  .r3-pcard-blur{filter:${COLOUR} blur(3.5px)}
  .r3-pcard-plate,.r3-pcard-plate-slot{filter:none}
  .r3-pcard-glow{opacity:1}
}
@media (prefers-reduced-motion:reduce){
  .r3-pcard,.r3-pcard-img,.r3-pcard-blur,.r3-pcard-plate,.r3-pcard-plate-slot,.r3-pcard-glow,.r3-pcard-cta svg,.r3-pcard-actions,.r3-pcard-act{transition:none!important}
  .r3-pcard{transform:none!important}
  .r3-pcard-img,.r3-pcard-blur{transform:none!important}
}
`;

// Offer cards sit in grids of their own, so the stylesheet is also put in the page head once (updated in place when this module reloads).
if (typeof document !== 'undefined') {
  const id = 'r3-pcard-css';
  const el = document.getElementById(id) || Object.assign(document.createElement('style'), { id });
  el.textContent = PROTOCOL_CARD_CSS;
  if (!el.parentNode) document.head.appendChild(el);
}

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
  /** "7 days · Published". */
  kicker?: string;
  /** Category, gender and age tags under the title. */
  tags?: Array<{ label: string; kind?: 'category' | 'gender' | 'age' | 'audience' }>;
  copy?: string;
  imageUrl?: string | null;
  /** Who made it. */
  by?: string;
  /** An avatar before the maker's name. */
  byAvatar?: ReactNode;
  /** On the picture, top left: a price. */
  badge?: ReactNode;
  /** On the picture, top right: format tags. Each child sits on a light chip. */
  corner?: ReactNode;
  /** Ownership and visibility shown together at the top right. `Yours` is rendered only when owned is true. */
  owned?: boolean;
  visibility?: 'public' | 'private';
  /** Shown on the plate when there is no photo, in place of the default plate picture. */
  plate?: ReactNode;
  /** Under the description (a star rating). */
  extra?: ReactNode;
  /** A compact asset in the white card's lower-right corner, such as the routine QR. */
  footerCorner?: ReactNode;
  cta?: string;
  /** A link to another page. Without it the card is a button. */
  href?: string;
  /** A card that goes nowhere (a preview): drawn the same, but neither a link nor a button. */
  inert?: boolean;
  onClick?: () => void;
  /** An open card (its detail is showing): colour picture, ink border. */
  pressed?: boolean;
  /** Edit and Delete for the owner: icon buttons beside the card's main control. Omit for cards the viewer does not own. */
  onEdit?: () => void;
  onDelete?: () => void;
}

export function CardOwnershipTags({ owned = false, visibility }: { owned?: boolean; visibility?: 'public' | 'private' }) {
  if (!visibility && !owned) return null;
  return <>
    {owned && <span data-card-owner="yours">Yours</span>}
    {visibility && <span data-card-visibility={visibility}>{visibility === 'public' ? 'Public' : 'Private'}</span>}
  </>;
}

export function ProtocolCard({ title, kicker, tags, copy, imageUrl, by, byAvatar, badge, corner, owned = false, visibility, plate, extra, footerCorner, cta = 'View protocol', href, onClick, pressed, inert, onEdit, onDelete }: ProtocolCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // The picture that failed, not a flag: a card that later gets a different picture tries it.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo = imageUrl && imageUrl !== failedUrl ? imageUrl : null;
  // The lean is written straight to CSS variables: no render per pointer move across a grid of cards.
  const lean = (event: React.PointerEvent<HTMLDivElement>) => {
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
        <img className="r3-pcard-img" src={photo} alt="" loading="lazy" onError={() => setFailedUrl(photo)} />
        <img className="r3-pcard-blur top" src={photo} alt="" aria-hidden="true" loading="lazy" />
        <img className="r3-pcard-blur bottom" src={photo} alt="" aria-hidden="true" loading="lazy" />
      </> : <>
        <span className="r3-pcard-glow" aria-hidden="true" />
        {plate ? <span className="r3-pcard-plate-slot" aria-hidden="true">{plate}</span> : <img className="r3-pcard-plate" src={PROTOCOL_PLATE} alt="" loading="lazy" />}
      </>}
      {badge && <span className="r3-pcard-badge">{badge}</span>}
      {(visibility || owned) && <div className="r3-pcard-ownership"><CardOwnershipTags owned={owned} visibility={visibility} /></div>}
      {corner && <div className="r3-pcard-corner">{corner}</div>}
      {footerCorner && <span className="r3-pcard-footer-corner">{footerCorner}</span>}
    </div>
    <div className="r3-pcard-body">
      {kicker && <span className="r3-pcard-kicker">{kicker}</span>}
      <h3 className="r3-pcard-title">{title}</h3>
      {tags && tags.length > 0 && <ul className="r3-pcard-tags">{tags.map((tag) => <li key={`${tag.kind || 'tag'}:${tag.label}`} className="r3-pcard-tag" data-kind={tag.kind} title={tag.label}>{tag.label}</li>)}</ul>}
      {copy && <p className="r3-pcard-copy">{copy}</p>}
      {extra && <div className="r3-pcard-extra">{extra}</div>}
      <span className="r3-pcard-foot">
        {(by || byAvatar) && <span className="r3-pcard-by">{byAvatar}{by && <span className="r3-pcard-by-name">{by}</span>}</span>}
        <span className="r3-pcard-cta">{cta}<ArrowRight size={13} aria-hidden="true" /></span>
      </span>
    </div>
  </>;
  const main = inert
    ? <div className="r3-pcard-main" data-inert="true">{inner}</div>
    : href
    ? <a className="r3-pcard-main" href={href} onClick={onClick ? (event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return; event.preventDefault(); onClick(); } : undefined}>{inner}</a>
    : <button className="r3-pcard-main" type="button" aria-pressed={pressed} onClick={onClick}>{inner}</button>;
  return <div ref={ref} className="r3-pcard" data-pressed={pressed ? 'true' : undefined} onPointerMove={lean} onPointerLeave={rest}>
    {main}
    {(onEdit || onDelete) && <div className="r3-pcard-actions">
      {onEdit && <button type="button" className="r3-pcard-act" aria-label={`Edit ${title}`} title="Edit" onClick={onEdit}><Pencil size={15} aria-hidden="true" /></button>}
      {onDelete && <button type="button" className="r3-pcard-act danger" aria-label={`Delete ${title}`} title="Delete" onClick={onDelete}><Trash2 size={15} aria-hidden="true" /></button>}
    </div>}
  </div>;
}
