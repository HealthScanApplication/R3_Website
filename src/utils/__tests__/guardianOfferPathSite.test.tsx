// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { GuardianWebsite } from '../../components/guides/GuidePortal';

const CLIPS = JSON.stringify([{ id: 'c7rNVcYU_-s', start: 1980, end: 1988, zoom: 1.4 }]);
let socialExtras: Record<string, string> = {};
let offerBrand: string | null = null;
const PROFILE = { user_id: 'owner', slug: 'john-ferreira', display_name: 'John Ferreira', headline: 'Feel better in your everyday life.', bio: 'I help everyone with through protocol.', avatar_url: null, specialties: ['Sleep'], status: 'approved', onboarding_step: 5, contact_email: 'j@example.com', whatsapp_phone: '', commission_percent: 0,
  social_links: { audience_details: JSON.stringify({ Everyone: { min: 18, max: 80, stages: [] } }) } };
const OFFER = { id: 'o1', guide_id: 'owner', title: '7-day menopause sleep challenge for women', description: 'A free week to sleep through the night again.', kind: 'routine', access_model: 'free', status: 'published', price_cents: 0, currency: 'GBP', cover_url: null };
const RAMP = { id: 'r1', guide_id: 'owner', name: 'Better sleep', slug: 'better-sleep', audience: 'Women', problem: 'Sleep problems', offer_ids: ['o1'], status: 'published' };

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, accessToken: null, signOut: () => {}, loading: false }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfileBySlug: async () => ({ ...PROFILE, social_links: { ...PROFILE.social_links, ...socialExtras } }),
  listGuideOffers: async () => [{ ...OFFER, brand_id: offerBrand }],
  listPublicGuideBrands: async () => [{ id: 'b-personal', guide_id: 'owner', name: 'John Ferreira', kind: 'personal', slug: null, logo_url: null, website_url: '', social_links: {}, is_primary: true }, { id: 'b-calm', guide_id: 'owner', name: 'Calm Co', kind: 'business', slug: 'calm-co', logo_url: null, website_url: '', social_links: {}, is_primary: false }],
  listGuideValueRamps: async () => [RAMP],
}));

