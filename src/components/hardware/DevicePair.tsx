import React, { useEffect, useRef, useState } from 'react';
import { DISPLAY, GRO, ed } from '../../config/editorialTheme';
import { RingArt, ClipArt } from './DeviceArt';
import { DEFAULT_FINISH, FINISHES, FINISH_SPECS, type Finish } from './scene/finishes';
import type { Device, DeviceSceneHandle } from './scene/deviceScene';
import { DEVICE_IOV, IOV_LABELS } from './copy';

const label = { margin: '0 0 10px', fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#C7D99F' } as const;
const body = { margin: 0, maxWidth: 560, fontFamily: GRO, fontSize: 17, lineHeight: 1.55, color: ed.onDarkSoft } as const;
const name = { margin: '0 0 14px', fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 3.6vw, 4rem)', fontWeight: 400, lineHeight: 0.95 } as const;
const art = { position: 'relative', overflow: 'hidden', aspectRatio: '1.23 / 1' } as const;
// The drawn art's own backdrops, kept on the media box so the live scene (transparent canvas) sits on the same ground.
const BACKDROP: Record<Device, string> = {
  ring: 'radial-gradient(circle at 48% 42%, #2a2d29 0%, #10110f 72%)',
  watch: 'radial-gradient(circle at 50% 40%, #17332c 0%, #09120f 76%)',
};
const FADE_MS = 500;
const ROOT_MARGIN = '200px';

type Phase = 'idle' | 'loading' | 'ready' | 'failed';

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
 * A card's media: the backdrop alone while loading (no drawing, no spinner, so nothing flashes and is replaced).
 * Once the card nears the viewport the three.js scene is imported and fades in when its first frame has rendered.
 * The drawn art appears only as the fallback: no WebGL, no IntersectionObserver, or any scene error.
 */
function DeviceMedia({ device, finish, title }: { device: Device; finish: Finish; title: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<DeviceSceneHandle | null>(null);
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const [near, setNear] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [reduced] = useState(prefersReducedMotion);

  // Wait until the card is within ROOT_MARGIN of the viewport. Without IntersectionObserver, show the drawing.
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
    const fail = () => { if (!cancelled) setPhase('failed'); };
    if (!webglAvailable()) { fail(); return () => { cancelled = true; }; }
    setPhase('loading');
    const onReady = () => {
      if (cancelled) return;
      setPhase('ready');
    };
    import('./scene/deviceScene')
      .then(m => m.createDeviceScene(sceneRef.current as HTMLElement, { device, finish: finishRef.current, reducedMotion: reduced, onReady }))
      .then(h => {
        if (cancelled) { h.dispose(); return; }
        handleRef.current = h;
        h.setFinish(finishRef.current); // a pick made while it loaded
      })
      .catch(fail);
    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [near, device, reduced]);

  useEffect(() => { handleRef.current?.setFinish(finish); }, [finish]);

  const ready = phase === 'ready';
  const a11y = ready ? { role: 'img' as const, 'aria-label': `${title} in ${FINISH_SPECS[finish].label}, interactive 3D view; drag to turn` } : {};
  return (
    <div ref={boxRef} style={{ ...art, background: BACKDROP[device] }} {...a11y}>
      {phase === 'failed' && (device === 'ring' ? <RingArt transparent /> : <ClipArt transparent />)}
      {near && phase !== 'failed' && (
        <div
          ref={sceneRef}
          data-testid={`device-scene-${device}`}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, opacity: ready ? 1 : 0, transition: reduced ? 'none' : `opacity ${FADE_MS}ms ease` }}
        />
      )}
    </div>
  );
}

/** Three round swatches as a radio group (arrow keys move and select, as native radios do). */
function FinishPicker({ title, value, onChange }: { title: string; value: Finish; onChange: (f: Finish) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const j = (i + step + FINISHES.length) % FINISHES.length;
    onChange(FINISHES[j]);
    refs.current[j]?.focus();
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '16px 0 28px' }}>
      <div role="radiogroup" aria-label={`${title} finish`} style={{ display: 'flex', gap: 10 }}>
        {FINISHES.map((f, i) => {
          const checked = f === value;
          return (
            <button
              key={f}
              ref={el => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={FINISH_SPECS[f].label}
              tabIndex={checked ? 0 : -1}
              className="r3-hw-swatch"
              onClick={() => onChange(f)}
              onKeyDown={e => onKey(e, i)}
              style={{
                width: 22, height: 22, padding: 0, borderRadius: '50%', cursor: 'pointer',
                background: FINISH_SPECS[f].swatch,
                border: `1px solid ${ed.onDarkHair}`,
                boxShadow: checked ? `0 0 0 2px #0b0c0b, 0 0 0 3px ${ed.onDark}` : 'none',
              }}
            />
          );
        })}
      </div>
      <span aria-hidden="true" style={{ ...label, margin: 0, color: ed.onDarkSoft }}>{FINISH_SPECS[value].label}</span>
    </div>
  );
}

function DeviceCard({ device, title, eyebrow, copy }: { device: Device; title: string; eyebrow: string; copy: string }) {
  const [finish, setFinish] = useState<Finish>(DEFAULT_FINISH);
  return (
    <article>
      <DeviceMedia device={device} finish={finish} title={title} />
      <FinishPicker title={title} value={finish} onChange={setFinish} />
      <p style={label}>{eyebrow}</p>
      <h3 style={name}>{title}</h3>
      <p style={body}>{copy}</p>
      <dl style={{ margin: '28px 0 0', maxWidth: 560 }}>
        {IOV_LABELS.map(([key, term]) => (
          <div key={key} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 16, padding: '12px 0', borderTop: `1px solid ${ed.onDarkHair}` }}>
            <dt style={{ ...label, margin: 0, lineHeight: 1.9 }}>{term}</dt>
            <dd style={{ margin: 0, fontFamily: GRO, fontSize: 15, lineHeight: 1.55, color: ed.onDarkSoft }}>{DEVICE_IOV[device][key]}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function DevicePair() {
  return (
    <section aria-labelledby="two-devices-title" style={{ borderBottom: `1px solid ${ed.onDarkHair}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(56px, 8vw, 120px) clamp(20px, 5vw, 72px)' }}>
        <h2 id="two-devices-title" style={{ margin: '0 0 40px', fontFamily: DISPLAY, fontSize: 'clamp(2.2rem, 4.4vw, 4.4rem)', fontWeight: 380, lineHeight: 1, letterSpacing: '-0.03em' }}>Two devices, one routine</h2>
        <div className="r3-hw-pair" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'clamp(24px, 4vw, 56px)' }}>
          <DeviceCard
            device="ring"
            title="R³ Ring"
            eyebrow="Controller"
            copy="A controller worn on the finger. Its touch and slide surface controls the clip. Final ring specifications are not published yet."
          />
          <DeviceCard
            device="watch"
            title="R³ Clip"
            eyebrow="Camera pod"
            copy="A camera pod you can wear as a necklace, a watch, or a clip. It captures your food, activity, voice notes, and AI requests."
          />
        </div>
      </div>
      <style>{`
        .r3-hw-pair svg { width: 100%; height: 100%; display: block; }
        .r3-hw-swatch:focus { outline: none; }
        .r3-hw-swatch:focus-visible { outline: 2px solid #C7D99F; outline-offset: 4px; }
        @media (max-width: 800px) { .r3-hw-pair { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}
