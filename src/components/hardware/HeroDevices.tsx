import React, { useEffect, useRef, useState } from 'react';
import { ClipArt, RingArt } from './DeviceArt';
import type { HeroSceneHandle } from './scene/heroScene';

const RING_URL = '/models/r3-ring.stl';
const FADE_MS = 500;

type Phase = 'loading' | 'ready' | 'failed';

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
 * The /ring hero devices. The drawn art paints first; the three.js scene fades in over it once its first frame has
 * rendered, and the drawn layer is removed after the fade. Any failure leaves the drawn art in place.
 */
export function HeroDevices() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [drawnMounted, setDrawnMounted] = useState(true);
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    let cancelled = false;
    let handle: HeroSceneHandle | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = () => { if (!cancelled) setPhase('failed'); };
    if (!webglAvailable()) { fail(); return () => { cancelled = true; }; }
    const onReady = () => {
      if (cancelled) return;
      setPhase('ready');
      if (reduced) setDrawnMounted(false);
      else timer = setTimeout(() => { if (!cancelled) setDrawnMounted(false); }, FADE_MS);
    };
    import('./scene/heroScene')
      .then(m => m.createHeroScene(sceneRef.current as HTMLElement, { ringUrl: RING_URL, reducedMotion: reduced, onReady }))
      .then(h => {
        if (cancelled) { h.dispose(); return; }
        handle = h;
      })
      .catch(fail);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      handle?.dispose();
      handle = null;
    };
  }, [reduced]);

  const ready = phase === 'ready';
  const a11y = ready
    ? { role: 'img' as const, 'aria-label': 'R³ Note and R³ Clip, interactive 3D view; drag to turn' }
    : {};
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }} {...a11y}>
      {drawnMounted && (
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}><RingArt transparent /></div>
          <div style={{ flex: 1, minWidth: 0 }}><ClipArt transparent /></div>
        </div>
      )}
      {phase !== 'failed' && (
        <div
          ref={sceneRef}
          data-testid="hero-scene"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, opacity: ready ? 1 : 0, transition: reduced ? 'none' : `opacity ${FADE_MS}ms ease` }}
        />
      )}
    </div>
  );
}
