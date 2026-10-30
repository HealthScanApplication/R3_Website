import React, { useCallback, useEffect, useState } from 'react';
import { resolveImageSources, type ImageFit } from '../utils/imageLoading';

/**
 * The one way to put a photo on a page.
 *
 *  - Space is reserved from the aspect ratio, so the page does not shift when the image arrives.
 *  - A placeholder shows at once (a colour, a tiny blurred version, or both) and the real image cross-fades over it.
 *    The cross-fade is skipped for a visitor who prefers reduced motion and for an image that was already cached.
 *  - Below the fold (the default) the image is lazy and decoded off the main thread. The one hero / LCP image passes
 *    `priority`: eager, and fetched ahead of everything else.
 *  - Images in Supabase Storage (and Shopify) are asked for at the size they are shown, in a few widths, so the browser
 *    takes the smallest that is sharp; a 1.2 MB PNG shown as a thumbnail costs a few KB. See utils/imageLoading.ts.
 *  - If a resized version will not load the original is tried; if that fails too a fallback is drawn in the same box,
 *    never the browser's broken-image icon.
 *
 * Inline styles on purpose: index.css is prebuilt, so a class used for the first time here would render as nothing.
 */

export interface OptimizedImageProps {
  src: string;
  alt: string;
  /** width / height of the box. Reserves space and tells Storage which crop to make. Or pass width and height. */
  aspectRatio?: number;
  /** The box is sized by its parent and its shape is not known here: ask Storage for the width only, with no crop. */
  proportional?: boolean;
  width?: number;
  height?: number;
  /** Candidate widths for an image Storage can resize (device pixels, not CSS pixels). */
  widths?: number[];
  /** For a local image with a precomputed srcset. Ignored when `widths` produced one. */
  srcSet?: string;
  sizes?: string;
  /** The above-the-fold hero / LCP image: not lazy, fetched first. Use on one image per page. */
  priority?: boolean;
  fit?: ImageFit;
  quality?: number;
  objectPosition?: string;
  /** Painted behind the image until it has loaded. */
  placeholderColor?: string;
  /** A tiny image (usually a data URI) to show blurred while the real one loads; for sources Storage cannot resize. */
  placeholderSrc?: string;
  /** Drawn in the same box if the image cannot be loaded. */
  fallback?: React.ReactNode;
  className?: string;
  /** The box (borderRadius, height, …). */
  style?: React.CSSProperties;
  /** The <img> itself (filter, opacity, …). */
  imgStyle?: React.CSSProperties;
  onLoad?: React.ReactEventHandler<HTMLImageElement>;
  onError?: () => void;
}

const FADE_MS = 360;
export const DEFAULT_PLACEHOLDER = 'rgba(128, 118, 104, 0.14)';

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

type Phase = 'loading' | 'loaded' | 'failed';

export function OptimizedImage(props: OptimizedImageProps) {
  // A new source is a new image: start every state over rather than carry a failure across.
  return <OptimizedImageInner key={props.src} {...props} />;
}

function OptimizedImageInner({
  src, alt, aspectRatio, proportional, width, height, widths, srcSet, sizes, priority = false, fit = 'cover', quality, objectPosition,
  placeholderColor, placeholderSrc, fallback, className, style, imgStyle, onLoad, onError,
}: OptimizedImageProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>(src ? 'loading' : 'failed');
  const [cached, setCached] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);
  const [blurMounted, setBlurMounted] = useState(false);
  const [blurGone, setBlurGone] = useState(false);

  const ratio = aspectRatio ?? (width && height ? width / height : undefined);
  const resolved = !useOriginal && widths?.length
    ? resolveImageSources(src, { aspectRatio: ratio, proportional, widths, fit, quality })
    : { src, srcSet: undefined, lqip: undefined, transformed: false };
  const imgSrc = resolved.src;
  const imgSrcSet = resolved.srcSet ?? (useOriginal ? undefined : srcSet);
  const blurSrc = placeholderSrc ?? resolved.lqip;
  const instant = cached || reducedMotion;

  // A picture that was cached (or finished loading before React attached its handler) never fires load again.
  const attach = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth > 0) { setCached(true); setPhase('loaded'); }
  }, []);

  // The blurred version is mounted after the first commit so a cached image can skip it entirely.
  useEffect(() => { if (phase === 'loading' && blurSrc) setBlurMounted(true); }, [phase, blurSrc]);
  useEffect(() => {
    if (phase !== 'loaded' || !blurMounted) return;
    const t = window.setTimeout(() => setBlurGone(true), instant ? 0 : FADE_MS + 40);
    return () => window.clearTimeout(t);
  }, [phase, blurMounted, instant]);

  const handleError = () => {
    // A resized or precomputed variant may be what is missing; try the original once before giving up.
    if (!useOriginal && (resolved.transformed || srcSet)) {
      setUseOriginal(true);
      return;
    }
    setPhase('failed');
    onError?.();
  };

  const failed = phase === 'failed';
  const box: React.CSSProperties = {
    position: 'relative',
    display: 'block',
    width: '100%',
    overflow: 'hidden',
    backgroundColor: placeholderColor ?? DEFAULT_PLACEHOLDER,
    ...(ratio ? { aspectRatio: String(ratio) } : { height: '100%' }),
    ...style,
  };
  const layer: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, objectPosition };
  const transition = instant ? 'none' : `opacity ${FADE_MS}ms ease`;

  return (
    <span
      className={className}
      style={box}
      data-image-state={phase}
      {...(failed ? (alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true }) : {})}
    >
      {!failed && blurMounted && !blurGone && blurSrc && (
        <img
          src={blurSrc}
          alt=""
          aria-hidden="true"
          decoding="async"
          loading={priority ? 'eager' : 'lazy'}
          onError={() => setBlurGone(true)}
          style={{ ...layer, filter: 'blur(14px)', transform: 'scale(1.12)', opacity: phase === 'loaded' ? 0 : 1, transition }}
        />
      )}
      {!failed && (
        <img
          ref={attach}
          src={imgSrc}
          srcSet={imgSrcSet}
          sizes={imgSrcSet ? sizes ?? '100vw' : sizes}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          {...(priority ? ({ fetchpriority: 'high' } as Record<string, string>) : {})}
          onLoad={(e) => { setPhase('loaded'); onLoad?.(e); }}
          onError={handleError}
          style={{ ...layer, opacity: phase === 'loaded' ? 1 : 0, transition, ...imgStyle }}
        />
      )}
      {failed && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {fallback ?? <ImageGlyph />}
        </span>
      )}
    </span>
  );
}

function ImageGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="28%" style={{ maxWidth: 40, opacity: 0.28 }} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </svg>
  );
}
