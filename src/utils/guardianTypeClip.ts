/**
 * The default profile-site background: the scene that matches the Guardian's type, shown behind the animated glass until
 * they choose a template, upload their own or add clips. Each of the 33 specialties has a still (public/images/guides/scenes);
 * those with a finished clip (public/videos/guardians/scenes) play it instead. The first specialty with a match decides.
 */
const SCENE_BY_SPECIALTY: Record<string, string> = {
  nutrition: 'nutrition', fitness: 'fitness', wellness: 'wellness-herbalist', yoga: 'yoga', 'somatic work': 'somatic', sleep: 'sleep',
  skin: 'skin', 'gut health': 'gut-health', 'family health': 'family-health', longevity: 'longevity', breathwork: 'breathwork',
  psychology: 'psychology', stress: 'stress', focus: 'focus', habits: 'habits', confidence: 'confidence', relationships: 'relationships',
  'emotional wellbeing': 'emotional-wellbeing', mindfulness: 'mindfulness', coaching: 'coaching',
  'human design': 'human-design', astrology: 'astrology', tarot: 'tarot', numerology: 'numerology', meditation: 'meditation',
  'spiritual practice': 'spiritual-practice', reiki: 'reiki', 'energy work': 'energy-work', 'sound healing': 'sound-healing',
  purpose: 'purpose', journaling: 'journaling', rituals: 'rituals', 'life transitions': 'life-transitions',
};

/** Scenes with a finished clip. The rest show their still. */
const SCENES_WITH_CLIP: ReadonlySet<string> = new Set([
  'fitness', 'yoga', 'sleep', 'skin', 'gut-health', 'family-health', 'longevity', 'breathwork', 'psychology', 'stress', 'focus',
  'habits', 'confidence', 'relationships', 'meditation', 'reiki', 'energy-work',
]);

export function guardianScene(specialties: readonly string[] | null | undefined): string {
  for (const item of specialties ?? []) {
    const key = String(item).trim().toLowerCase();
    if (Object.hasOwn(SCENE_BY_SPECIALTY, key)) return SCENE_BY_SPECIALTY[key];
  }
  return 'yoga';
}

export const guardianSceneHasClip = (scene: string): boolean => SCENES_WITH_CLIP.has(scene);

/** The clip when there is one, otherwise the still. The hero picks a <video> or an <img> by the extension. */
export function guardianTypeClipUrl(specialties: readonly string[] | null | undefined): string {
  const scene = guardianScene(specialties);
  return guardianSceneHasClip(scene) ? `/videos/guardians/scenes/${scene}.mp4` : `/images/guides/scenes/${scene}.jpg`;
}
