import { describe, expect, it } from 'vitest';
import { ageLabel, audienceTags, daysLabel, genderLabel, protocolTags, protocolTheme, protocolWhen } from '../protocolTags';

const labels = (tags: Array<{ label: string }>) => tags.map((t) => t.label);

describe('protocolTheme', () => {
  it('goes by the category first', () => {
    expect(protocolTheme({ category: 'Cleanse' })).toBe('Detox');
    expect(protocolTheme({ category: 'Recovery' })).toBe('Fitness');
    expect(protocolTheme({ category: 'Skin & Face' })).toBe('Beauty');
    expect(protocolTheme({ category: 'Health' })).toBe('Wellness');
    expect(protocolTheme({ category: 'oral care' })).toBe('Hygiene');
  });

  it('then the tags, when the category is only a time of day or a kind of record', () => {
    // "5-Bullet Morning": category Morning, and a description that mentions exercise
    expect(protocolTheme({ category: 'Morning', tags: ['morning', 'Morning', 'Daily', 'Wellness'], name: '5-Bullet Morning', description: 'gratitude journaling, 20 min meditation, 10 min light exercise' })).toBe('Wellness');
    expect(protocolTheme({ category: 'module', tags: ['k-beauty', 'glass-skin'] })).toBe('Beauty');
  });

  it('then words in the name and description, then Other', () => {
    expect(protocolTheme({ category: 'Morning', tags: [], name: 'Gym day', description: '' })).toBe('Fitness');
    expect(protocolTheme({ category: null, name: 'Mystery', description: 'A thing.' })).toBe('Other');
  });
});

describe('daysLabel', () => {
  it('is singular for one day, and one day when the length is not known', () => {
    expect([1, 7, 14].map(daysLabel)).toEqual(['1 day', '7 days', '14 days']);
    expect([null, undefined, 0].map(daysLabel)).toEqual(['1 day', '1 day', '1 day']);
  });
});

describe('protocolWhen', () => {
  it('names a part of the day and nothing else', () => {
    expect(protocolWhen('Morning')).toBe('Morning');
    expect(protocolWhen('midday')).toBe('Midday');
    expect(protocolWhen('Fitness')).toBeNull();
    expect(protocolWhen(null)).toBeNull();
  });
});

describe('genderLabel', () => {
  it('says Women or Men whichever way the database spells it', () => {
    for (const v of ['female', 'Women', 'woman']) expect(genderLabel({ target_gender: v })).toBe('Women');
    for (const v of ['male', 'men', 'Man']) expect(genderLabel({ target_gender: v })).toBe('Men');
  });

  it('is nothing for everyone, for all, and for no value', () => {
    for (const v of ['all', 'All', 'everyone', null, '']) expect(genderLabel({ target_gender: v })).toBeNull();
  });

  it('prefers the builder\'s Population line, and keeps a group it does not know by name', () => {
    expect(genderLabel({ target_gender: 'all', description: 'Population: Women. Age: Adults 45–64.' })).toBe('Women');
    expect(genderLabel({ target_gender: null, description: 'Population: Pregnant women.' })).toBe('Pregnant women');
    expect(genderLabel({ target_gender: 'male', description: 'Population: Everyone.' })).toBeNull();
  });
});

describe('ageLabel', () => {
  it('reads the age columns', () => {
    expect(ageLabel({ target_age_min: 13, target_age_max: 19 })).toBe('Ages 13–19');
    expect(ageLabel({ target_age_min: 0, target_age_max: 1 })).toBe('Ages 0–1');
    expect(ageLabel({ target_age_min: 18, target_age_max: null })).toBe('Ages 18+');
    expect(ageLabel({ target_age_min: 18, target_age_max: 120 })).toBe('Ages 18+');
    expect(ageLabel({ target_age_min: 18, target_age_max: 99 })).toBe('Ages 18+');
    expect(ageLabel({ target_age_min: 18, target_age_max: 80 })).toBe('Ages 18–80');
    expect(ageLabel({ target_age_min: null, target_age_max: 5 })).toBe('Up to 5');
  });

  it('falls back to the Age line of the description, whichever of the builder\'s age options it holds', () => {
    expect(ageLabel({ description: 'Population: Women. Age: Adults 45–64.' })).toBe('Ages 45–64');
    expect(ageLabel({ description: 'Population: Women. Age: Women 45–64.' })).toBe('Ages 45–64');
    expect(ageLabel({ description: 'Population: Men. Age: Teens 13–17.' })).toBe('Ages 13–17');
    expect(ageLabel({ description: 'Population: Children. Age: Infants 0–1.' })).toBe('Ages 0–1');
    expect(ageLabel({ description: 'Population: Women. Age: Girls 0–12.' })).toBe('Ages 0–12');
    expect(ageLabel({ description: 'Population: Everyone. Age: Adults 65+.' })).toBe('Ages 65+');
  });

  it('is nothing for the builder\'s "no restriction" values, and when neither source says', () => {
    expect(ageLabel({ description: 'Population: Everyone. Age: All ages.' })).toBeNull();
    expect(ageLabel({ description: 'Population: Children. Age: All childhood.' })).toBeNull();
    expect(audienceTags({ description: 'Population: Everyone. Age: All ages.', target_gender: 'all' })).toEqual([]);
    expect(audienceTags({ description: 'Population: Women. Age: Women 45–64.' }).map((t) => t.label)).toEqual(['Women', 'Ages 45–64']);
    expect(ageLabel({ description: 'Age: Not specified.' })).toBeNull();
    expect(ageLabel({ description: 'No audience here.' })).toBeNull();
    expect(ageLabel({})).toBeNull();
  });

  it('the columns win over the description', () => {
    expect(ageLabel({ target_age_min: 30, target_age_max: 40, description: 'Age: Adults 45–64.' })).toBe('Ages 30–40');
  });
});

