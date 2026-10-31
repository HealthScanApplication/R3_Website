import { describe, expect, it } from 'vitest';
import { detectKey, keyOutGreen, removeGreenBackground } from '../chromaKey';

type Px = [number, number, number, number];
/** A width x height image: `edge` everywhere, `centre` in the middle (a margin of `inset` pixels all round). */
function image(width: number, height: number, edge: Px, centre: Px, inset = 2) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = x >= inset && y >= inset && x < width - inset && y < height - inset;
    data.set(inside ? centre : edge, (y * width + x) * 4);
  }
  return data;
}
const at = (data: Uint8ClampedArray, width: number, x: number, y: number) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const SEPIA: Px = [150, 120, 90, 255];

describe('detectKey', () => {
  it('finds a pure green edge', () => { expect(detectKey(image(10, 10, [0, 255, 0, 255], SEPIA), 10, 10)).toEqual([0, 255, 0]); });
  it('finds the green the model actually painted, not just #00FF00', () => {
    const key = detectKey(image(10, 10, [30, 200, 40, 255], SEPIA), 10, 10)!;
    expect(key).toEqual([30, 200, 40]);
  });
  it('finds nothing on an edge that is not green', () => {
    expect(detectKey(image(10, 10, [240, 238, 230, 255], SEPIA), 10, 10)).toBeNull(); // white
    expect(detectKey(image(10, 10, [20, 20, 20, 255], SEPIA), 10, 10)).toBeNull(); // black
    expect(detectKey(image(10, 10, [120, 150, 110, 255], SEPIA), 10, 10)).toBeNull(); // only slightly green: an olive subject, not a screen
  });
  it('ignores a picture that merely has green in one corner', () => {
    const data = image(20, 20, [240, 238, 230, 255], SEPIA);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) data.set([0, 255, 0, 255], (y * 20 + x) * 4);
    expect(detectKey(data, 20, 20)).toBeNull();
  });
  it('is safe on tiny images', () => { expect(detectKey(new Uint8ClampedArray(4), 1, 1)).toBeNull(); });
});

describe('keyOutGreen', () => {
  it('makes the green background transparent and keeps the subject untouched', () => {
    const data = image(10, 10, [0, 255, 0, 255], SEPIA);
    const result = keyOutGreen(data, 10, 10);
    expect(result).toMatchObject({ keyed: true, key: [0, 255, 0] });
    expect(at(data, 10, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(at(data, 10, 9, 9)).toEqual([0, 0, 0, 0]);
    expect(at(data, 10, 5, 5)).toEqual([150, 120, 90, 255]);
    expect(result.removed).toBe(10 * 10 - 6 * 6);
  });
  it('fades an in-between edge pixel and pulls the green spill out of it', () => {
    const data = image(10, 10, [0, 255, 0, 255], SEPIA);
    data.set([60, 180, 50, 255], (5 * 10 + 5) * 4); // greenness 120: part way between the subject and the screen
    keyOutGreen(data, 10, 10);
    const [r, g, b, a] = at(data, 10, 5, 5);
    expect(a).toBeGreaterThan(0); expect(a).toBeLessThan(255); // soft, not a hard cut
    expect(g).toBeLessThanOrEqual(Math.max(r, b)); // no green fringe
  });
  it('removes the green it found when the key is not pure', () => {
    const data = image(10, 10, [30, 200, 40, 255], SEPIA);
    expect(keyOutGreen(data, 10, 10).keyed).toBe(true);
    expect(at(data, 10, 0, 0)[3]).toBe(0);
    expect(at(data, 10, 5, 5)).toEqual([150, 120, 90, 255]);
  });
  it('leaves a picture with no green edge exactly as it was', () => {
    const data = image(10, 10, [240, 238, 230, 255], SEPIA);
    const before = Array.from(data);
    expect(keyOutGreen(data, 10, 10)).toEqual({ keyed: false, key: null, removed: 0 });
    expect(Array.from(data)).toEqual(before);
  });
  it('does not touch skin, stone, hair or engraving tones, whatever the screen colour', () => {
    const tones: Px[] = [[224, 172, 140, 255], [180, 175, 168, 255], [60, 45, 35, 255], [30, 30, 30, 255], [240, 236, 220, 255], [110, 118, 100, 255]];
    for (const tone of tones) {
      const data = image(10, 10, [0, 255, 0, 255], tone);
      keyOutGreen(data, 10, 10);
      expect(at(data, 10, 5, 5), String(tone)).toEqual(tone);
    }
  });
  it('keeps an already-transparent pixel transparent', () => {
    const data = image(10, 10, [0, 255, 0, 255], [150, 120, 90, 0]);
    keyOutGreen(data, 10, 10);
    expect(at(data, 10, 5, 5)[3]).toBe(0);
  });
});

describe('removeGreenBackground', () => {
  it('returns the original when there is no canvas to work with, or the input is not an image data url', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(await removeGreenBackground(png)).toBe(png); // node: no document
    expect(await removeGreenBackground('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(await removeGreenBackground('')).toBe('');
  });
});
