import { expect, it } from 'vitest';
import { ACTIVITY_GROUPS } from '../../components/guides/ActivitiesLibrary';

it('folds every catalogue category into exactly one activity group', () => {
  const cats = ['Strength', 'Stretch', 'Sports', 'Wellness', 'Recovery', 'Cardio', 'Beauty', 'Gym', 'Mindfulness', 'Calisthenics', 'Fitness', 'Supplement', 'Nutrition', 'Hygiene', 'Hiit', 'Meditation', 'Consume', 'Health', 'Breathwork', 'Water Sports', 'Martial Arts', 'Yoga', 'Dance'];
  for (const c of cats) expect(ACTIVITY_GROUPS.filter((g) => g.categories.includes(c))).toHaveLength(1);
});
it('offers the muscle filter only for training groups', () => {
  expect(ACTIVITY_GROUPS.filter((g) => g.muscles).map((g) => g.id)).toEqual(['all', 'strength', 'cardio', 'stretch', 'sports', 'recovery']);
});
