import { useEffect, useRef, useState } from 'react';

const MODEL_SRC = '/models/r3-ring.glb';
const POSTER_SRC = '/models/r3-ring-poster.webp';

const FILL_STYLE = { width: '100%', height: '100%', minHeight: 360 } as const;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function RingFallback() {
  return (
    <div style={{ ...FILL_STYLE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg
        viewBox="0 0 400 400"
        role="img"
        aria-label="R³ Ring"
        style={{ width: '100%', height: '100%', maxHeight: 480 }}
      >
        <defs>
          <linearGradient id="ring-viewer-shell" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#474a45" />
            <stop offset="0.42" stopColor="#121311" />
            <stop offset="0.75" stopColor="#343632" />
            <stop offset="1" stopColor="#090a09" />
          </linearGradient>
        </defs>
        <ellipse cx="200" cy="344" rx="120" ry="20" fill="#000" opacity=".3" />
        <g transform="translate(200 188) rotate(-13)">
          <ellipse rx="122" ry="140" fill="url(#ring-viewer-shell)" />
          <ellipse rx="72" ry="90" fill="#0d0e0d" stroke="#555852" strokeWidth="4" />
          <circle cx="60" cy="-26" r="8" fill="#C7D99F" />
        </g>
      </svg>
    </div>
  );
}

export function RingViewer() {
  const [failed, setFailed] = useState(
    () => typeof window === 'undefined' || !window.customElements,
  );
  const [reduceMotion] = useState(prefersReducedMotion);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!window.customElements) return;
    let active = true;
    import('./registerModelViewer').catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (failed || !el) return;
    const onError = () => setFailed(true);
    el.addEventListener('error', onError);
    return () => el.removeEventListener('error', onError);
  }, [failed]);

  if (failed) return <RingFallback />;

  return (
    <model-viewer
      ref={ref}
      src={MODEL_SRC}
      poster={POSTER_SRC}
      alt="R³ Ring — drag to rotate"
      camera-controls=""
      shadow-intensity="1"
      {...(reduceMotion ? {} : { 'auto-rotate': '' })}
      style={{ ...FILL_STYLE, background: 'transparent', display: 'block' }}
    />
  );
}
