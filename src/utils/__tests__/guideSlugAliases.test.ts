import { describe, expect, it } from 'vitest';
import { canonicalGuideSlug } from '../guidePortal';

describe('canonicalGuideSlug', () => {
  it('combines Barbara O’Neill’s directory slug with her profile site', () => {
    expect(canonicalGuideSlug('barbara-o-neill')).toBe('barbara-oneill');
  });

  it('normalizes encoded and mixed-case public slugs', () => {
    expect(canonicalGuideSlug('Barbara-Oneill')).toBe('barbara-oneill');
    expect(canonicalGuideSlug('barbara%2Doneill')).toBe('barbara-oneill');
  });

  it('leaves unrelated Guardian slugs intact', () => {
    expect(canonicalGuideSlug('jane-doe')).toBe('jane-doe');
  });

  it('does not crash on malformed route encoding', () => {
    expect(canonicalGuideSlug('barbara%')).toBe('barbara%');
  });
});
