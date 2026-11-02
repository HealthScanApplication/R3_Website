import { describe, expect, it } from 'vitest';
import { sectionTones } from '../sectionTones';
import { DEFAULT_SECTION_ORDER, orderPageSections } from '../pageSections';

const shown = (...keys: string[]) => new Set(keys as any);

describe('sectionTones', () => {
  it('alternates light and dark down the shown sections in any order, starting light under the dark hero', () => {
    const order = orderPageSections('retreats,events,shop');
    const tones = sectionTones(order, shown('retreats', 'events', 'shop', 'funnel', 'brands'));
    expect([tones.retreats, tones.events, tones.shop, tones.funnel, tones.brands]).toEqual(['light', 'dark', 'light', 'dark', 'light']);
  });
  it('never puts two of the same tone side by side, whatever is shown', () => {
    for (const saved of ['offers,shop,events,talks,treats,protocols,forum,retreats,funnel,brands', 'retreats,protocols,events,offers,shop,talks,treats,forum,funnel,brands', 'brands,funnel,forum,treats,talks,shop,events,retreats,protocols,offers']) {
      const order = orderPageSections(saved);
      for (const hidden of [[], ['events'], ['shop', 'talks'], ['forum', 'protocols', 'brands']]) {
        const shownKeys = order.filter((key) => !hidden.includes(key));
        const tones = sectionTones(order, new Set(shownKeys));
        const sequence = shownKeys.map((key) => tones[key]);
        expect(sequence[0]).toBe('light');
        sequence.slice(1).forEach((tone, index) => expect(tone).not.toBe(sequence[index]));
      }
    }
  });
  it('skips sections that do not show when looking for the one above', () => {
    const tones = sectionTones(orderPageSections('retreats,events,shop'), shown('retreats', 'funnel'));
    expect(tones.funnel).toBe('dark'); // directly under the light retreats
  });
  it('lets the offer funnel keep its own tone, and the sections around it alternate from it', () => {
    const tones = sectionTones(orderPageSections('shop,protocols,funnel'), shown('shop', 'protocols', 'funnel', 'brands'), { funnel: 'dark' });
    expect(tones.funnel).toBe('dark');
    expect(tones.protocols).toBe('light');
    expect(tones.shop).toBe('dark');
    expect(tones.brands).toBe('light');
  });
});
