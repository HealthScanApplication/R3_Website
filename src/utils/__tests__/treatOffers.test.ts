import { describe, expect, it } from 'vitest';
import { composeOfferDescription, formatMinutes, formatOfferPrice, groupByCategory, isTreatKind, parseOfferMeta } from '../treatOffers';

describe('parseOfferMeta / composeOfferDescription', () => {
  it('reads a category and minutes from the first line, with the text under it', () => {
    expect(parseOfferMeta('Facial · 60 min\nA non-invasive facial massage.')).toEqual({ category: 'Facial', minutes: 60, text: 'A non-invasive facial massage.' });
    expect(parseOfferMeta('Massage · 30 mins\nHead and neck.')).toMatchObject({ category: 'Massage', minutes: 30 });
    expect(parseOfferMeta('Lecture · 90 minutes\nFood as medicine.')).toMatchObject({ category: 'Lecture', minutes: 90 });
  });
  it('reads minutes alone, and leaves a plain description as plain text', () => {
    expect(parseOfferMeta('45 min\nSoak and massage.')).toEqual({ category: '', minutes: 45, text: 'Soak and massage.' });
    expect(parseOfferMeta('Just a sentence about the treat.')).toEqual({ category: '', minutes: null, text: 'Just a sentence about the treat.' });
    expect(parseOfferMeta('A sentence that ends properly.\nAnd another.')).toMatchObject({ category: '', minutes: null });
    expect(parseOfferMeta(null)).toEqual({ category: '', minutes: null, text: '' });
    expect(parseOfferMeta('')).toEqual({ category: '', minutes: null, text: '' });
  });
  it('round-trips', () => {
    const meta = { category: 'Therapeutic', minutes: 60, text: 'A hot, bicarb-soaked wrap.' };
    expect(parseOfferMeta(composeOfferDescription(meta))).toEqual(meta);
    expect(composeOfferDescription({ category: '', minutes: null, text: 'Plain.' })).toBe('Plain.');
    expect(composeOfferDescription({ category: 'Facial', minutes: null, text: 'No length.' })).toBe('Facial\nNo length.');
    expect(composeOfferDescription({ category: '', minutes: 30, text: '' })).toBe('30 min');
  });
});

describe('helpers', () => {
  it('formats minutes', () => {
    expect(formatMinutes(30)).toBe('30 min'); expect(formatMinutes(60)).toBe('1 hr'); expect(formatMinutes(90)).toBe('1 hr 30 min');
    expect(formatMinutes(null)).toBe(''); expect(formatMinutes(0)).toBe('');
  });
  it('formats a price in its own currency, and calls zero free', () => {
    expect(formatOfferPrice(13000, 'AUD', 'paid')).toMatch(/\$130$/);
    expect(formatOfferPrice(9550, 'AUD', 'paid')).toMatch(/95\.50$/);
    expect(formatOfferPrice(0, 'AUD', 'paid')).toBe('Free');
    expect(formatOfferPrice(5000, 'AUD', 'free')).toBe('Free');
    expect(formatOfferPrice(13000, 'NOT-A-CODE', 'paid')).toBe('130.00 NOT-A-CODE');
  });
  it('knows which kinds are treats and talks', () => {
    expect(isTreatKind('treat')).toBe(true); expect(isTreatKind('talk')).toBe(true);
    expect(isTreatKind('ebook')).toBe(false); expect(isTreatKind(null)).toBe(false);
  });
  it('groups by category in first-seen order, sorted by title within each', () => {
    const offers = [
      { id: '1', title: 'Swedish', description: 'Massage · 60 min\n.' },
      { id: '2', title: 'Gua Sha', description: 'Facial · 60 min\n.' },
      { id: '3', title: 'Hot Stone', description: 'Massage · 60 min\n.' },
      { id: '4', title: 'Mystery', description: null },
    ];
    const groups = groupByCategory(offers);
    expect(groups.map((g) => g.category)).toEqual(['Massage', 'Facial', '']);
    expect(groups[0].offers.map((o) => o.title)).toEqual(['Hot Stone', 'Swedish']);
  });
});
