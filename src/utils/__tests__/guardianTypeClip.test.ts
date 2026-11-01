import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { guardianTypeClip, guardianTypeClipUrl } from '../guardianTypeClip';

describe('guardianTypeClip', () => {
  it('maps a Guardian type to its clip', () => {
    expect(guardianTypeClip(['Yoga'])).toBe('yoga');
    expect(guardianTypeClip(['Nutrition', 'Fitness'])).toBe('dietitian');
    expect(guardianTypeClip(['Breathwork'])).toBe('breathwork-drum');
    expect(guardianTypeClip(['Astrology'])).toBe('constellations');
    expect(guardianTypeClip(['Sleep'])).toBe('sleep');
  });
  it('uses the first specialty that has a clip and is case-insensitive', () => {
    expect(guardianTypeClip(['Something else', 'FITNESS'])).toBe('trainer');
  });
  it('falls back to yoga for no or unknown specialties', () => {
    expect(guardianTypeClip([])).toBe('yoga');
    expect(guardianTypeClip(undefined)).toBe('yoga');
    expect(guardianTypeClip(['Basket weaving'])).toBe('yoga');
    expect(guardianTypeClip(['constructor', 'toString'])).toBe('yoga'); // inherited object keys are not specialties
  });
  it('only points at clips that exist in public/videos/guardians', () => {
    for (const s of ['Yoga', 'Fitness', 'Nutrition', 'Wellness', 'Breathwork', 'Astrology', 'Sleep']) {
      const url = guardianTypeClipUrl([s]);
      expect(existsSync(`public${url}`), url).toBe(true);
    }
  });
});
