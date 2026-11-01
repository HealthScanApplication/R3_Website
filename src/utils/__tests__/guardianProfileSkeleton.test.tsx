// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GuardianWebsite } from '../../components/guides/GuidePortal';

vi.setConfig({ testTimeout: 30000 });
const state = vi.hoisted(() => ({
  owner: false,
  profile: { id: 'g1', user_id: 'g1', slug: 'test-guide', display_name: 'Test Guide', specialties: ['Sleep'], social_links: {}, headline: 'Sleep better', bio: 'Bio', status: 'approved' },
  offers: [] as any[], products: 0,
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: state.owner ? { id: 'g1', app_metadata: {} } : null, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfileBySlug: async () => state.profile, listGuideOffers: async () => state.offers, listGuideValueRamps: async () => [], listGuardianReviews: async () => [],
  listGuideEvents: async () => [], listGuideRetreats: async () => [], listGuideBrands: async () => [], getGuideEventSource: async () => null,
  listGuideProducts: async () => Array.from({ length: state.products }, (_, i) => ({ id: `p${i}`, guide_id: 'g1', title: `Product ${i}`, price_cents: 1000, currency: 'GBP', image_url: null, description: null })),
  listPublicGuideProfiles: async () => [],
}));
vi.mock('../protocolAdmin', async (importOriginal) => ({ ...await importOriginal<any>(), listPublicProtocols: async () => [] }));

const offer = (id: string, kind: string, title: string) => ({ id, guide_id: 'g1', kind, title, description: `${title} description`, price_cents: 2900, currency: 'GBP', access_model: 'paid', status: 'published', cover_url: null, affiliate_url: null, booking_url: null, file_path: null });
const tags = () => [...document.querySelectorAll('[data-hero-tag]')].map((tag) => `${tag.getAttribute('data-hero-tag')}:${tag.getAttribute('data-hero-tag-state')}`);
const open = async (owner: boolean) => { state.owner = owner; window.history.replaceState({}, '', '/guardians/test-guide'); render(<GuardianWebsite slug="test-guide" isSignedIn={owner} />); await screen.findAllByText('Sleep better'); };

beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); state.offers = []; state.products = 0; });

describe('a profile page skeleton with every section', () => {
  it('a visitor sees a tag only for sections that hold something, in value-ramp order', async () => {
    state.offers = [offer('1', 'course', 'Sleep course'), offer('2', 'ebook', 'Sleep guide'), offer('3', 'one_to_one_call', 'Intro call')];
    await open(false);
    await waitFor(() => expect(tags().length).toBeGreaterThan(0));
    expect(tags()).toEqual(['Guides:filled', 'Courses:filled', 'Sessions:filled']);
    expect(document.querySelector('[data-profile-skeleton]')).toBeNull();
  });

  it('the owner sees every section as a tag, dotted when empty, and a dotted placeholder for each empty one', async () => {
    state.offers = [offer('1', 'course', 'Sleep course')];
    await open(true);
    await waitFor(() => expect(tags().length).toBe(11));
    expect(tags().map((tag) => tag.split(':')[0])).toEqual(['Guides', 'Recipes', 'Protocols', 'Courses', 'Community', 'Sessions', 'Shop', 'Events', 'Talks', 'Treats', 'Retreats']);
    expect(tags().filter((tag) => tag.endsWith(':filled'))).toEqual(['Courses:filled']);
    const skeleton = document.querySelector('[data-profile-skeleton]') as HTMLElement;
    expect(skeleton).toBeTruthy();
    expect(skeleton.querySelectorAll('[data-skeleton-section]').length).toBe(10);
    expect(skeleton.querySelector('[data-skeleton-section="courses"]')).toBeNull(); // filled, so no placeholder
    expect(document.querySelector('[data-hero-tag="Guides"]')?.getAttribute('href')).toBe('#section-guides');
    expect(document.querySelector('[data-hero-tag="Courses"]')?.getAttribute('href')).toBe('#catalog');
  });

  it('adding a product of another type makes its section appear as a tag (shop products count too)', async () => {
    state.offers = [offer('1', 'community', 'Circle')];
    state.products = 3;
    await open(false);
    await waitFor(() => expect(tags().length).toBeGreaterThan(0));
    expect(tags()).toEqual(['Community:filled', 'Shop:filled']);
  });

  it('a tag for a catalog section opens that tab of the catalog', async () => {
    state.offers = [offer('1', 'course', 'Sleep course'), offer('2', 'ebook', 'Sleep guide')];
    await open(false);
    await screen.findByRole('tablist', { name: 'Offer categories' });
    fireEvent.click(document.querySelector('[data-hero-tag="Courses"]') as HTMLElement);
    await waitFor(() => expect(within(screen.getByRole('tablist', { name: 'Offer categories' })).getByRole('tab', { name: 'Programs' }).getAttribute('aria-selected')).toBe('true'));
  });
});
