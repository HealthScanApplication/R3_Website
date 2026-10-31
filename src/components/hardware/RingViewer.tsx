import { useEffect, useId, useRef, useState } from 'react';

const MODEL_SRC = '/models/r3-ring.glb';
const POSTER_SRC = '/models/r3-ring-poster.webp';

const FILL_STYLE = { width: '100%', height: '100%', minHeight: 360 } as const;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function RingFallback() {
  const gradientId = `ring-viewer-shell-${useId().replace(/:/g, '')}`;
  return (
    <div style={{ ...FILL_STYLE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg
        viewBox="0 0 400 400"
        role="img"
        aria-label="R³ Note"
        style={{ width: '100%', height: '100%', maxHeight: 480 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#474a45" />
            <stop offset="0.42" stopColor="#121311" />
            <stop offset="0.75" stopColor="#343632" />
            <stop offset="1" stopColor="#090a09" />
          </linearGradient>
        </defs>
        <ellipse cx="200" cy="344" rx="120" ry="20" fill="#000" opacity=".3" />
        <g transform="translate(200 188) rotate(-13)">
          <ellipse rx="122" ry="140" fill={`url(#${gradientId})`} />
          <ellipse rx="72" ry="90" fill="#0d0e0d" stroke="#555852" strokeWidth="4" />
          <circle cx="60" cy="-26" r="8" fill="#C7D99F" />
        </g>
      </svg>
    </div>
  );
}

type ViewerState = 'loading' | 'loaded' | 'failed';

export function RingViewer() {
  const [state, setState] = useState<ViewerState>(() =>
    typeof window === 'undefined' || !window.customElements ? 'failed' : 'loading',
  );
  const [reduceMotion] = useState(prefersReducedMotion);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!window.customElements) return;
    let active = true;
    import('./registerModelViewer').catch(() => {
      if (active) setState('failed');
    });
    return () => {
      active = false;
    };
  }, []);

  const hasElement = state !== 'failed';
  useEffect(() => {
    const el = ref.current;
    if (!hasElement || !el) return;
    const onLoad = () => setState('loaded');
    const onError = () => setState('failed');
    el.addEventListener('load', onLoad);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('load', onLoad);
      el.removeEventListener('error', onError);
    };
  }, [hasElement]);

  return (
    <div style={{ ...FILL_STYLE, position: 'relative' }}>
      {state !== 'loaded' && <RingFallback />}
      {hasElement && (
        <model-viewer
          ref={ref}
          src={MODEL_SRC}
          poster={POSTER_SRC}
          alt="R³ Note — drag to rotate"
          camera-controls=""
          shadow-intensity="1"
          {...(reduceMotion ? {} : { 'auto-rotate': '', 'rotation-per-second': '12deg' })}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            background: 'transparent',
            opacity: state === 'loaded' ? 1 : 0,
            ...(reduceMotion ? {} : { transition: 'opacity 400ms ease' }),
          }}
        />
      )}
    </div>
  );
}
