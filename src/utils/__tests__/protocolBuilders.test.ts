import { describe, it, expect, vi } from 'vitest';
import { dietSupportItems, reviewFitness, saveDietProtocol, withSetInfo, type FitnessConfig, fitsSlot, mealPlacementIssues, nameSlotHint, planMealItems, reviewDiet, slotForTime, type DietConfig, type MealPick } from '../protocolBuilders';

const pick = (name: string, id = name): MealPick => ({ source: 'catalog', id, name, image: null, nutrition: { energy_kcal: 500, protein_g: 25, carbohydrates_g: 50, fats_g: 20 } });
const diet = (plan: DietConfig['plan'], extra: Partial<DietConfig> = {}): DietConfig => ({ framework: 'balanced', kcal: 2000, protein: 20, carbs: 50, fat: 30, slots: ['breakfast', 'lunch', 'dinner'], plan, ...extra });

it('keeps supplement catalogue IDs and images when generating timed protocol items', () => {
  const items = dietSupportItems(diet({}, { supplements: { morning: [
    { id: 'generic-d3', name: 'Vitamin D3', source: 'supplement', image: 'd3.jpg' },
    { id: 'branded-d3', name: 'Brand D3', source: 'product', image: null, barcode: '0012345678905' },
  ] } }));
  expect(items[0]).toMatchObject({ title: 'Take Vitamin D3', time: '08:00', link: { supplement_id: 'generic-d3', media_image_url: 'd3.jpg' } });
  expect(items[1]).toMatchObject({ title: 'Take Brand D3', link: { catalog_product_id: 'branded-d3', media_image_url: null } });
});

it('writes linked supplements into protocol items and retains them in saved builder settings', async () => {
  const writes: any[] = [];
  const config = diet({}, { supplements: { evening: [{ id: 'prod_generic_zinc', name: 'Zinc', source: 'product', image: 'zinc.jpg' }] }, supplementTimes: { evening: '21:15' } });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (init?.method === 'POST' && url.endsWith('/protocol_items')) writes.push(body);
    if (url.includes('/protocols') && init?.method === 'PATCH') writes.push(body);
    return new Response(JSON.stringify(url.includes('/rpc/') ? null : init?.method === 'POST' || init?.method === 'PATCH' ? [{ id: 'diet-1', user_id: 'owner', ...body }] : []));
  });
  try {
    await saveDietProtocol('token', 'owner', null, 'Supplement plan', config);
    expect(writes).toEqual(expect.arrayContaining([
      expect.objectContaining({ display_name: 'Take Zinc', catalog_product_id: 'prod_generic_zinc', media_image_url: 'zinc.jpg', scheduled_time: '21:15:00', recurrence_type: 'daily' }),
      expect.objectContaining({ builder_config: config }),
    ]));
  } finally { vi.unstubAllGlobals(); }
});

describe('a lunch recipe assigned to breakfast', () => {
  it('is recognised by its name and kept out of the breakfast slot by auto-fill', () => {
    expect(nameSlotHint('Kitchari Lunch Bowl')).toBe('lunch');
    expect(fitsSlot('Kitchari Lunch Bowl', 'breakfast')).toBe(false);
    expect(fitsSlot('Kitchari Lunch Bowl', 'lunch')).toBe(true);
    expect(fitsSlot('Stuffed capsicum', 'breakfast')).toBe(true);
  });
  it('blocks the save when a Guardian puts it there anyway', async () => {
    const review = reviewDiet(diet({ '1:breakfast': pick('Kitchari Lunch Bowl') }));
    expect(review.blocking.some((b) => b.where === 'Kitchari Lunch Bowl' && /lunch recipe filed under Breakfast/.test(b.message))).toBe(true);
    await expect(saveDietProtocol('token', 'owner', null, 'Week', diet({ '1:breakfast': pick('Kitchari Lunch Bowl') }))).rejects.toThrow(/Fix before saving/);
  });
});

describe('a meal saved into a non-consume group', () => {
  it('is flagged and moved to the consume slot its time falls in', () => {
    const issues = mealPlacementIssues([{ display_name: 'Stuffed capsicum', category: 'consume', item_type: 'recipe', group_name: 'Wellness', scheduled_time: '08:00:00', kind: 'action' }]);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix).toEqual({ group_name: 'Breakfast', category: 'consume' });
  });
  it('leaves meals already in their slot, rules and non-consume steps alone', () => {
    expect(mealPlacementIssues([
      { display_name: 'Vegetable soup', category: 'consume', item_type: 'recipe', group_name: 'Lunch', scheduled_time: '13:00:00', kind: 'action' },
      { display_name: 'Added sugar', category: 'consume', item_type: 'activity', group_name: 'Meal', kind: 'rule_dont' },
      { display_name: 'Walk 20 minutes', category: 'do', item_type: 'activity', group_name: 'Wellness', kind: 'action' },
    ])).toEqual([]);
  });
  it('maps times to slots like the app (breakfast after wake, lunch midday, snack between, dinner evening)', () => {
    expect([slotForTime('08:00'), slotForTime('13:00'), slotForTime('16:00'), slotForTime('19:00')]).toEqual(['Breakfast', 'Lunch', 'Snack', 'Dinner']);
  });
});

