import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTION_ORDER, moveSection, orderPageSections, serializeSectionOrder } from '../pageSections';

describe('orderPageSections', () => {
  it('is the default order when nothing is saved', () => {
    expect(orderPageSections()).toEqual(DEFAULT_SECTION_ORDER);
    expect(orderPageSections('')).toEqual(DEFAULT_SECTION_ORDER);
    expect(orderPageSections(null)).toEqual(DEFAULT_SECTION_ORDER);
  });
  it('puts the named sections first, in that order, then the rest in their default order', () => {
    const order = orderPageSections('retreats,events');
    expect(order.slice(0, 2)).toEqual(['retreats', 'events']);
    expect(order.slice(2)).toEqual(DEFAULT_SECTION_ORDER.filter((key) => key !== 'retreats' && key !== 'events'));
    expect(order).toHaveLength(DEFAULT_SECTION_ORDER.length);
  });
  it('ignores unknown names, repeats and spaces, and never loses or doubles a section', () => {
    const order = orderPageSections(' shop , nonsense,shop,,events ');
    expect(order.slice(0, 2)).toEqual(['shop', 'events']);
    expect([...order].sort()).toEqual([...DEFAULT_SECTION_ORDER].sort());
  });
});

describe('moveSection', () => {
  it('moves a section up or down one place', () => {
    expect(moveSection(['offers', 'shop', 'events'] as any, 'shop', -1).slice(0, 3)).toEqual(['shop', 'offers', 'events']);
    expect(moveSection(['offers', 'shop', 'events'] as any, 'shop', 1).slice(0, 3)).toEqual(['offers', 'events', 'shop']);
  });
  it('leaves the first section where it is when moved up, and the last when moved down', () => {
    const order = orderPageSections();
    expect(moveSection(order, order[0], -1)).toBe(order);
    expect(moveSection(order, order[order.length - 1], 1)).toBe(order);
  });
});

describe('serializeSectionOrder', () => {
  it('stores nothing for the default order, and the full order otherwise', () => {
    expect(serializeSectionOrder(orderPageSections())).toBe('');
    expect(serializeSectionOrder(orderPageSections('retreats'))).toBe(`retreats,${DEFAULT_SECTION_ORDER.filter((key) => key !== 'retreats').join(',')}`);
  });
  it('round-trips through the reader', () => {
    const order = moveSection(moveSection(orderPageSections(), 'retreats', -1), 'retreats', -1);
    expect(orderPageSections(serializeSectionOrder(order))).toEqual(order);
  });
});
