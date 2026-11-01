// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Workspace } from '../../components/guides/GuidePortal';

vi.setConfig({ testTimeout: 30000 });
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: 'tok', signOut: () => {} }) }));
const store = vi.hoisted(() => {
  const row = (id: string, name: string, category: string) => ({ id, user_id: 'someone', name, description: `${name} description.`, category, total_days: 14, is_public: true, is_active: true, image_url: null, tags: [], creator: 'ROUTINE³' });
  return { profile: { id: 'owner', user_id: 'owner', slug: 'test-guide', display_name: 'Test Guide', specialties: [], social_links: {}, headline: 'Guidance', status: 'published' }, row, protocols: [] as ReturnType<typeof row>[] };
});
vi.mock('../../utils/guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  listGuideLeads: async () => [], listGuideRecipes: async () => [], listGuideOffers: async () => [], listGuideValueRamps: async () => [],
  listRoutineOwners: async () => new Map(), listPersonalProtocolPeople: async () => new Map(), getGuideProfileBySlug: async () => store.profile, listGuardianReviews: async () => [],
}));
vi.mock('../../utils/protocolAdmin', async (importOriginal) => ({ ...await importOriginal<any>(), listProtocols: async () => [], listPublicProtocols: async () => [...store.protocols] }));

beforeEach(() => {
  window.history.replaceState({}, '', '/guardians/workspace?tab=protocols');
  store.protocols = [store.row('p1', 'Morning wellness', 'Wellness'), store.row('p2', 'Evening wellness', 'Wellness'), store.row('p3', 'Daily mouth care', 'Hygiene'), store.row('p4', 'Strength block', 'Fitness'), store.row('p5', 'Meal plan', 'Diet')];
});
afterEach(cleanup);

describe('All public protocols', () => {
  it('is split into a section per type, with a count', async () => {
    render(<Workspace profile={store.profile as any} onProfile={() => {}} />);
    const all = await screen.findByRole('region', { name: 'Wellness protocols' });
    const sections = [...document.querySelectorAll('[data-protocol-theme]')].map((section) => section.getAttribute('data-protocol-theme'));
    expect(sections).toEqual(['Diet', 'Fitness', 'Hygiene', 'Wellness']);
    expect(within(all).getByText('2 Protocols')).toBeTruthy();
    expect(within(all).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(expect.arrayContaining(['Wellness', 'Morning wellness', 'Evening wellness']));
  });

  it('has a filter by type that narrows the list and goes back to All', async () => {
    render(<Workspace profile={store.profile as any} onProfile={() => {}} />);
    const filter = await screen.findByRole('group', { name: 'Filter public protocols by type' });
    expect(within(filter).getAllByRole('button').map((button) => button.textContent)).toEqual(['All · 5', 'Diet · 1', 'Fitness · 1', 'Hygiene · 1', 'Wellness · 2']);
    fireEvent.click(within(filter).getByRole('button', { name: 'Hygiene · 1' }));
    await waitFor(() => expect([...document.querySelectorAll('[data-protocol-theme]')].map((section) => section.getAttribute('data-protocol-theme'))).toEqual(['Hygiene']));
    expect(screen.getByRole('heading', { level: 3, name: 'Daily mouth care' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: 'Strength block' })).toBeNull();
    fireEvent.click(within(filter).getByRole('button', { name: 'All · 5' }));
    await waitFor(() => expect(document.querySelectorAll('[data-protocol-theme]').length).toBe(4));
  });
});