describe('a meal with a drink in the slot', () => {
  it('saves one slot item per day with the meal and the drink as separate checkable children', () => {
    const plans = planMealItems(diet({ '1:breakfast': pick('Overnight oats', 'r1') }, { drinks: { breakfast: ['Drink water', 'Green tea'] } }));
    expect(plans).toHaveLength(1);
    const [slot] = plans;
    expect(slot.label).toBe('Breakfast');
    expect(slot.time).toBe('08:00');
    expect(slot.children.map((c) => [c.role, c.title, c.recipeId])).toEqual([
      ['meal', 'Overnight oats', 'r1'],
      ['drink', 'Water', null], // shared checker: drinks are named by the drink, no verb
      ['drink', 'Green tea', null],
    ]);
  });
  it('gives each slot its own time instead of one fixed time for every meal', () => {
    const plans = planMealItems(diet({ '1:breakfast': pick('Porridge'), '1:lunch': pick('Vegetable soup'), '1:dinner': pick('Lentil curry') }));
    expect(plans.map((p) => [p.label, p.time])).toEqual([['Breakfast', '08:00'], ['Lunch', '13:00'], ['Dinner', '19:00']]);
  });
});

describe('diet supplements and fasting', () => {
  it('creates timed daily supplement items for morning, afternoon and evening', () => {
    const items = dietSupportItems(diet({}, { supplements: { morning: ['Vitamin D3'], afternoon: ['Take zinc'], evening: ['Magnesium'] }, supplementTimes: { morning: '07:30', afternoon: '14:30', evening: '21:00' } }));
    expect(items.map((item) => [item.title, item.time, item.category, item.group])).toEqual([
      ['Take Vitamin D3', '07:30', 'supplement', 'Supplements'], ['Take zinc', '14:30', 'supplement', 'Supplements'], ['Take Magnesium', '21:00', 'supplement', 'Supplements'],
    ]);
    expect(items.every((item) => item.days === null)).toBe(true);
  });
  it('creates start and end items on the selected intermittent fasting days', () => {
    const items = dietSupportItems(diet({}, { fasting: { type: 'intermittent', start: '20:00', end: '12:00', days: [1, 3, 7] } }));
    expect(items.map((item) => [item.title, item.time, item.days])).toEqual([
      ['Start intermittent fast', '20:00', [1, 3, 0]], ['End intermittent fast', '12:00', [2, 4, 1]],
    ]);
  });
  it('adds a safety note to dry fasting items', () => {
    const items = dietSupportItems(diet({}, { fasting: { type: 'dry', start: '18:00', end: '08:00', days: [2] } }));
    expect(items).toHaveLength(2);
    expect(items.every((item) => /dangerous/.test(item.notes))).toBe(true);
  });
});

const fitness = (sessions: FitnessConfig['sessions']): FitnessConfig => ({ goal: 'general', level: 'beginner', minutes: 30, sessions });
const ex = (name: string, category: string, extra = {}) => ({ id: name, name, image: null, category, minutes: null, sets: null, reps: null, rest_seconds: null, ...extra });

describe('fitness hard gate', () => {
  it('blocks a session without exercises whose title is not verb + noun', () => {
    const review = reviewFitness(fitness([{ day: 1, time: '07:00', title: 'Cardio session', minutes: 30, intensity: 'moderate', exercises: [] }]));
    expect(review.blocking).toHaveLength(1);
  });
  it('lets a session with exercises keep its group title (smart-list parent)', () => {
    const review = reviewFitness(fitness([{ day: 1, time: '07:00', title: 'Upper body', minutes: 30, intensity: 'moderate', exercises: [ex('Archer Push-Up', 'Strength', { sets: 3, reps: '10' })] }]));
    expect(review.blocking).toEqual([]);
  });
  it('fills missing set info from the level: sets × reps for strength, minutes for timed work', () => {
    const { cfg, notes } = withSetInfo(fitness([{ day: 1, time: '07:00', title: 'Upper body', minutes: 30, intensity: 'moderate', exercises: [ex('Archer Push-Up', 'Strength'), ex('Treadmill Walk', 'Cardio')] }]));
    expect(cfg.sessions[0].exercises.map((e) => [e.sets, e.reps, e.minutes])).toEqual([[2, '10', null], [null, null, 10]]);
    expect(notes).toHaveLength(2);
  });
});

