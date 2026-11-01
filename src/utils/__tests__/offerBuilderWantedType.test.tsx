// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Workspace } from '../../components/guides/GuidePortal';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  listGuideLeads: async () => [], listGuideOffers: async () => [], listGuideProducts: async () => [], listGuideRecipes: async () => [], listGuideValueRamps: async () => [],
  listOfferRoutines: async () => ({}),
}));

afterEach(cleanup);
const profile = { id: 'owner', user_id: 'owner', slug: 'test-guide', display_name: 'Test Guide', specialties: [], social_links: {}, headline: 'x', status: 'published' } as any;

describe('the Offer builder opened from Upload your products', () => {
  it('picks out the type named in the link and does not create anything', async () => {
    window.history.replaceState({}, '', '/guardians/workspace?tab=offer_builder&type=course');
    render(<Workspace profile={profile} onProfile={() => {}} />);
    await waitFor(() => expect(document.querySelector('[data-offer-type="course"]')).toBeTruthy());
    expect(document.querySelector('[data-offer-type="course"]')?.getAttribute('data-offer-wanted')).toBe('true');
    expect(document.querySelector('[data-offer-type="ebook"]')?.getAttribute('data-offer-wanted')).toBeNull();
  });
  it('picks out nothing without a type', async () => {
    window.history.replaceState({}, '', '/guardians/workspace?tab=offer_builder');
    render(<Workspace profile={profile} onProfile={() => {}} />);
    await waitFor(() => expect(document.querySelector('[data-offer-type="course"]')).toBeTruthy());
    expect(document.querySelector('[data-offer-wanted="true"]')).toBeNull();
  });
});