describe('protocolTags', () => {
  it('category, then gender, then age', () => {
    const tags = protocolTags({ category: 'Fitness', target_gender: 'female', target_age_min: 18, target_age_max: 65 });
    expect(tags).toEqual([{ label: 'Fitness', kind: 'category' }, { label: 'Women', kind: 'gender' }, { label: 'Ages 18–65', kind: 'age' }]);
  });

  it('the public card in the screenshot: a Morning protocol tagged Wellness with no audience data has one tag, not invented ones', () => {
    expect(protocolTags({ category: 'Morning', tags: ['morning', 'Daily', 'Wellness'], target_gender: null, target_age_min: null, target_age_max: null, name: '5-Bullet Morning' })).toEqual([{ label: 'Wellness', kind: 'category' }]);
  });

  it('leaves the category out for a list already grouped by theme', () => {
    expect(labels(protocolTags({ category: 'Detox', target_gender: 'male' }, { category: false }))).toEqual(['Men']);
  });

  it('a category that only names a kind of record is not a tag, and one that is a real subject outside the themes is kept', () => {
    expect(protocolTags({ category: 'module' })).toEqual([]);
    expect(protocolTags({ category: 'program' })).toEqual([]);
    expect(labels(protocolTags({ category: 'kids' }))).toEqual(['Kids']);
    expect(protocolTags({ category: 'Morning' })).toEqual([]); // the part of the day is on the card's top line
  });

  it('a category that repeats the gender is one tag', () => {
    expect(labels(protocolTags({ category: 'Women', target_gender: 'Women' }))).toEqual(['Women']);
  });

  it('the category comes from what the protocol states (category, tags, its name), never from a guess in the description', () => {
    // Prenatal Wellness: category "Women", description about folate-rich food: the name says Wellness, "food" does not make it Diet
    expect(labels(protocolTags({ category: 'Women', target_gender: 'female', target_age_min: 18, target_age_max: 45, tags: ['prenatal', 'pregnancy', 'maternal', 'folate', 'women'], name: 'Prenatal Wellness', description: 'A gentle daily protocol with folate-rich food and nutrition.' }))).toEqual(['Wellness', 'Women', 'Ages 18–45']);
    // Postnatal Recovery: "recovery" as a tag is not a theme, so only the audience shows
    expect(labels(protocolTags({ category: 'Women', target_gender: 'female', target_age_min: 18, target_age_max: 50, tags: ['postnatal', 'postpartum', 'recovery'], name: 'Postnatal Recovery' }))).toEqual(['Women', 'Ages 18–50']);
    expect(protocolTags({ category: 'Morning', tags: [], name: 'Slow start', description: 'Meditation, reading and 10 min light exercise.' })).toEqual([]);
    // ...while grouping still places it somewhere
    expect(protocolTheme({ category: 'Morning', tags: [], name: 'Slow start', description: 'Meditation, reading and 10 min light exercise.' })).toBe('Fitness');
  });

  it('a module is tagged by its name; the first tag that is a theme wins', () => {
    expect(labels(protocolTags({ category: 'module', name: 'Oral & Hygiene' }))).toEqual(['Hygiene']);
    expect(labels(protocolTags({ category: 'module', name: 'Cardio & Endurance' }))).toEqual(['Fitness']);
    expect(labels(protocolTags({ category: 'module', name: 'Focus & Brain' }))).toEqual([]);
    expect(labels(protocolTags({ category: null, tags: ['Weekly', 'Fitness', 'Wellness'], name: 'Check' }))).toEqual(['Fitness']);
    expect(labels(protocolTags({ category: 'kids', tags: ['child', 'nutrition', 'age-3-4'], name: 'Child Nutrition • 3 to 4 Years' }))).toEqual(['Diet']);
  });

  it('a label given by the page is used, and still goes through the same rules', () => {
    expect(labels(protocolTags({ category: 'strength', name: 'Pull day' }, { label: 'Strength' }))).toEqual(['Strength']);
    expect(protocolTags({ category: 'module', name: 'Gentle flow' }, { label: 'Module' })).toEqual([]);
    expect(protocolTags({ category: 'midday', name: 'Reset' }, { label: 'Midday' })).toEqual([]);
    expect(labels(protocolTags({ category: 'Women', target_gender: 'female' }, { label: 'Women' }))).toEqual(['Women']);
  });

  it('a protocol with no data has no tags', () => {
    expect(protocolTags({})).toEqual([]);
    expect(audienceTags({})).toEqual([]);
  });
});
