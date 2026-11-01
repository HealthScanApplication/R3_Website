// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { GuardianWebsite } from '../../components/guides/GuidePortal';
import { brandSitePath, brandSiteProfile, brandSlugFromPath, savedBrandId, savedBrandMoves, siteOwns } from '../brandSite';

const treat = (id: string, title: string, brand_id: string | null) => ({ id, guide_id: 'owner', kind: 'treat', title, description: 'Massage · 60 min\nA treat.', cover_url: null, price_cents: 13000, currency: 'AUD', affiliate_url: null, access_model: 'paid', file_path: null, booking_url: null, status: 'published', brand_id });
const PROFILE = { user_id: 'owner', slug: 'barbara-oneill', display_name: "Barbara O'Neill", headline: 'Self Heal by Design', bio: 'Her bio.', avatar_url: 'https://x/barbara.jpg', specialties: ['Wellness'], status: 'approved', onboarding_step: 5, contact_email: 'barbara@example.com', social_links: { instagram: 'https://instagram.com/barbara' } };
const BRANDS = [
  { id: 'b-personal', guide_id: 'owner', name: "Barbara O'Neill", kind: 'personal', slug: null, logo_url: null, website_url: '', social_links: {}, is_primary: true },
  { id: 'b-tre', guide_id: 'owner', name: 'Tre Lune', kind: 'business', slug: 'tre-lune', logo_url: 'https://x/logo-mono-1.png', website_url: 'https://www.trelune.com.au/', social_links: { headline: 'Natural hormonal support', instagram: 'https://instagram.com/trelune_' }, is_primary: false },
  { id: 'b-mmh', guide_id: 'owner', name: 'Misty Mountain Lifestyle Retreat', kind: 'business', slug: 'misty-mountain', logo_url: null, website_url: 'https://www.mmh.com.au/', social_links: {}, is_primary: false },
];
const OFFERS = [treat('t1', 'Personal Treat', null), treat('t2', 'Tre Lune Treat', 'b-tre'), treat('t3', 'Misty Treat', 'b-mmh')];

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, accessToken: null, signOut: () => {}, loading: false }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfileBySlug: async () => PROFILE,
  listGuideOffers: async () => OFFERS,
  listGuideValueRamps: async () => [],
  listPublicGuideBrands: async () => BRANDS,
}));

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const visit = (path: string, brandSlug?: string) => { window.history.replaceState({}, '', path); return render(<GuardianWebsite slug="barbara-oneill" brandSlug={brandSlug} isSignedIn={false} />); };

describe('brand page helpers', () => {
  it('reads a brand page from the address, and leaves the other sub-pages alone', () => {
    expect(brandSlugFromPath('/guardians/barbara-oneill/tre-lune')).toEqual({ guardian: 'barbara-oneill', brand: 'tre-lune' });
    expect(brandSlugFromPath('/guardians/barbara-oneill/tre-lune/')).toEqual({ guardian: 'barbara-oneill', brand: 'tre-lune' });
    expect(brandSlugFromPath('/guardians/barbara-oneill')).toBeNull();
    expect(brandSlugFromPath('/guardians/workspace')).toBeNull();
    expect(brandSlugFromPath('/guardians/barbara-oneill/community')).toBeNull();
    expect(brandSlugFromPath('/guardians/barbara-oneill/value-ramp')).toBeNull();
  });
  it('gives each brand its own address and the personal brand the Guardian\'s', () => {
    expect(brandSitePath('barbara-oneill', BRANDS[1] as any)).toBe('/guardians/barbara-oneill/tre-lune');
    expect(brandSitePath('barbara-oneill', BRANDS[0] as any)).toBe('/guardians/barbara-oneill');
    expect(brandSitePath('barbara-oneill', null)).toBe('/guardians/barbara-oneill');
  });
  it('shows a brand page its own content and the personal page what has no brand', () => {
    expect(siteOwns('b-tre', 'b-personal', 'b-tre')).toBe(true);
    expect(siteOwns('b-tre', 'b-personal', null)).toBe(false);
    expect(siteOwns(undefined, 'b-personal', null)).toBe(true);
    expect(siteOwns(undefined, 'b-personal', 'b-personal')).toBe(true);
    expect(siteOwns(undefined, 'b-personal', 'b-tre')).toBe(false);
  });
  it('puts the brand\'s name, logo, tagline and links over the Guardian\'s, keeping the rest', () => {
    const profile = brandSiteProfile(PROFILE as any, BRANDS[1] as any)!;
    expect(profile).toMatchObject({ display_name: 'Tre Lune', avatar_url: 'https://x/logo-mono-1.png', headline: 'Natural hormonal support', contact_email: 'barbara@example.com', user_id: 'owner', slug: 'barbara-oneill' });
    expect(profile.social_links).toMatchObject({ instagram: 'https://instagram.com/trelune_', website: 'https://www.trelune.com.au/' });
    expect(brandSiteProfile(PROFILE as any, BRANDS[0] as any)).toBe(PROFILE);
  });
});

