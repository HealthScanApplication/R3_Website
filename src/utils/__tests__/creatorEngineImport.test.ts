import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftFromCreatorExport, mayPublishExport, readCreatorExport, validateCreatorExport } from '../creatorEngineImport';

const sample = (name: string) => readFileSync(join(__dirname, 'fixtures', 'creator-engine', name), 'utf8');
const agreed = () => JSON.parse(sample('guardian-sample-agreed.json'));
const preview = () => JSON.parse(sample('guardian-sample-preview.json'));
const refuses = (file: unknown, pattern: RegExp) => { const result = validateCreatorExport(file); expect(result.ok).toBe(false); expect(result.ok ? [] : result.errors.join(' | ')).toMatch(pattern); };

describe('Creator Engine export, version 1 (against Creator Engine\'s own sample files)', () => {
  it('accepts the agreed sample and offers it for publishing', () => {
    const result = readCreatorExport(sample('guardian-sample-agreed.json'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.mode).toBe('publish');
    expect(result.draft.profile).toMatchObject({ handle: 'example_wellness', display_name: 'Example Wellness', niche: 'Gut health' });
    expect(result.draft.problems[0]).toMatchObject({ problem: 'Bloating after meals with no clear cause', sourceUrl: 'https://example.com/post/1', seen: 12 });
    expect(result.draft.products.map((product) => [product.title, product.price_cents, product.currency])).toEqual([['Example 4-week gut reset', 14900, 'USD'], ['Example free guide', null, null]]);
  });

  it('accepts the preview sample and keeps it private', () => {
    const result = readCreatorExport(sample('guardian-sample-preview.json'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.mode).toBe('preview');
    expect(result.draft.status).toBe('draft');
  });

  it('only a recorded yes can be published: not none, not replied, not agreed without a date', () => {
    for (const status of ['none', 'replied'] as const) {
      const file = { ...agreed(), consent: { status, at: '2026-10-31T09:30:00.000Z' } };
      const checked = validateCreatorExport(file);
      expect(checked.ok && mayPublishExport(checked.value)).toBe(false);
      expect(draftFromCreatorExport((checked as any).value).mode).toBe('preview');
    }
    refuses({ ...agreed(), consent: { status: 'agreed', at: null } }, /consent\.at is required/);
    expect(mayPublishExport(agreed())).toBe(true);
  });

  it('whatever the mode, anything built from it is a draft', () => {
    expect(draftFromCreatorExport(agreed()).status).toBe('draft');
    expect(draftFromCreatorExport(preview()).status).toBe('draft');
  });

  it('refuses any version but 1', () => {
    for (const version of [0, 2, '1', null, undefined]) refuses({ ...agreed(), version }, /Unknown version/);
  });

  it('refuses a field the contract does not define, including contact details', () => {
    refuses({ ...agreed(), creator: { ...agreed().creator, businessEmail: 'a@b.com' } }, /creator\.businessEmail is not part of version 1/);
    refuses({ ...agreed(), phone: '123' }, /file\.phone is not part of version 1/);
    refuses({ ...agreed(), products: [{ ...agreed().products[0], discountCode: 'X' }] }, /products\[0\]\.discountCode/);
  });

  it('refuses a problem without a quote, a page, or confirmation', () => {
    const base = agreed().problems[0];
    refuses({ ...agreed(), problems: [{ ...base, evidenceQuote: '' }] }, /no quote/);
    refuses({ ...agreed(), problems: [{ ...base, evidenceUrl: 'not a link' }] }, /no page/);
    refuses({ ...agreed(), problems: [{ ...base, confirmed: false }] }, /not confirmed/);
  });

  it('refuses a price without its currency (or a currency without a price), and a fractional price', () => {
    const product = agreed().products[0];
    refuses({ ...agreed(), products: [{ ...product, currency: null }] }, /both a price and a currency, or neither/);
    refuses({ ...agreed(), products: [{ ...product, priceCents: null }] }, /both a price and a currency, or neither/);
    refuses({ ...agreed(), products: [{ ...product, priceCents: 149.5 }] }, /whole cents/);
  });

  it('refuses text that is not JSON, and reports every problem in a bad file at once', () => {
    expect(readCreatorExport('{ nope')).toEqual({ ok: false, errors: ['The file is not valid JSON.'] });
    const file = { ...agreed(), exportedAt: 'never', creator: { ...agreed().creator, handle: '' } };
    const result = validateCreatorExport(file);
    expect(result.ok).toBe(false);
    expect(result.ok ? 0 : result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
