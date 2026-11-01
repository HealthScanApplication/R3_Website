import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { guardianScene, guardianSceneHasClip, guardianTypeClipUrl } from '../guardianTypeClip';

const SPECIALTIES = [
  'Nutrition', 'Fitness', 'Wellness', 'Yoga', 'Somatic work', 'Sleep', 'Skin', 'Gut health', 'Family health', 'Longevity', 'Breathwork',
  'Psychology', 'Stress', 'Focus', 'Habits', 'Confidence', 'Relationships', 'Emotional wellbeing', 'Mindfulness', 'Coaching',
  'Human Design', 'Astrology', 'Tarot', 'Numerology', 'Meditation', 'Spiritual practice', 'Reiki', 'Energy work', 'Sound healing',
  'Purpose', 'Journaling', 'Rituals', 'Life transitions',
];

describe('guardianTypeClip', () => {
  it('maps a Guardian type to its scene', () => {
    expect(guardianScene(['Yoga'])).toBe('yoga');
    expect(guardianScene(['Nutrition', 'Fitness'])).toBe('nutrition');
    expect(guardianScene(['Wellness'])).toBe('wellness-herbalist');
    expect(guardianScene(['Human Design'])).toBe('human-design');
  });
  it('uses the first specialty that has a scene and is case-insensitive', () => {
    expect(guardianScene(['Something else', 'FITNESS'])).toBe('fitness');
  });
  it('falls back to yoga for no or unknown specialties', () => {
    expect(guardianScene([])).toBe('yoga');
    expect(guardianScene(undefined)).toBe('yoga');
    expect(guardianScene(['Basket weaving'])).toBe('yoga');
    expect(guardianScene(['constructor', 'toString'])).toBe('yoga'); // inherited object keys are not specialties
  });
  it('gives all 33 specialties a scene whose file exists: the clip when there is one, else the still', () => {
    for (const s of SPECIALTIES) {
      const scene = guardianScene([s]);
      const url = guardianTypeClipUrl([s]);
      expect(existsSync(`public${url}`), url).toBe(true);
      expect(url.endsWith('.mp4'), url).toBe(guardianSceneHasClip(scene));
      expect(existsSync(`public/images/guides/scenes/${scene}.jpg`), scene).toBe(true);
    }
  });
  it('shows the still for scenes without a clip', () => {
    expect(guardianTypeClipUrl(['Nutrition'])).toBe('/images/guides/scenes/nutrition.jpg');
    expect(guardianTypeClipUrl(['Breathwork'])).toBe('/videos/guardians/scenes/breathwork.mp4');
  });
});
