/*
 * Turns a flat green background into real transparency. The image model cannot draw a genuinely transparent background: asked
 * for one it paints a checkerboard (fake transparency) or a solid fill. So the house-style prompt asks for a flat chroma-green
 * background and this removes it afterwards, in the browser, before the avatar is previewed and saved.
 *
 * The pixel work is a pure function over RGBA data so it is tested without a canvas. The key colour is read from the outer
 * ring of the picture rather than assumed to be exactly #00FF00, because the model gives "green" in a range of greens.
 * A picture whose edge is not overwhelmingly one green is left untouched.
 */

export interface KeyResult {
  keyed: boolean;
  /** The background colour that was removed, when there was one. */
  key: [number, number, number] | null;
  /** Pixels made fully transparent. */
  removed: number;
}

/** How green a pixel is: green over the larger of red and blue. Skin, stone, hair and sepia all sit at or below zero. */
const greenness = (r: number, g: number, b: number) => g - Math.max(r, b);

/** The median of each channel over the outer ring (about 2% of the shorter side), if that ring is one green. */
export function detectKey(data: Uint8ClampedArray, width: number, height: number): [number, number, number] | null {
  if (width < 4 || height < 4) return null;
  const ring = Math.max(1, Math.round(Math.min(width, height) * 0.02));
  const histogram = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let count = 0;
  const visit = (x: number, y: number, fn: (i: number) => void) => { fn((y * width + x) * 4); };
  const sample = (i: number) => { for (let c = 0; c < 3; c++) histogram[c][data[i + c]]++; count++; };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (x < ring || y < ring || x >= width - ring || y >= height - ring) visit(x, y, sample);
  const median = (bins: Uint32Array) => { let seen = 0; for (let v = 0; v < 256; v++) { seen += bins[v]; if (seen >= count / 2) return v; } return 0; };
  const key: [number, number, number] = [median(histogram[0]), median(histogram[1]), median(histogram[2])];
  if (greenness(...key) < 60) return null; // not a green edge
  // Most of the edge must be close to that colour, so a picture that merely has green at a corner is left alone.
  let near = 0;
  const close = (i: number) => { const d = Math.hypot(data[i] - key[0], data[i + 1] - key[1], data[i + 2] - key[2]); if (d <= 70) near++; };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (x < ring || y < ring || x >= width - ring || y >= height - ring) visit(x, y, close);
  return near / count >= 0.6 ? key : null;
}

/**
 * Removes the green background in place. Pixels as green as the key become transparent, pixels well short of it are kept,
 * and the ones in between fade out so the edge is soft; green spilled onto the kept edge is pulled back to its neighbours.
 */
export function keyOutGreen(data: Uint8ClampedArray, width: number, height: number): KeyResult {
  const key = detectKey(data, width, height);
  if (!key) return { keyed: false, key: null, removed: 0 };
  const strength = greenness(...key);
  const low = strength * 0.4, high = strength * 0.8;
  let removed = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const gp = greenness(r, g, b);
    if (gp >= high) { data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0; removed++; continue; }
    if (gp > low) data[i + 3] = Math.round(data[i + 3] * (1 - (gp - low) / (high - low)));
    // Despill: green that has bled onto the kept edge is pulled back to its red or blue. Only clearly spilled pixels, so a subject that
    // is naturally a little green (olive clothing, say) is left exactly as it was.
    if (gp > low * 0.3) data[i + 1] = Math.max(r, b);
  }
  return { keyed: true, key, removed };
}

/**
 * Takes a data: URL image with a flat green background and returns a PNG data: URL with a real alpha channel. Anything that
 * cannot be keyed (no canvas, no green edge, an error) returns the original, so a failure never loses the picture.
 */
export async function removeGreenBackground(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function' || !/^data:image\//.test(dataUrl)) return dataUrl;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return dataUrl;
    context.drawImage(bitmap, 0, 0);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = keyOutGreen(frame.data, canvas.width, canvas.height);
    if (!result.keyed) return dataUrl;
    context.putImageData(frame, 0, 0);
    return canvas.toDataURL('image/png');
  } catch { return dataUrl; }
}