beforeEach(() => { socialExtras = {}; offerBrand = null; vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const visit = (path: string) => { window.history.replaceState({}, '', path); return render(<GuardianWebsite slug="john-ferreira" isSignedIn={false} />); };
const heroHeading = async () => (await screen.findAllByRole('heading', { level: 1 }))[0];

describe('an offer path is its own page', () => {
  it('the profile site speaks as the Guardian: their headline', async () => {
    visit('/guardians/john-ferreira');
    await waitFor(() => expect(screen.getAllByText('Feel better in your everyday life.').length).toBeGreaterThan(0));
    expect(document.body.textContent).not.toMatch(/Sleep problems/);
  });

  it('the offer path speaks about its own offer, audience and problem, not the profile headline', async () => {
    visit('/guardians/john-ferreira/value-ramp/better-sleep');
    expect((await heroHeading()).textContent).toMatch(/7-day menopause sleep challenge for women/i);
    expect(document.body.textContent).not.toMatch(/Feel better in your everyday life\./);
    expect(document.body.textContent).toMatch(/A free week to sleep through the night again\./);
    expect(document.body.textContent).toMatch(/Women/);
    expect(document.body.textContent).toMatch(/Sleep problems/);
    expect(document.body.textContent).not.toMatch(/I help everyone with through protocol/); // the Guardian's general bio is not this page's pitch
  });

  it('keeps the path\'s own offer even when that offer belongs to a brand', async () => {
    offerBrand = 'b-calm'; // the offer is Calm Co's: the path names it, so the path's page still shows it
    visit('/guardians/john-ferreira/value-ramp/better-sleep');
    expect((await heroHeading()).textContent).toMatch(/7-day menopause sleep challenge for women/i);
    expect(document.body.textContent).toMatch(/A free week to sleep through the night again\./);
  });

  it('an offer path that does not exist is not the profile page in disguise', async () => {
    visit('/guardians/john-ferreira/value-ramp/no-such-path');
    await waitFor(() => expect(document.body.textContent).not.toMatch(/Feel better in your everyday life\./));
  });
});

describe('the hero on the public page', () => {
  it('the sign-up button just says Follow', async () => {
    visit('/guardians/john-ferreira');
    expect(await screen.findByRole('button', { name: 'Follow' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /follow by email/i })).toBeNull();
  });

  it('puts glass and a vignette over a video clip background by default, and honours switching it off', async () => {
    socialExtras = { theme_background_clips: CLIPS };
    visit('/guardians/john-ferreira');
    await waitFor(() => expect(document.querySelector('[data-youtube-clip]')).toBeTruthy());
    expect(document.querySelector('[data-hero-glass]')).toBeTruthy();
    cleanup();
    socialExtras = { theme_background_clips: CLIPS, theme_glass: 'off' };
    visit('/guardians/john-ferreira');
    await waitFor(() => expect(document.querySelector('[data-youtube-clip]')).toBeTruthy());
    expect(document.querySelector('[data-hero-glass]')).toBeNull();
  });

  it('plays the Guardian type\'s clip behind the glass by default, and the Guardian can switch the glass off', async () => {
    visit('/guardians/john-ferreira');
    await waitFor(() => expect(screen.getAllByText('Feel better in your everyday life.').length).toBeGreaterThan(0));
    expect(document.querySelector('[data-type-video]')).toBeTruthy();
    expect(document.querySelector('[data-hero-glass]')).toBeTruthy();
    cleanup();
    socialExtras = { theme_glass: 'off' };
    visit('/guardians/john-ferreira');
    await waitFor(() => expect(document.querySelector('[data-type-video]')).toBeTruthy());
    expect(document.querySelector('[data-hero-glass]')).toBeNull();
  });
});

describe('the email section at the end of the page', () => {
  const emailSection = () => document.querySelector('[data-email-section]') as HTMLElement;
  it('is 80% of the screen tall, with its content centred', async () => {
    visit('/guardians/john-ferreira');
    await waitFor(() => expect(emailSection()).toBeTruthy());
    expect(emailSection().style.minHeight).toBe('80vh');
    expect(emailSection().style.justifyContent).toBe('center');
    // a plain profile starts on the same Guardian-type clip as the hero
    await waitFor(() => expect(emailSection().querySelector('[data-type-video]')).toBeTruthy());
  });

  it('has the hero\'s video and glass behind it, once it is near the screen, with light text over it', async () => {
    socialExtras = { theme_background_clips: CLIPS };
    visit('/guardians/john-ferreira');
    await waitFor(() => expect(emailSection()?.querySelector('[data-email-backdrop]')).toBeTruthy());
    const holder = emailSection().querySelector('[data-near-viewport]') as HTMLElement;
    expect(holder).toBeTruthy();
    // The test environment has no IntersectionObserver, so it mounts straight away, like an old browser would.
    await waitFor(() => expect(emailSection().querySelector('[data-youtube-clip]')).toBeTruthy());
    expect(emailSection().querySelector('[data-hero-glass]')).toBeTruthy();
    expect(emailSection().style.minHeight).toBe('80vh');
    const heading = within(emailSection()).getByRole('heading', { name: 'Get new guidance in your inbox.' });
    expect(heading).toBeTruthy();
    expect((within(emailSection()).getByText(/^Follow /) as HTMLElement).style.color).toMatch(/214, 231, 168|#D6E7A8/i); // light, not the dark green of the plain page
    // the form card sits above the backdrop
    expect(Number((emailSection().querySelector('form') as HTMLElement).closest('div[style*="z-index"]') ? 1 : 0)).toBe(1);
  });

  it('waits until it is near the screen before it starts a second video player', async () => {
    const observed: Array<() => void> = [];
    vi.stubGlobal('IntersectionObserver', class { constructor(private callback: (entries: Array<{ isIntersecting: boolean }>) => void) { observed.push(() => this.callback([{ isIntersecting: true }])); } observe() {} disconnect() {} });
    socialExtras = { theme_background_clips: CLIPS };
    visit('/guardians/john-ferreira');
    await waitFor(() => expect(emailSection()?.querySelector('[data-near-viewport]')).toBeTruthy());
    const holder = emailSection().querySelector('[data-near-viewport]') as HTMLElement;
    expect(holder.getAttribute('data-near-viewport')).toBe('false');
    expect(emailSection().querySelector('[data-youtube-clip]')).toBeNull(); // not yet
    observed.forEach((fire) => fire());
    await waitFor(() => expect(emailSection().querySelector('[data-youtube-clip]')).toBeTruthy());
  });
});