describe('brands added this session get their saved ids after a save', () => {
  it('reads a saved id from a local id', () => {
    expect(savedBrandId('brand-0b1c2d3e-aaaa-bbbb-cccc-111122223333')).toBe('0b1c2d3e-aaaa-bbbb-cccc-111122223333');
    expect(savedBrandId('brand-1730000000000')).toBeUndefined();
    expect(savedBrandId('personal')).toBeUndefined();
  });
  it('moves a temporary local id to the saved one (with its page address) and leaves saved and personal brands alone', () => {
    const drafts = [
      { localId: 'personal', name: "Barbara O'Neill", kind: 'personal' },
      { localId: 'brand-1730000000000', name: 'Tre Lune', kind: 'business' },
      { localId: 'brand-0b1c2d3e-aaaa-bbbb-cccc-111122223333', name: 'Misty Mountain', kind: 'business' },
    ];
    const saved = [{ id: 'p', name: "Barbara O'Neill", kind: 'personal', slug: null }, { id: 'new-id', name: 'tre lune ', kind: 'business', slug: 'tre-lune' }, { id: '0b1c2d3e-aaaa-bbbb-cccc-111122223333', name: 'Misty Mountain', kind: 'business', slug: 'misty-mountain' }] as any;
    const moves = savedBrandMoves(drafts, saved);
    expect([...moves.entries()]).toEqual([['brand-1730000000000', { localId: 'brand-new-id', slug: 'tre-lune' }]]);
  });
});

describe('the public page of each brand', () => {
  it('the Guardian\'s own page shows only what has no brand', async () => {
    visit('/guardians/barbara-oneill');
    const section = await screen.findByRole('region', { name: "Barbara O'Neill's treats" });
    expect(within(section).getByText('Personal Treat')).toBeTruthy();
    expect(within(section).queryByText('Tre Lune Treat')).toBeNull();
    expect(within(section).queryByText('Misty Treat')).toBeNull();
  });

  it('a brand\'s page carries its name and shows only its own content', async () => {
    visit('/guardians/barbara-oneill/tre-lune', 'tre-lune');
    const section = await screen.findByRole('region', { name: "Tre Lune's treats" });
    expect(within(section).getByText('Tre Lune Treat')).toBeTruthy();
    expect(within(section).queryByText('Personal Treat')).toBeNull();
    expect(within(section).queryByText('Misty Treat')).toBeNull();
    expect(screen.queryByRole('region', { name: "Barbara O'Neill's treats" })).toBeNull();
  });

  it('an address that is not one of the Guardian\'s brands is a page that is not published', async () => {
    visit('/guardians/barbara-oneill/nothing-here', 'nothing-here');
    expect(await screen.findByText('This page is not published yet.')).toBeTruthy();
  });
});
