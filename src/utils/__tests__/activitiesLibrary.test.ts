import { expect, it } from 'vitest';
import { ACTIVITY_GROUPS, NOT_ACTIVITIES } from '../../components/guides/ActivitiesLibrary';

it('folds every catalogue category into one activity group, or leaves it to the Diet section', () => {
  const cats = ['Strength', 'Stretch', 'Sports', 'Wellness', 'Recovery', 'Cardio', 'Beauty', 'Gym', 'Mindfulness', 'Calisthenics', 'Fitness', 'Supplement', 'Nutrition', 'Hygiene', 'Hiit', 'Meditation', 'Consume', 'Health', 'Breathwork', 'Water Sports', 'Martial Arts', 'Yoga', 'Dance'];
  for (const c of cats) expect(ACTIVITY_GROUPS.filter((g) => g.categories.includes(c)).length + (NOT_ACTIVITIES.includes(c) ? 1 : 0)).toBe(1);
  expect(NOT_ACTIVITIES).toEqual(expect.arrayContaining(['Nutrition', 'Consume', 'Supplement']));
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
import { nutrientEffectText } from '../protocolBuilders';
it('shows a cooking method nutrient effect as a sentence, not JSON', () => {
  expect(nutrientEffectText('{"hazardous_element_ids":["heterocyclic_amines"],"elements_hazardous":[{"name":"Heterocyclic Amines","likelihood":"high","source":"cooking_method"}]}')).toBe('Can form: heterocyclic amines (high)');
  expect(nutrientEffectText('Retains water-soluble vitamins')).toBe('Retains water-soluble vitamins');
  expect(nutrientEffectText('{"bad json')).toBeNull();
});
