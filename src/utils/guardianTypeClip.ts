/**
 * The default profile-site background: the Guardian clip that matches their type, shown behind the animated glass
 * until they choose a template, upload their own or add clips. Same seven clips as the /guardians hero
 * (public/videos/guardians). The first specialty with a match decides; the realm is the fallback.
 */
export type GuardianClipId = 'trainer' | 'dietitian' | 'herbs-for-kids' | 'breathwork-drum' | 'constellations' | 'yoga' | 'sleep';

const BY_SPECIALTY: Record<string, GuardianClipId> = {
  yoga: 'yoga', 'somatic work': 'yoga',
  fitness: 'trainer', longevity: 'trainer', coaching: 'trainer', habits: 'trainer', confidence: 'trainer',
  nutrition: 'dietitian', 'gut health': 'dietitian', skin: 'dietitian',
  wellness: 'herbs-for-kids', 'family health': 'herbs-for-kids', relationships: 'herbs-for-kids',
  breathwork: 'breathwork-drum', 'sound healing': 'breathwork-drum', meditation: 'breathwork-drum', mindfulness: 'breathwork-drum', reiki: 'breathwork-drum', 'energy work': 'breathwork-drum', rituals: 'breathwork-drum',
  astrology: 'constellations', 'human design': 'constellations', tarot: 'constellations', numerology: 'constellations', 'spiritual practice': 'constellations', purpose: 'constellations',
  sleep: 'sleep', stress: 'sleep', 'emotional wellbeing': 'sleep', psychology: 'sleep', focus: 'sleep', journaling: 'sleep', 'life transitions': 'sleep',
};

export function guardianTypeClip(specialties: readonly string[] | null | undefined): GuardianClipId {
  for (const item of specialties ?? []) {
    const key = String(item).trim().toLowerCase();
    if (Object.hasOwn(BY_SPECIALTY, key)) return BY_SPECIALTY[key];
  }
  return 'yoga';
}

export const guardianTypeClipUrl = (specialties: readonly string[] | null | undefined): string => `/videos/guardians/${guardianTypeClip(specialties)}.mp4`;
