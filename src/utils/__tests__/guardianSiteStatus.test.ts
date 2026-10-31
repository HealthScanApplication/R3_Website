import { describe, expect, it } from 'vitest';
import { sitePublishAction, siteStatus } from '../guardianSiteStatus';

describe('siteStatus for the profile site', () => {
  it.each([
    ['approved', 'published', 'Published', true],
    ['submitted', 'in_review', 'In review', false],
    ['paused', 'unpublished', 'Unpublished', false],
    ['draft', 'draft', 'Draft', false],
  ] as const)('%s -> %s', (stored, key, label, live) => {
    expect(siteStatus(stored)).toMatchObject({ key, label, live });
  });

  it('treats a profile that is not saved yet, or an unknown value, as a draft', () => {
    expect(siteStatus(null).key).toBe('draft');
    expect(siteStatus(undefined).key).toBe('draft');
    expect(siteStatus('weird' as never).key).toBe('draft');
  });
});

describe('siteStatus for the offer funnel', () => {
  it('is live only when the profile is approved and the offer path is published', () => {
    expect(siteStatus('approved', 'published')).toMatchObject({ key: 'published', live: true });
  });
  it('is a draft while the offer path is a draft, even on a live profile', () => {
    expect(siteStatus('approved', 'draft')).toMatchObject({ key: 'draft', label: 'Draft', live: false });
  });
  it('follows the profile when the profile is not live, even if the ramp row says published', () => {
    expect(siteStatus('submitted', 'published')).toMatchObject({ key: 'in_review', live: false });
    expect(siteStatus('paused', 'published')).toMatchObject({ key: 'unpublished', live: false });
    expect(siteStatus('draft', 'published')).toMatchObject({ key: 'draft', live: false });
    expect(siteStatus(null, 'published')).toMatchObject({ key: 'draft', live: false });
  });
  it('agrees with the profile site whenever both are published or both are not', () => {
    for (const stored of ['draft', 'submitted', 'approved', 'paused'] as const) {
      expect(siteStatus(stored, 'published').live).toBe(siteStatus(stored).live);
    }
  });
});

describe('sitePublishAction', () => {
  it('asks for a review until the profile is live', () => {
    for (const stored of ['draft', 'paused', null] as const) expect(sitePublishAction(stored).label).toBe('Request publish');
    expect(sitePublishAction('submitted').label).toBe('Resubmit for review');
  });
  it('updates the live site once approved', () => {
    expect(sitePublishAction('approved').label).toBe('Update live site');
  });
  it('uses no em dash in any text', () => {
    for (const stored of ['draft', 'submitted', 'approved', 'paused', null] as const) {
      const a = sitePublishAction(stored);
      expect(`${a.label}${a.busyLabel}${a.hint}${siteStatus(stored).label}`).not.toMatch(/—/);
    }
  });
});
