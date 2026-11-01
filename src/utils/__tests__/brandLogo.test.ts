import { describe, expect, it } from 'vitest';
import { isMonoLogoUrl, logoImageStyle, monoLogoAlpha, monoLogoPath } from '../brandLogo';

/** A width x height picture filled with one colour, with `paint(x, y)` able to override a pixel. */
function picture(width: number, height: number, fill: [number, number, number, number], paint?: (x: number, y: number) => [number, number, number, number] | null) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set(paint?.(x, y) ?? fill, (y * width + x) * 4);
  return data;
}

describe('monoLogoAlpha', () => {
  it('uses the picture\'s own transparency when it has some', () => {
    const data = picture(10, 10, [0, 0, 0, 0], (x, y) => (x >= 3 && x < 6 && y >= 2 && y < 8 ? [28, 28, 28, 255] : null));
    const { alpha, box } = monoLogoAlpha(data, 10, 10);
    expect(box).toEqual({ x0: 3, y0: 2, x1: 6, y1: 8 });
    expect(alpha[3 * 10 + 4]).toBe(1);
    expect(alpha[0]).toBe(0);
  });

  it('finds a coloured logo on a white background by what differs from the background', () => {
    const data = picture(10, 10, [255, 255, 255, 255], (x, y) => (x >= 2 && x < 8 && y >= 4 && y < 6 ? [60, 110, 60, 255] : null));
    const { alpha, box } = monoLogoAlpha(data, 10, 10);
    expect(box).toEqual({ x0: 2, y0: 4, x1: 8, y1: 6 });
    expect(alpha[4 * 10 + 3]).toBe(1);
    expect(alpha[0]).toBe(0);
  });

  it('works for a light logo on a dark background too, and keeps a faint edge faint', () => {
    const data = picture(8, 8, [10, 10, 10, 255], (x, y) => (x === 3 && y === 3 ? [255, 255, 255, 255] : x === 4 && y === 3 ? [40, 40, 40, 255] : null));
    const { alpha } = monoLogoAlpha(data, 8, 8);
    expect(alpha[3 * 8 + 3]).toBe(1);
    expect(alpha[3 * 8 + 4]).toBeGreaterThan(0.3);
    expect(alpha[3 * 8 + 4]).toBeLessThan(0.8);
  });

  it('reports no logo for a blank picture', () => {
    expect(monoLogoAlpha(picture(6, 6, [255, 255, 255, 255]), 6, 6).box).toBeNull();
  });
});

describe('mono logo files', () => {
  it('names the file so it can be recognised from the url alone', () => {
    const path = monoLogoPath('user-1', 1730000000000);
    expect(path).toBe('user-1/logo-mono-1730000000000.png');
    expect(isMonoLogoUrl(`https://x.supabase.co/storage/v1/object/public/guide-assets/${path}`)).toBe(true);
    expect(isMonoLogoUrl(`https://x.supabase.co/storage/v1/object/public/guide-assets/${path}?v=2`)).toBe(true);
    expect(isMonoLogoUrl('https://x.supabase.co/storage/v1/object/public/guide-assets/user-1/profile-1.jpg')).toBe(false);
    expect(isMonoLogoUrl(null)).toBe(false);
  });

  it('inverts a flat logo to white on a dark surface and leaves everything else alone', () => {
    const mono = 'https://x/guide-assets/u/logo-mono-1.png';
    expect(logoImageStyle(mono)).toEqual({ filter: 'invert(1)' });
    expect(logoImageStyle(mono, false)).toBeUndefined();
    expect(logoImageStyle('https://x/guide-assets/u/profile-1.jpg')).toBeUndefined();
  });
});
