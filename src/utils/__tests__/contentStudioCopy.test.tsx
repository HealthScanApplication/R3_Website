// @vitest-environment jsdom
// The Content studio's default headline / subline / button follow the audience, problem and picked offer.
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../guardianImages', () => ({ imageStatus: vi.fn(() => new Promise(() => {})), connectOpenAI: vi.fn(), disconnectOpenAI: vi.fn(), generateImage: vi.fn(), priceLabel: () => '' }));
const { ContentStudio } = await import('../../components/guides/ContentStudio');

beforeAll(() => {
  // jsdom has no canvas or font loading: a no-op 2D context and fonts that never finish keep drawPost quiet.
  const noop: any = new Proxy(() => noop, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : noop), apply: () => noop });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => noop);
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: () => new Promise(() => {}) } });
});
afterEach(cleanup);

const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

describe('ContentStudio default copy', () => {
  it('changes with the offer and audience', () => {
    const props = { creator: 'Ana', siteUrl: '/guardians/ana', problem: 'Sleep' };
    const { rerender } = render(<ContentStudio {...props} audience="Women · 40–55 · Menopause" offers={[{ title: '7-day menopause sleep challenge for women', free: true }]} />);
    expect(value('Headline')).toBe('Sleep through menopause');
    expect(value('Subline')).toBe('7 nights. One evening routine.');
    expect(value('Button')).toBe('Join the challenge');
    rerender(<ContentStudio {...props} audience="Everyone" offers={[{ title: 'Evening wind-down', free: false }]} />);
    expect(value('Headline')).toBe('Sleep better tonight');
    expect(value('Subline')).toBe('One evening routine.');
    expect(value('Button')).toBe('Start the Protocol');
    expect(value('Headline')).not.toMatch(/Build a routine/);
  });
});

describe('ContentStudio brief chips', () => {
  it('link to the workspace tab where each part is edited, and the call to action opens its link', () => {
    const { container } = render(<ContentStudio creator="Ana" siteUrl="/guardians/ana" problem="Sleep" audience="Everyone" offers={[{ title: 'Evening wind-down', free: true }]} />);
    const href = (key: string) => container.querySelector(`a[data-brief-link="${key}"]`)?.getAttribute('href');
    expect(href('Creator')).toBe('/guardians/workspace?tab=profile');
    expect(href('Audience')).toBe('/guardians/workspace?tab=value_ramps');
    expect(href('Problem')).toBe('/guardians/workspace?tab=value_ramps');
    expect(href('Offer')).toBe('/guardians/workspace?tab=offer_builder');
    expect(href('Solution')).toBe('/guardians/workspace?tab=protocols');
    expect(href('CTA')).toMatch(/ana/);
    expect(container.querySelector('a[data-brief-link="CTA"]')?.getAttribute('target')).toBe('_blank');
  });
});