import { planFitnessWeek, isPostWorkoutRecovery, FITNESS_GOALS } from '../protocolBuilders';

describe('fitness likes', () => {
  const goal = (id: string) => FITNESS_GOALS.find((g) => g.id === id)!;
  const sport = (name: string) => ({ id: name, name, image: null, category: 'Sports', minutes: null });

  it('keeps the goal split when nothing is picked', () => {
    const plan = planFitnessWeek(goal('general'));
    expect(plan.map((p) => [p.day, p.template.title])).toEqual([[1, 'Full body day'], [3, 'Cardio day'], [5, 'Mobility day']]);
  });
  it('narrows sessions to picked training types, leaving sessions none of them fit', () => {
    const plan = planFitnessWeek(goal('general'), { types: ['calisthenics'], sports: [] });
    expect(plan[0].template.categories).toEqual(['Calisthenics']);      // full body: strength → calisthenics only
    expect(plan[2].template.categories).toEqual(['Stretch', 'Recovery', 'Yoga']); // mobility untouched
  });
  it('turns cardio days into the picked sports, in turn', () => {
    const plan = planFitnessWeek(goal('weight_loss'), { types: [], sports: [sport('Tennis'), sport('Padel')] });
    expect(plan.filter((p) => p.sport).map((p) => [p.day, p.sport!.name])).toEqual([[2, 'Tennis'], [6, 'Padel']]);
    expect(plan.some((p) => p.template.title === 'Cardio day')).toBe(false);
  });
  it('adds one sports day when the goal has no cardio day', () => {
    const plan = planFitnessWeek(goal('muscle_gain'), { types: [], sports: [sport('Bouldering')] });
    expect(plan).toHaveLength(5);
    expect(plan.find((p) => p.sport)).toMatchObject({ day: 6, sport: { name: 'Bouldering' } });
    expect(plan.map((p) => p.day)).toEqual([1, 2, 4, 5, 6]);
  });
  it('keeps only recovery that belongs after training', () => {
    for (const n of ['Ice Bath / Cold Water Immersion', 'Sauna Session', 'Foam Rolling', 'Contrast Therapy', 'Normatec Compression Boots', 'Cool-Down Swim or Run']) expect(isPostWorkoutRecovery(n)).toBe(true);
    for (const n of ['Sleep', 'Wake at 4am sharp', 'Digital Sunset', 'Gaming Session', 'Manage Herxheimer Reaction', 'Recovery Nap']) expect(isPostWorkoutRecovery(n)).toBe(false);
  });
});

it('saves training fuel as timed, catalog-linked items on each training day', async () => {
  const { saveFitnessProtocol } = await import('../protocolBuilders');
  const writes: any[] = [];
  const config: FitnessConfig = { goal: 'general', level: 'beginner', minutes: 40, rules: [],
    sessions: [{ day: 1, time: '07:00', anchor: 'clock', offset: 0, title: 'Do leg day', minutes: 40, intensity: 'moderate', rules: [], exercises: [] }],
    fuel: { pre: ['Banana'], post: [{ id: 'sup-creatine', name: 'Creatine', source: 'supplement', image: 'c.jpg' }], preMinutes: 30, postMinutes: 15 } };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (init?.method === 'POST' && url.endsWith('/protocol_items')) writes.push(body);
    return new Response(JSON.stringify(url.includes('/rpc/') ? null : init?.method === 'POST' || init?.method === 'PATCH' ? [{ id: 'fit-1', user_id: 'owner', ...body }] : []));
  });
  try {
    await saveFitnessProtocol('token', 'owner', null, 'Strength week', config);
    const fuel = writes.filter((w) => w.group_name === 'Training fuel');
    expect(fuel).toEqual([
      expect.objectContaining({ display_name: 'Take Banana', scheduled_time: '06:30:00', notes: 'Before Do leg day', recurrence_type: 'weekly', recurrence_days_of_week: [1] }),
      expect.objectContaining({ display_name: 'Take Creatine', scheduled_time: '07:55:00', notes: 'After Do leg day', supplement_id: 'sup-creatine', media_image_url: 'c.jpg' }),
    ]);
  } finally { vi.unstubAllGlobals(); }
});
