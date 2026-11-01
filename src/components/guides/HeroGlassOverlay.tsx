/*
 * Refracted glass and a vignette over a hero's moving background: diagonal glass ribs across the middle of the picture, in the
 * look of the home screen's fluted-glass hero, and a soft darkening towards the edges. The home hero is a WebGL shader that can
 * only wrap a still image, and a YouTube player cannot be a WebGL texture, so this is the same look built from CSS: each rib
 * blurs and brightens what is behind it, has a bright edge with a faint colour fringe, and drifts slowly.
 *
 * Decorative: aria-hidden, no pointer events. Sits between the background media and the hero's own text overlay.
 */
const RIBS: Array<{ left: number; width: number; blur: number; delay: number }> = [
  { left: 22, width: 4, blur: 2, delay: 0 },
  { left: 46, width: 5, blur: 2.5, delay: -7 },
  { left: 70, width: 4, blur: 2, delay: -12 },
];

const CSS = `
.g-glass-rib{position:absolute;top:-25%;height:150%;transform:skewX(-32deg);background:linear-gradient(90deg,rgba(255,255,255,.1) 0%,rgba(255,255,255,0) 40%,rgba(255,255,255,.05) 100%);border-left:1px solid rgba(255,255,255,.34);box-shadow:-1px 0 0 rgba(120,170,255,.28),1px 0 0 rgba(255,110,140,.22),inset 0 0 30px rgba(255,255,255,.03);animation:g-glass-drift 22s ease-in-out infinite alternate}
@keyframes g-glass-drift{from{transform:skewX(-32deg) translateX(-18px)}to{transform:skewX(-32deg) translateX(22px)}}
@media (prefers-reduced-motion:reduce){.g-glass-rib{animation:none}}
`;

export function HeroGlassOverlay() {
  return (
    <div aria-hidden="true" data-hero-glass style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <style>{CSS}</style>
      {RIBS.map((rib) => (
        <span key={rib.left} className="g-glass-rib" data-glass-rib style={{ left: `${rib.left}%`, width: `${rib.width}%`, backdropFilter: `blur(${rib.blur}px)`, WebkitBackdropFilter: `blur(${rib.blur}px)`, animationDelay: `${rib.delay}s` }} />
      ))}
      <span data-hero-vignette style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 50%, rgba(0,0,0,.28) 82%, rgba(0,0,0,.45) 100%)' }} />
    </div>
  );
}

/** Whether a hero shows the glass: switched on by the Guardian, or on by default whenever the background is a video clip. */
export const heroGlassOn = (setting: string | null | undefined, hasClips: boolean): boolean => setting === 'on' || (setting !== 'off' && hasClips);
