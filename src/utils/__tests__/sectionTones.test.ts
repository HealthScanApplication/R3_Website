import { describe, expect, it } from 'vitest';
import { sectionTones } from '../sectionTones';
import { DEFAULT_SECTION_ORDER, orderPageSections } from '../pageSections';

const shown = (...keys: string[]) => new Set(keys as any);

describe('sectionTones', () => {
  it('gives a flexible section the tone opposite the one above it', () => {
    const order = orderPageSections('retreats,events,shop');
    const tones = sectionTones(order, shown('retreats', 'events', 'shop', 'funnel', 'brands'));
    expect(tones.retreats).toBe('light');
    expect(tones.shop).toBe('dark'); // fixed
    expect(tones.funnel).toBe('light'); // under the dark shop
    expect(tones.brands).toBe('dark'); // under the light sign-up
  });
  it('flips both when the section above them is light', () => {
    const tones = sectionTones(orderPageSections('offers'), shown('offers', 'funnel', 'brands'));
    expect(tones.offers).toBe('light');
    expect(tones.funnel).toBe('dark');
    expect(tones.brands).toBe('light');
  });
  it('skips sections that do not show when looking for the one above', () => {
    const tones = sectionTones(orderPageSections('retreats,events,shop'), shown('retreats', 'funnel'));
    expect(tones.funnel).toBe('dark'); // directly under the light retreats
  });
  it('starts opposite the dark hero', () => {
    expect(sectionTones(DEFAULT_SECTION_ORDER, shown('funnel', 'brands'))).toEqual({ funnel: 'light', brands: 'dark' });
  });
  it('lets the offer funnel keep its own tone, and its neighbours alternate from it', () => {
    const tones = sectionTones(orderPageSections('shop'), shown('shop', 'funnel', 'brands'), { funnel: 'dark' });
    expect(tones.funnel).toBe('dark');
    expect(tones.brands).toBe('light');
  });
});
