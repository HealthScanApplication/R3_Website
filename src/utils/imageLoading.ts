/**
 * Image loading helpers: turn one image URL into the right-sized candidates for the place it is shown.
 *
 * Pure on purpose (no React, no DOM) so the rules are tested on their own; <OptimizedImage> is the one component that
 * applies them.
 *
 * Supabase Storage image transforms (/storage/v1/render/image/public/...) are used for images that live in Storage.
 * Two facts, measured on the Staging project, shape everything below:
 *   1. A request with only `width` does NOT scale proportionally here: it crops to a strip of that width at the original
 *      height (a 1024px square asked for width=96 comes back 96x1024). So a transform is only ever built with BOTH a
 *      width and a height, and the caller must say what the aspect ratio is.
 *   2. WebP is chosen from the Accept header, so a 1.2 MB PNG becomes a few KB without us naming a format.
 * Transforms are a plan-dependent Storage feature and can be absent on another project, so the component always falls
 * back to the original URL if a transformed one fails to load. VITE_IMAGE_TRANSFORMS=off switches them off entirely.
 */

export type ImageFit = 'cover' | 'contain';

export interface TransformOptions {
  width: number;
  height: number;
  fit?: ImageFit;
  quality?: number;
}

export interface ResolveOptions {
  /** width / height of the box the image is shown in; without it (and without `proportional`) there is nothing safe to ask Storage for. */
  aspectRatio?: number;
  /** The box's shape is not known: scale to the width and keep the picture's own shape (contain inside a tall box), no crop. */
  proportional?: boolean;
  /** Candidate widths in CSS-independent pixels (what the browser should be able to choose from). */
  widths: number[];
  fit?: ImageFit;
  quality?: number;
}

export interface EnvOptions {
  /** Override the VITE_IMAGE_TRANSFORMS switch (tests, or a caller that must always use the original). */
  transforms?: boolean;
}

export interface ResolvedSources {
  src: string;
  srcSet?: string;
  /** A tiny blurred version to show while the real one loads; only for big images, where it is worth a request. */
  lqip?: string;
  /** False when `src` is the untouched original: there is no smaller version to fall back from. */
  transformed: boolean;
}

export interface ParsedSupabaseUrl {
  origin: string;
  bucket: string;
  path: string;
}

const PUBLIC_PREFIX = '/storage/v1/object/public/';
const RENDER_PREFIX = '/storage/v1/render/image/public/';
/** Formats a resize is safe for; SVG is vector and an animated GIF would lose its frames. */
const RESIZABLE = /\.(png|jpe?g|webp)$/i;

export const DEFAULT_QUALITY = 75;
export const LQIP_WIDTH = 24;
export const LQIP_QUALITY = 20;
/** Below this width the real image is already about as small as a placeholder, so a second request buys nothing. */
export const BLUR_MIN_WIDTH = 320;
/** `proportional` asks for a box four times taller than wide: any ordinary photo is then limited by its width alone. */
const TALL_BOUND = 0.25;

export function transformsEnabled(env: EnvOptions = {}): boolean {
  if (env.transforms !== undefined) return env.transforms;
  return (import.meta as any).env?.VITE_IMAGE_TRANSFORMS !== 'off';
}

export function parseSupabasePublicUrl(url: string): ParsedSupabaseUrl | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!/\.supabase\.co$/i.test(u.hostname) || !u.pathname.startsWith(PUBLIC_PREFIX)) return null;
  const rest = u.pathname.slice(PUBLIC_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash < 1 || slash === rest.length - 1) return null;
  return { origin: u.origin, bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
}

const size = (n: number) => (Number.isFinite(n) && n >= 1 ? Math.round(n) : null);

export function supabaseRenderUrl(url: string, opts: TransformOptions, env: EnvOptions = {}): string | null {
  if (!transformsEnabled(env)) return null;
  const parsed = parseSupabasePublicUrl(url);
  if (!parsed || !RESIZABLE.test(parsed.path)) return null;
  const width = size(opts.width);
  const height = size(opts.height);
  if (!width || !height) return null;
  const q = `width=${width}&height=${height}&resize=${opts.fit ?? 'cover'}&quality=${opts.quality ?? DEFAULT_QUALITY}`;
  return `${parsed.origin}${RENDER_PREFIX}${parsed.bucket}/${parsed.path}?${q}`;
}

/** Shopify's CDN scales proportionally from a width alone, so it needs no aspect ratio. */
export function resizeShopifyUrl(url: string, width: number): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const shopify = /(^|\.)cdn\.shopify\.com$/i.test(u.hostname) || /\/cdn\/shop\//.test(u.pathname);
  const w = size(width);
  if (!shopify || !w || !RESIZABLE.test(u.pathname)) return null;
  u.searchParams.set('width', String(w));
  return u.toString();
}

function resizedUrl(src: string, width: number, aspectRatio: number, o: Pick<ResolveOptions, 'fit' | 'quality'>, env: EnvOptions): string | null {
  if (!transformsEnabled(env)) return null;
  return supabaseRenderUrl(src, { width, height: width / aspectRatio, fit: o.fit, quality: o.quality }, env) ?? resizeShopifyUrl(src, width);
}

export function lqipUrl(src: string, aspectRatio: number, env: EnvOptions = {}, fit?: ImageFit): string | null {
  if (!(aspectRatio > 0)) return null;
  return resizedUrl(src, LQIP_WIDTH, aspectRatio, { quality: LQIP_QUALITY, fit }, env);
}

export function buildSrcSet(src: string, widths: number[], aspectRatio: number, o: Pick<ResolveOptions, 'fit' | 'quality'> = {}, env: EnvOptions = {}): string | undefined {
  if (!(aspectRatio > 0)) return undefined;
  const unique = [...new Set(widths.map(size).filter((w): w is number => w !== null))].sort((a, b) => a - b);
  const parts: string[] = [];
  for (const w of unique) {
    const url = resizedUrl(src, w, aspectRatio, o, env);
    if (!url) return undefined;
    parts.push(`${url} ${w}w`);
  }
  return parts.length ? parts.join(', ') : undefined;
}

export function resolveImageSources(src: string, o: ResolveOptions, env: EnvOptions = {}): ResolvedSources {
  const original: ResolvedSources = { src, srcSet: undefined, lqip: undefined, transformed: false };
  const aspect = o.proportional ? TALL_BOUND : o.aspectRatio;
  const fit = o.proportional ? 'contain' : o.fit;
  if (!src || !aspect || !(aspect > 0) || !o.widths.length) return original;
  const srcSet = buildSrcSet(src, o.widths, aspect, { fit, quality: o.quality }, env);
  if (!srcSet) return original;
  const largest = Math.max(...o.widths);
  const sized = resizedUrl(src, largest, aspect, { fit, quality: o.quality }, env);
  if (!sized) return original;
  return {
    src: sized,
    srcSet,
    lqip: largest >= BLUR_MIN_WIDTH ? lqipUrl(src, aspect, env, fit) ?? undefined : undefined,
    transformed: true,
  };
}
