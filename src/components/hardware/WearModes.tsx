import React, { useEffect, useRef, useState } from 'react';
import { DISPLAY, GRO, ed } from '../../config/editorialTheme';
import { ClipArt } from './DeviceArt';
import { WEAR_MODES, WEAR_MODES_INTRO, WEAR_MODES_TITLE, type WearMode } from './copy';
import type { WearSceneHandle } from './scene/wearScene';

const smallCaps = { margin: '22px 0 10px', fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#C7D99F' } as const;
const line = { margin: 0, maxWidth: 420, fontFamily: GRO, fontSize: 16, lineHeight: 1.55, color: ed.onDarkSoft } as const;
// The same dark ground as DevicePair's watch card, so the live scene (transparent canvas) sits on it.
const stage = { position: 'relative', overflow: 'hidden', aspectRatio: '1 / 1', background: 'radial-gradient(circle at 50% 40%, #17332c 0%, #09120f 76%)' } as const;
const FADE_MS = 500;
const ROOT_MARGIN = '200px';
const ALT: Record<WearMode['id'], string> = {
  watch: 'The R³ Clip worn as a watch on its steel link bracelet, 3D view',
  clip: "The R³ Clip clipped under a cap's bill on its hinge, 3D view",
  necklace: 'The R³ Clip hanging from a chain as a diamond, 3D view',
};

type Phase = 'idle' | 'loading' | 'ready' | 'failed';

// One import of the three.js scene module, shared by the three cards (a failed import is forgotten so a retry can load).
let sceneModule: Promise<typeof import('./scene/wearScene')> | null = null;
const loadSceneModule = () => {
  if (!sceneModule) sceneModule = import('./scene/wearScene').catch(err => { sceneModule = null; throw err; });
  return sceneModule;
};

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

/**
 * A card's square stage: the dark ground alone while loading (nothing drawn first, so nothing flashes and is replaced).
 * Near the viewport the three.js scene is imported and fades in once its first frame renders. The drawn clip appears
 * only as the fallback: no WebGL, no IntersectionObserver, or any scene error.
 */
function WearStage({ mode }: { mode: WearMode['id'] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setPhase('failed'); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setNear(true); io.disconnect(); }
    }, { rootMargin: ROOT_MARGIN });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let handle: WearSceneHandle | null = null;
    const fail = () => { if (!cancelled) setPhase('failed'); };
    if (!webglAvailable()) { fail(); return () => { cancelled = true; }; }
    setPhase('loading');
    const onReady = () => { if (!cancelled) setPhase('ready'); };
    loadSceneModule()
      .then(m => m.createWearScene(sceneRef.current as HTMLElement, { mode, reducedMotion: reduced, onReady }))
      .then(h => { if (cancelled) h.dispose(); else handle = h; })
      .catch(fail);
    return () => {
      cancelled = true;
      handle?.dispose();
      handle = null;
    };
  }, [near, mode, reduced]);

  const ready = phase === 'ready';
  const a11y = ready ? { role: 'img' as const, 'aria-label': ALT[mode] } : {};
  return (
    <div ref={boxRef} className="r3-wear-stage" data-testid={`wear-stage-${mode}`} style={stage} {...a11y}>
      {phase === 'failed' && <div data-testid={`wear-fallback-${mode}`} style={{ position: 'absolute', inset: 0 }}><ClipArt transparent /></div>}
      {near && phase !== 'failed' && (
        <div
          ref={sceneRef}
          data-testid={`wear-scene-${mode}`}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, opacity: ready ? 1 : 0, transition: reduced ? 'none' : `opacity ${FADE_MS}ms ease` }}
        />
      )}
    </div>
  );
}

export function WearModes() {
  return (
    <section aria-labelledby="wear-modes-title" style={{ borderBottom: `1px solid ${ed.onDarkHair}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(56px, 8vw, 120px) clamp(20px, 5vw, 72px)' }}>
        <h2 id="wear-modes-title" style={{ margin: '0 0 18px', fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 4.4vw, 4.4rem)', fontWeight: 380, lineHeight: 1, letterSpacing: '-0.03em' }}>{WEAR_MODES_TITLE}</h2>
        <p style={{ ...line, margin: '0 0 40px', maxWidth: 620, fontSize: 17 }}>{WEAR_MODES_INTRO}</p>
        <div className="r3-wear-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'clamp(24px, 3vw, 40px)' }}>
          {WEAR_MODES.map(m => (
            <article key={m.id} data-wear={m.id}>
              <WearStage mode={m.id} />
              <h3 style={smallCaps}>{m.name}</h3>
              <p style={line}>{m.line}</p>
            </article>
          ))}
        </div>
      </div>
      <style>{`
        .r3-wear-stage svg { width: 100%; height: 100%; display: block; }
        @media (min-width: 900px) { .r3-wear-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; } }
      `}</style>
    </section>
  );
}
