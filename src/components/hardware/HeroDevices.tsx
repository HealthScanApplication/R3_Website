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
 * The /ring hero devices. The stage stays empty while the three.js scene loads (no drawn placeholder to flash), then
 * the scene fades in once its first frame has rendered. Only when WebGL is missing or the scene fails does the drawn
 * art appear, so the hero is never left without devices.
 */
export function HeroDevices() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    let cancelled = false;
    let handle: HeroSceneHandle | null = null;
    const fail = () => { if (!cancelled) setPhase('failed'); };
    if (!webglAvailable()) { fail(); return () => { cancelled = true; }; }
    const onReady = () => {
      if (cancelled) return;
      setPhase('ready');
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
      {phase === 'failed' && (
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
