// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { GuardianWebsite } from '../../components/guides/GuidePortal';

const PROFILE = { user_id: 'owner', slug: 'john-ferreira', display_name: 'John Ferreira', headline: 'Feel better in your everyday life.', bio: 'I help everyone with through protocol.', avatar_url: null, specialties: ['Sleep'], status: 'approved', onboarding_step: 5, contact_email: 'j@example.com', whatsapp_phone: '', commission_percent: 0,
  social_links: { audience_details: JSON.stringify({ Everyone: { min: 18, max: 80, stages: [] } }) } };
const OFFER = { id: 'o1', guide_id: 'owner', title: '7-day menopause sleep challenge for women', description: 'A free week to sleep through the night again.', kind: 'routine', access_model: 'free', status: 'published', price_cents: 0, currency: 'GBP', cover_url: null };
const RAMP = { id: 'r1', guide_id: 'owner', name: 'Better sleep', slug: 'better-sleep', audience: 'Women', problem: 'Sleep problems', offer_ids: ['o1'], status: 'published' };

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, accessToken: null, signOut: () => {}, loading: false }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfileBySlug: async () => PROFILE,
  listGuideOffers: async () => [OFFER],
  listGuideValueRamps: async () => [RAMP],
}));

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response)); });
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

  it('an offer path that does not exist is not the profile page in disguise', async () => {
    visit('/guardians/john-ferreira/value-ramp/no-such-path');
    await waitFor(() => expect(document.body.textContent).not.toMatch(/Feel better in your everyday life\./));
  });
});
