import { describe, expect, it } from 'vitest';
import { PROFILE_SECTIONS, profileSectionStates } from '../profileSections';

describe('profile sections', () => {
  it('are in value-ramp order, free and low-priced things first, the retreat last', () => {
    expect(PROFILE_SECTIONS.map((section) => section.id)).toEqual(['guides', 'recipes', 'protocols', 'courses', 'community', 'sessions', 'shop', 'events', 'talks', 'treats', 'retreats']);
  });
  it('an empty profile has every section, none filled', () => {
    const states = profileSectionStates({ offers: [] });
    expect(states).toHaveLength(11);
    expect(states.every((section) => !section.filled && section.count === 0)).toBe(true);
  });
  it('a product of a type fills its section, and only that one', () => {
    const states = profileSectionStates({ offers: [{ kind: 'course' }, { kind: 'one_to_one_call' }, { kind: 'one_to_one_call' }] });
    const filled = Object.fromEntries(states.filter((section) => section.filled).map((section) => [section.id, section.count]));
    expect(filled).toEqual({ courses: 1, sessions: 2 });
  });
  it('protocols, shop products, events and retreats count too', () => {
    const states = profileSectionStates({ offers: [{ kind: 'festival' }], protocols: 3, products: 27, events: 4, retreats: 1 });
    const filled = Object.fromEntries(states.filter((section) => section.filled).map((section) => [section.id, section.count]));
    expect(filled).toEqual({ protocols: 3, shop: 27, events: 4, retreats: 2 });
  });
  it('talks and treats come from their own offer kinds', () => {
    const filled = profileSectionStates({ offers: [{ kind: 'talk' }, { kind: 'treat' }] }).filter((section) => section.filled).map((section) => section.id);
    expect(filled).toEqual(['talks', 'treats']);
  });
});
