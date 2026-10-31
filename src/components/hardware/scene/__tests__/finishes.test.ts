import { describe, expect, it } from 'vitest';
import { DEFAULT_FINISH, FINISHES, FINISH_SPECS, finishSpec } from '../finishes';
import { DEFAULT_SCREEN_SCHEME } from '../retroScreen';

// Relative luminance (WCAG) of a #rrggbb colour.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('finishes', () => {
  it('offers White, Black and Silver, defaulting to White', () => {
    expect(FINISHES).toEqual(['white', 'black', 'silver']);
    expect(DEFAULT_FINISH).toBe('white');
    expect(FINISHES.map(f => FINISH_SPECS[f].label)).toEqual(['White', 'Black', 'Silver']);
    FINISHES.forEach(f => expect(FINISH_SPECS[f].swatch).toMatch(/^#[0-9a-f]{6}$/i));
  });

  it('flips the white screen to dark ink on a light ground', () => {
    const { ink, ground } = FINISH_SPECS.white.screen;
    expect(ink).toBe('#111111');
    expect(ground).toBe('#f4f2ec');
    expect(lum(ground)).toBeGreaterThan(lum(ink) + 0.7);
  });

  it('keeps today\'s light-on-dark screen for black and silver', () => {
    expect(DEFAULT_SCREEN_SCHEME).toEqual({ ink: '#ffffff', ground: '#000000' });
    for (const f of ['black', 'silver'] as const) {
      expect(FINISH_SPECS[f].screen).toEqual(DEFAULT_SCREEN_SCHEME);
      expect(lum(FINISH_SPECS[f].screen.ink)).toBeGreaterThan(lum(FINISH_SPECS[f].screen.ground));
    }
  });

  it('black is today\'s ring and watch body; white is a light dielectric, silver a metal', () => {
    expect(FINISH_SPECS.black.ring).toEqual({ color: '#1b1c1a', metalness: 0.9, roughness: 0.35 });
    expect(FINISH_SPECS.black.watch).toEqual({ color: '#2a2e2d', metalness: 1, roughness: 0.32 });
    expect(lum(FINISH_SPECS.white.ring.color)).toBeGreaterThan(0.8);
    expect(FINISH_SPECS.white.ring.metalness).toBeLessThan(0.2);
    expect(FINISH_SPECS.silver.ring.metalness).toBe(1);
    expect(FINISH_SPECS.silver.watch.metalness).toBe(1);
    expect(finishSpec(undefined)).toBe(FINISH_SPECS.black);
  });
});
