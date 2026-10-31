/*
 * Refracted glass and a vignette over a hero's moving background: diagonal glass ribs across the middle of the picture, in the
 * look of the home screen's fluted-glass hero, and a soft darkening towards the edges. The home hero is a WebGL shader that can
 * only wrap a still image, and a YouTube player cannot be a WebGL texture, so this is the same look built from CSS: each rib
 * blurs and brightens what is behind it, has a bright edge with a faint colour fringe, and drifts slowly.
 *
 * Decorative: aria-hidden, no pointer events. Sits between the background media and the hero's own text overlay.
 */
const RIBS: Array<{ left: number; width: number; blur: number; delay: number }> = [
  { left: 14, width: 7, blur: 7, delay: 0 },
  { left: 26, width: 10, blur: 4, delay: -4 },
  { left: 41, width: 6, blur: 9, delay: -9 },
  { left: 52, width: 11, blur: 5, delay: -2 },
  { left: 68, width: 8, blur: 8, delay: -7 },
  { left: 80, width: 9, blur: 4, delay: -11 },
];

const CSS = `
.g-glass-rib{position:absolute;top:-25%;height:150%;transform:skewX(-32deg);background:linear-gradient(90deg,rgba(255,255,255,.2) 0%,rgba(255,255,255,.03) 38%,rgba(255,255,255,.12) 100%);border-left:1px solid rgba(255,255,255,.34);box-shadow:-1px 0 0 rgba(120,170,255,.28),1px 0 0 rgba(255,110,140,.22),inset 0 0 46px rgba(255,255,255,.07);animation:g-glass-drift 22s ease-in-out infinite alternate}
@keyframes g-glass-drift{from{transform:skewX(-32deg) translateX(-18px)}to{transform:skewX(-32deg) translateX(22px)}}
@media (prefers-reduced-motion:reduce){.g-glass-rib{animation:none}}
`;

export function HeroGlassOverlay() {
  return (
    <div aria-hidden="true" data-hero-glass style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <style>{CSS}</style>
      {RIBS.map((rib) => (
        <span key={rib.left} className="g-glass-rib" data-glass-rib style={{ left: `${rib.left}%`, width: `${rib.width}%`, backdropFilter: `blur(${rib.blur}px) saturate(1.25) brightness(1.05)`, WebkitBackdropFilter: `blur(${rib.blur}px) saturate(1.25) brightness(1.05)`, animationDelay: `${rib.delay}s` }} />
      ))}
      <span data-hero-vignette style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 42%, rgba(0,0,0,.42) 78%, rgba(0,0,0,.66) 100%)' }} />
    </div>
  );
}

/** Whether a hero shows the glass: switched on by the Guardian, or on by default whenever the background is a video clip. */
export const heroGlassOn = (setting: string | null | undefined, hasClips: boolean): boolean => setting === 'on' || (setting !== 'off' && hasClips);
