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
  it('shop products, events and retreat rows count too; a festival offer is a Session (the catalog shows it there)', () => {
    const states = profileSectionStates({ offers: [{ kind: 'festival' }], products: 27, events: 4, retreats: 1 });
    const filled = Object.fromEntries(states.filter((section) => section.filled).map((section) => [section.id, section.count]));
    expect(filled).toEqual({ sessions: 1, shop: 27, events: 4, retreats: 1 });
  });
  it('talks and treats come from their own offer kinds', () => {
    const filled = profileSectionStates({ offers: [{ kind: 'talk' }, { kind: 'treat' }] }).filter((section) => section.filled).map((section) => section.id);
    expect(filled).toEqual(['talks', 'treats']);
  });
});

describe('protocols listed on the page', () => {
  it('make the Protocols tag lead to the Protocols section, not the catalog tab', () => {
    const states = profileSectionStates({ offers: [], protocols: 3 });
    const tag = states.find((section) => section.id === 'protocols')!;
    expect(tag.filled).toBe(true);
    expect(tag.anchor).toBe('protocols');
    expect(tag.category).toBeUndefined();
    const none = profileSectionStates({ offers: [] }).find((section) => section.id === 'protocols')!;
    expect(none.filled).toBe(false);
    expect(none.anchor).toBe('catalog');
  });
});
