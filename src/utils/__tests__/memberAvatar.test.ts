import { describe, expect, it } from 'vitest';
import { defaultAvatarKeyFor } from '../memberAvatar';

// A copy of the app's rule (mobile: src/features/profile/memberAvatar.ts), so a person looks the same on the web and in the app.
describe('defaultAvatarKeyFor', () => {
  it('age first, then gender', () => {
    expect(defaultAvatarKeyFor({ age: 1, gender: 'female' })).toBe('baby');
    expect(defaultAvatarKeyFor({ age: 8, gender: 'female' })).toBe('child-girl');
    expect(defaultAvatarKeyFor({ age: 8, gender: 'male' })).toBe('child-boy');
    expect(defaultAvatarKeyFor({ age: 15, gender: 'female' })).toBe('teen-girl');
    expect(defaultAvatarKeyFor({ age: 15, gender: 'male' })).toBe('teen-boy');
    expect(defaultAvatarKeyFor({ age: 40, gender: 'female' })).toBe('woman');
    expect(defaultAvatarKeyFor({ age: 40, gender: 'male' })).toBe('man');
    expect(defaultAvatarKeyFor({ age: 70, gender: 'female' })).toBe('grandma');
    expect(defaultAvatarKeyFor({ age: 70, gender: 'male' })).toBe('grandpa');
  });

  it('never guesses a gender: an age with no gender is the neutral avatar (a baby is the one exception)', () => {
    expect(defaultAvatarKeyFor({ age: 40, gender: null })).toBe('neutral');
    expect(defaultAvatarKeyFor({ age: 8, gender: 'other' })).toBe('neutral');
    expect(defaultAvatarKeyFor({ age: 1, gender: null })).toBe('baby');
    expect(defaultAvatarKeyFor(null)).toBe('neutral');
    expect(defaultAvatarKeyFor({})).toBe('neutral');
  });

  it('with no age, the stored gender decides a grown-up, and the relation can say a child or a grandparent', () => {
    expect(defaultAvatarKeyFor({ gender: 'male' })).toBe('man');
    expect(defaultAvatarKeyFor({ gender: 'female' })).toBe('woman');
    expect(defaultAvatarKeyFor({ gender: 'female', relation: 'daughter' })).toBe('child-girl');
    expect(defaultAvatarKeyFor({ relation: 'grandfather', age: 58 })).toBe('grandpa');
    expect(defaultAvatarKeyFor({ relation: 'grandma' })).toBe('grandma');
  });
});
