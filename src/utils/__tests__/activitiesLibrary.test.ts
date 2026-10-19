import { expect, it } from 'vitest';
import { ACTIVITY_GROUPS } from '../../components/guides/ActivitiesLibrary';

it('folds every catalogue category into exactly one activity group', () => {
  const cats = ['Strength', 'Stretch', 'Sports', 'Wellness', 'Recovery', 'Cardio', 'Beauty', 'Gym', 'Mindfulness', 'Calisthenics', 'Fitness', 'Supplement', 'Nutrition', 'Hygiene', 'Hiit', 'Meditation', 'Consume', 'Health', 'Breathwork', 'Water Sports', 'Martial Arts', 'Yoga', 'Dance'];
  for (const c of cats) expect(ACTIVITY_GROUPS.filter((g) => g.categories.includes(c))).toHaveLength(1);
});
it('offers the muscle filter only for training groups', () => {
  expect(ACTIVITY_GROUPS.filter((g) => g.muscles).map((g) => g.id)).toEqual(['all', 'strength', 'cardio', 'stretch', 'sports', 'recovery']);
});

import { bySubcategory, MUSCLE_SECTIONS } from '../../components/guides/ActivitiesLibrary';
import { activitySetting } from '../protocolBuilders';
const act = (name: string, subcategory: string | null) => ({ id: name, name, image: null, category: 'Cardio', minutes: null, subcategory });
it('groups activities by subcategory, largest first, uncategorised last', () => {
  const g = bySubcategory([act('Tempo Run', 'Endurance'), act('Long Run', 'Endurance'), act('Box Jumps', 'Plyometric'), act('Mystery', null), act('Racquet', 'Racquet-Sport')]);
  expect(g.map((x) => x.label)).toEqual(['Endurance', 'Plyometric', 'Racquet Sport', 'Other']);
});
it('tags indoor and outdoor only when the name says so', () => {
  expect(activitySetting('Treadmill Run')).toBe('Indoor');
  expect(activitySetting('Trail Running')).toBe('Outdoor');
  expect(activitySetting('Tempo Run')).toBeNull();
});
it('splits a muscle group into exercises, stretches and sports', () => {
  expect(MUSCLE_SECTIONS.map((s) => s.id)).toEqual(['exercise', 'stretch', 'sports']);
});
