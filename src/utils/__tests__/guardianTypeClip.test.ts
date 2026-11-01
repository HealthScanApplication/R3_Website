import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { GUARDIAN_SCENES, guardianScene, guardianSceneHasClip, guardianTypeClipUrl } from '../guardianTypeClip';

const EXPECTED_SCENE: Record<string, string> = {
  Nutrition: 'nutrition', Fitness: 'fitness', Wellness: 'wellness-herbalist', Yoga: 'yoga', 'Somatic work': 'somatic', Sleep: 'sleep',
  Skin: 'skin', 'Gut health': 'gut-health', 'Family health': 'family-health', Longevity: 'longevity', Breathwork: 'breathwork',
  Psychology: 'psychology', Stress: 'stress', Focus: 'focus', Habits: 'habits', Confidence: 'confidence', Relationships: 'relationships',
  'Emotional wellbeing': 'emotional-wellbeing', Mindfulness: 'mindfulness', Coaching: 'coaching', 'Human Design': 'human-design',
  Astrology: 'astrology', Tarot: 'tarot', Numerology: 'numerology', Meditation: 'meditation', 'Spiritual practice': 'spiritual-practice',
  Reiki: 'reiki', 'Energy work': 'energy-work', 'Sound healing': 'sound-healing', Purpose: 'purpose', Journaling: 'journaling',
  Rituals: 'rituals', 'Life transitions': 'life-transitions',
};

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
    for (const [s, expected] of Object.entries(EXPECTED_SCENE)) {
      const scene = guardianScene([s]);
      expect(scene, s).toBe(expected);
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
  it('lists every pickable scene once, with a thumbnail and the file the hero will play', () => {
    expect(GUARDIAN_SCENES).toHaveLength(33);
    expect(new Set(GUARDIAN_SCENES.map((x) => x.id)).size).toBe(33);
    for (const scene of GUARDIAN_SCENES) {
      expect(existsSync(`public${scene.image}`), scene.image).toBe(true);
      expect(existsSync(`public${scene.url}`), scene.url).toBe(true);
      expect(scene.url.endsWith('.mp4')).toBe(scene.video);
    }
  });
});
