/*
 * A company's logo on a Guardian site is kept as one flat shape: black on a transparent background. Pages with a dark
 * background show it inverted to white (CSS `filter: invert(1)`), pages with a light background show it as it is, so one
 * file works everywhere and always matches the brand colours around it.
 *
 * `monoLogoAlpha` is the pure part (which pixels are the logo); `createMonoLogo` runs it in the browser on a picked or
 * pulled-in image and returns a square PNG. A logo made this way is recognised by its file name (`logo-mono-<time>.png`),
 * so nothing extra has to be stored beside the brand's `logo_url`.
 */
import type { CSSProperties } from 'react';

export const MONO_LOGO_SIZE = 1024;
const MONO_LOGO_PADDING = 0.12;

/** The storage path of a made logo, inside the Guardian's own folder. */
export const monoLogoPath = (userId: string, now = Date.now()) => `${userId}/logo-mono-${now}.png`;

export const isMonoLogoUrl = (url?: string | null): boolean => !!url && /\/logo-mono-\d+\.png(?:\?|#|$)/.test(url);

/** Style for a logo picture: a flat black logo is inverted to white on a dark surface, anything else is left alone. */
export function logoImageStyle(url: string | null | undefined, onDark = true): CSSProperties | undefined {
  return onDark && isMonoLogoUrl(url) ? { filter: 'invert(1)' } : undefined;
}

export interface MonoMask { alpha: Float32Array; width: number; height: number; box: { x0: number; y0: number; x1: number; y1: number } | null }

/**
 * How much of each pixel is the logo, from 0 to 1. A picture with real transparency already says: its own alpha is the
 * shape. A picture on a solid background says it by difference: whatever is not the background colour (read from the four
 * corners) is the logo, with soft edges staying soft. `box` is the tight rectangle around the logo, null when there is none.
 */
export function monoLogoAlpha(rgba: ArrayLike<number>, width: number, height: number): MonoMask {
  const count = width * height;
  const alpha = new Float32Array(count);
  let minAlpha = 255;
  for (let i = 0; i < count; i += 1) minAlpha = Math.min(minAlpha, rgba[i * 4 + 3]);
  if (minAlpha < 250) {
    for (let i = 0; i < count; i += 1) alpha[i] = rgba[i * 4 + 3] / 255;
  } else {
    const corner = (x: number, y: number) => { const at = (y * width + x) * 4; return [rgba[at], rgba[at + 1], rgba[at + 2]]; };
    const samples = [corner(0, 0), corner(width - 1, 0), corner(0, height - 1), corner(width - 1, height - 1)];
    const bg = [0, 1, 2].map((channel) => samples.map((sample) => sample[channel]).sort((a, b) => a - b)[1]);
    for (let i = 0; i < count; i += 1) {
      const dr = rgba[i * 4] - bg[0], dg = rgba[i * 4 + 1] - bg[1], db = rgba[i * 4 + 2] - bg[2];
      alpha[i] = Math.min(1, Math.sqrt(dr * dr + dg * dg + db * db) / 110);
    }
  }
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (alpha[y * width + x] > 0.05) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { alpha, width, height, box: x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 } };
}

const loadBitmap = async (source: Blob): Promise<{ draw: CanvasImageSource; width: number; height: number; close: () => void }> => {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(source);
    return { draw: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
  }
  const url = URL.createObjectURL(source);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const el = new Image(); el.onload = () => resolve(el); el.onerror = () => reject(new Error('decode')); el.src = url; });
  return { draw: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
};

const smoothstep = (value: number, from: number, to: number) => { const t = Math.min(1, Math.max(0, (value - from) / (to - from))); return t * t * (3 - 2 * t); };

/** Turns a logo into a square, black-on-transparent PNG that fits with room around it. Throws a readable error. */
export async function createMonoLogo(source: Blob, size = MONO_LOGO_SIZE): Promise<Blob> {
  const image = await loadBitmap(source).catch(() => { throw new Error('That logo could not be opened. Try a PNG or JPG file.'); });
  try {
    const read = document.createElement('canvas');
    read.width = image.width; read.height = image.height;
    const readContext = read.getContext('2d', { willReadFrequently: true });
    if (!readContext) throw new Error('This browser cannot prepare logos.');
    readContext.drawImage(image.draw, 0, 0);
    const pixels = readContext.getImageData(0, 0, image.width, image.height);
    const mask = monoLogoAlpha(pixels.data, image.width, image.height);
    if (!mask.box) throw new Error('No logo shape was found in that image. Use one with the logo on a plain or transparent background.');
    const { x0, y0, x1, y1 } = mask.box;
    const cropW = x1 - x0, cropH = y1 - y0;
    const shape = document.createElement('canvas');
    shape.width = cropW; shape.height = cropH;
    const shapeContext = shape.getContext('2d')!;
    const shapePixels = shapeContext.createImageData(cropW, cropH);
    for (let y = 0; y < cropH; y += 1) for (let x = 0; x < cropW; x += 1) shapePixels.data[(y * cropW + x) * 4 + 3] = Math.round(mask.alpha[(y0 + y) * image.width + x0 + x] * 255);
    shapeContext.putImageData(shapePixels, 0, 0);
    const scale = (size * (1 - 2 * MONO_LOGO_PADDING)) / Math.max(cropW, cropH);
    const out = document.createElement('canvas');
    out.width = size; out.height = size;
    const outContext = out.getContext('2d', { willReadFrequently: true })!;
    outContext.imageSmoothingEnabled = true; outContext.imageSmoothingQuality = 'high';
    const drawW = Math.max(1, Math.round(cropW * scale)), drawH = Math.max(1, Math.round(cropH * scale));
    outContext.drawImage(shape, Math.round((size - drawW) / 2), Math.round((size - drawH) / 2), drawW, drawH);
    if (scale > 2) { // a small source was enlarged: pull the soft edge back to a clean one
      const enlarged = outContext.getImageData(0, 0, size, size);
      for (let i = 3; i < enlarged.data.length; i += 4) enlarged.data[i] = Math.round(smoothstep(enlarged.data[i] / 255, 0.42, 0.58) * 255);
      outContext.putImageData(enlarged, 0, 0);
    }
    return await new Promise<Blob>((resolve, reject) => out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The logo could not be saved as an image.'))), 'image/png'));
  } finally { image.close(); }
}
