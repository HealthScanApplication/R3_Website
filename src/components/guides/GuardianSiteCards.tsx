import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, MoreHorizontal } from 'lucide-react';
import type { SitePublishAction, SiteStatus } from '../../utils/guardianSiteStatus';

// Same dark dashboard palette as GuidePortal (sibling files keep their own copy to avoid an import cycle).
const INK = '#F5F2EA', MUTED = '#B8B6AF', LINE = 'rgba(245,242,234,0.24)', PANEL = '#11120F', ACID = '#C7D8A3', BLACK = '#090A08', DRAFT = '#D49A74';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const toneColor = (tone: SiteStatus['tone']) => tone === 'live' ? ACID : tone === 'draft' ? DRAFT : tone === 'review' ? '#C88A66' : MUTED;

/** The Draft / In review / Published tag, the same on the cards and in the site build. */
export function SiteStatusTag({ status }: { status: SiteStatus }) {
  const color = toneColor(status.tone);
  return <span data-site-status={status.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: `1px solid ${color}`, color, fontFamily: sans, fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', lineHeight: 1.2 }}>
    <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />{status.label}
  </span>;
}

/**
 * Status and the publish action at the top of a site in the site build. The button is a submit button: it lives inside
 * the setup form, so it runs the same publish path as the Publishing panel at the bottom.
 */
export function SitePublishBar({ site, status, action, busy, error, liveHref }: {
  site: string;
  status: SiteStatus;
  action: SitePublishAction;
  busy: boolean;
  error?: string;
  liveHref?: string;
}) {
  return <div role="group" aria-label={`${site} publishing`} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: `1px solid ${status.live ? ACID : LINE}`, background: PANEL, padding: '10px 12px', margin: '0 0 14px' }}>
    <SiteStatusTag status={status} />
    <span style={{ flex: '1 1 220px', minWidth: 0, color: MUTED, fontFamily: sans, fontSize: 11, lineHeight: 1.5 }}>{action.hint}</span>
    {status.live && liveHref && <a href={liveHref} target="_blank" rel="noopener noreferrer" aria-label={`View ${site} live`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, color: INK, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', textDecoration: 'none', borderBottom: `1px solid ${LINE}` }}>View live <ExternalLink size={12} aria-hidden="true" /></a>}
    <button type="submit" disabled={busy} style={{ minHeight: 36, padding: '0 14px', border: `1px solid ${LINE}`, borderRadius: 4, background: INK, color: BLACK, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{busy ? `${action.busyLabel}…` : action.label} <ArrowRight size={13} aria-hidden="true" /></button>
    {error && <p role="alert" style={{ flex: '1 0 100%', margin: 0, color: '#F0A7A7', fontFamily: sans, fontSize: 12 }}>{error}</p>}
  </div>;
}

export type SiteCardData = {
  key: string;
  /** Small caps label above the title: Profile site or Offer funnel. */
  type: string;
  title: string;
  path: string;
  status: SiteStatus;
  /** Large serif line over the hero: the Guardian's headline, or the offer title. */
  heroLine: string;
  /** Small caps line over the hero, above heroLine (the Guardian's name on the profile site). */
  heroKicker?: string;
  avatarUrl?: string | null;
  /** The Guardian's background. Only drawn when it is an image that loads; otherwise the hero is a dark panel. */
  backgroundUrl?: string;
  backgroundIsVideo?: boolean;
  greyscale?: boolean;
  previewId: string;
  /** The public page. When the site is live this is drawn as a scaled, non-interactive preview of the real page. */
  previewHref?: string;
};

const PREVIEW_WIDTH = 1280;

/** A live, non-interactive preview of a page: the real page at desktop width, scaled down to fit the card. */
function ScaledPreview({ href, title }: { href: string; title: string }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.25);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.max(0.1, el.clientWidth / PREVIEW_WIDTH));
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div ref={box} data-site-preview style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#F2EFE7' }}>
    <iframe src={href} title={`${title} website preview`} loading="lazy" tabIndex={-1} aria-hidden="true" style={{ width: PREVIEW_WIDTH, height: Math.ceil(PREVIEW_WIDTH * 1.25), border: 0, pointerEvents: 'none', transformOrigin: '0 0', transform: `scale(${scale})`, background: '#F2EFE7' }} />
  </div>;
}

function SiteHero({ site }: { site: SiteCardData }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => setImageFailed(false), [site.backgroundUrl]);
  useEffect(() => setAvatarFailed(false), [site.avatarUrl]);
  const showPreview = !!site.previewHref && site.status.live;
  const showImage = !showPreview && !!site.backgroundUrl && !site.backgroundIsVideo && !imageFailed;
  const showAvatar = !!site.avatarUrl && !avatarFailed;
  return <div data-site-hero style={{ position: 'relative', aspectRatio: '4 / 5', overflow: 'hidden', background: '#0D0E0B', borderBottom: `1px solid ${LINE}` }}>
    {showPreview && <ScaledPreview href={site.previewHref!} title={site.title} />}
    {showImage && <img src={site.backgroundUrl} alt="" onError={() => setImageFailed(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: site.greyscale ? 'grayscale(1)' : undefined }} />}
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(9,10,8,.12) 0%,rgba(9,10,8,.55) 55%,rgba(9,10,8,.9) 100%)' }} />
    <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, display: 'flex', alignItems: 'flex-end', gap: 10, minWidth: 0 }}>
      {showAvatar && <img src={site.avatarUrl!} alt="" onError={() => setAvatarFailed(true)} style={{ flex: '0 0 auto', width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(245,242,234,.5)' }} />}
      <span style={{ minWidth: 0 }}>
        {site.heroKicker && <span style={{ display: 'block', color: ACID, fontFamily: sans, fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.heroKicker}</span>}
        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: INK, fontFamily: serif, fontSize: 'clamp(17px,2.2vw,22px)', fontWeight: 300, lineHeight: 1.12 }}>{site.heroLine}</span>
      </span>
    </div>
  </div>;
}

const CARD_CSS = `
.g-sitecards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr));gap:18px}
.g-sitecard{position:relative;min-width:0;border:1px solid ${LINE};background:${PANEL};transition:border-color 160ms ease,transform 160ms ease}
.g-sitecard:hover{border-color:${ACID}}
.g-sitecard:focus-within{border-color:${ACID}}
.g-sitecard-open{position:absolute;inset:0;z-index:1;width:100%;border:0;background:transparent;cursor:pointer;padding:0}
.g-sitecard-open:focus-visible{outline:2px solid ${ACID};outline-offset:-2px}
.g-sitecard-menu-btn:focus-visible,.g-sitecard-menu [role=menuitem]:focus-visible{outline:2px solid ${ACID};outline-offset:-2px}
@media (prefers-reduced-motion:reduce){.g-sitecard{transition:none}}
`;

const menuItem: React.CSSProperties = { display: 'block', boxSizing: 'border-box', width: '100%', border: 0, background: 'transparent', color: INK, padding: '10px 12px', textAlign: 'left', fontFamily: sans, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' };

/**
 * The All sites inventory: one tall (4:5) hero card per site, with a live preview of the page once it is published, in the card language of the public Guardians page.
 * The whole card opens the site in the builder; the three dots menu holds Edit, the preview and View live.
 */
export function SiteCardGrid({ sites, openMenu, onOpenMenu, onEdit, onPreview, minCardWidth = 280 }: {
  sites: SiteCardData[];
  /** Narrowest a card may get before the grid drops a column. 440 holds two to a row in a 1100px column. */
  minCardWidth?: number;
  openMenu: string | null;
  onOpenMenu: (key: string | null) => void;
  onEdit: (site: SiteCardData) => void;
  onPreview: (site: SiteCardData) => void;
}) {
  return <div className="g-sitecards" style={{ gridTemplateColumns: `repeat(auto-fill,minmax(min(${minCardWidth}px,100%),1fr))` }}>
    <style>{CARD_CSS}</style>
    {sites.map((site) => {
      const open = openMenu === site.key;
      return <article key={site.key} className="g-sitecard" data-site-card={site.key} aria-label={`${site.type}: ${site.title}`}>
        <button type="button" className="g-sitecard-open" aria-label={`Edit ${site.title}`} onClick={() => onEdit(site)} />
        <SiteHero site={site} />
        <div style={{ padding: '14px 16px 16px', display: 'grid', gap: 7 }}>
          <span style={{ color: ACID, fontFamily: sans, fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{site.type}</span>
          <strong style={{ color: INK, fontFamily: serif, fontSize: 24, fontWeight: 300, lineHeight: 1.1, overflowWrap: 'anywhere' }}>{site.title}</strong>
          <code style={{ color: MUTED, fontFamily: mono, fontSize: 10, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{site.path}</code>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
            <SiteStatusTag status={site.status} />
            <span style={{ position: 'relative', zIndex: 2 }}>
              <button type="button" className="g-sitecard-menu-btn" aria-label={`Actions for ${site.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => onOpenMenu(open ? null : site.key)} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); onOpenMenu(null); } }} style={{ width: 38, height: 38, border: `1px solid ${LINE}`, background: 'transparent', color: INK, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><MoreHorizontal size={19} aria-hidden="true" /></button>
              {open && <div role="menu" aria-label={`${site.title} actions`} className="g-sitecard-menu" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onOpenMenu(null); } }} style={{ position: 'absolute', zIndex: 8, right: 0, bottom: 44, width: 168, border: `1px solid ${LINE}`, background: BLACK, boxShadow: '0 14px 28px rgba(0,0,0,.42)', padding: 4 }}>
                <button type="button" role="menuitem" onClick={() => onEdit(site)} style={menuItem}>Edit</button>
                <button type="button" role="menuitem" onClick={() => onPreview(site)} style={{ ...menuItem, borderTop: `1px solid ${LINE}` }}>Preview and test</button>
                {site.status.live && <a role="menuitem" href={site.path} target="_blank" rel="noopener noreferrer" onClick={() => onOpenMenu(null)} style={{ ...menuItem, borderTop: `1px solid ${LINE}` }}>View live</a>}
              </div>}
            </span>
          </div>
        </div>
      </article>;
    })}
  </div>;
}
