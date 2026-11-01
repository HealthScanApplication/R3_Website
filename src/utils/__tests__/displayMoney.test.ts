import { describe, expect, it } from 'vitest';
import { convertCents, displayMoney, formatMoneyCents } from '../displayMoney';

// Rates against the euro, as the rate service returns them.
const RATES = { EUR: 1, AUD: 1.6, GBP: 0.85, USD: 1.1 };

describe('convertCents', () => {
  it('converts through the base: A$4,800 is €3,000', () => {
    expect(convertCents(480000, 'AUD', 'EUR', RATES)).toBe(300000);
    expect(convertCents(300000, 'EUR', 'GBP', RATES)).toBe(255000);
  });
  it('leaves the same currency alone and gives up without a rate', () => {
    expect(convertCents(123, 'AUD', 'AUD', null)).toBe(123);
    expect(convertCents(123, 'AUD', 'EUR', null)).toBeNull();
    expect(convertCents(123, 'AUD', 'XYZ', RATES)).toBeNull();
  });
});

describe('displayMoney', () => {
  it('shows the picked currency with ≈ when it has been converted', () => {
    const text = displayMoney(480000, 'AUD', { currency: 'EUR', locale: 'en' }, RATES);
    expect(text).toBe('≈ €3,000');
  });
  it('uses the picked language for the number format', () => {
    expect(displayMoney(480000, 'AUD', { currency: 'EUR', locale: 'de' }, RATES).replace(/\s/g, ' ')).toBe('≈ 3.000 €');
    expect(displayMoney(480000, 'AUD', { currency: 'EUR', locale: 'pl' }, RATES).replace(/\s/g, ' ')).toMatch(/^≈ 3\s?000 €$/);
  });
  it('shows the price as it is, in its own currency, when the pick matches or rates are missing', () => {
    expect(displayMoney(480000, 'AUD', { currency: 'AUD', locale: 'en' }, RATES)).toBe('A$4,800');
    expect(displayMoney(480000, 'AUD', { currency: 'EUR', locale: 'en' }, null)).toBe('A$4,800');
    expect(displayMoney(480000, 'AUD', null, RATES)).toBe('A$4,800');
  });
  it('shows pence only when there are some', () => {
    expect(formatMoneyCents(12000, 'GBP', 'en')).toBe('£120');
    expect(formatMoneyCents(12050, 'GBP', 'en')).toBe('£120.50');
  });
});
