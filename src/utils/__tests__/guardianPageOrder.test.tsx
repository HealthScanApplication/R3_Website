// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Onboarding } from '../../components/guides/GuidePortal';

const mocks = vi.hoisted(() => ({ save: vi.fn(), brands: vi.fn(), profile: vi.fn(), listBrands: vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfile: async () => mocks.profile(),
  listGuideBrands: async () => mocks.listBrands(),
  saveGuideProfile: mocks.save,
  replaceGuideBrands: mocks.brands,
}));

beforeEach(() => {
  mocks.save.mockReset(); mocks.brands.mockReset(); mocks.profile.mockReset(); mocks.profile.mockReturnValue(null); mocks.listBrands.mockReset(); mocks.listBrands.mockReturnValue([]);
  mocks.save.mockImplementation(async (row: any) => ({ ...row }));
  mocks.brands.mockResolvedValue([]);
  window.history.replaceState({}, '', '/guardians/workspace?step=6');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const setup = () => render(<Onboarding userId="owner" accessToken="t" name="Test Guide" email="guide@example.com" accountAvatarUrl="https://lh3.example/p.jpg" onDone={() => {}} />);
const openOrder = async () => {
  fireEvent.click(await screen.findByRole('tab', { name: /Order$/ }, { timeout: 4000 }));
  return document.querySelector('[data-page-order]') as HTMLElement;
};
const rows = (panel: HTMLElement) => [...panel.querySelectorAll('[data-section-row]')].map((row) => row.getAttribute('data-section-row'));

describe('page section order in the site builder', () => {
  it('lists every section in the default order, hero and footer not among them', async () => {
    setup();
    const panel = await openOrder();
    expect(rows(panel)).toEqual(['offers', 'protocols', 'shop', 'events', 'talks', 'treats', 'forum', 'retreats', 'funnel', 'brands']);
    expect(within(panel).getByRole('button', { name: 'Move Offers up' }).hasAttribute('disabled')).toBe(true); // the first cannot go up
    expect(within(panel).getByRole('button', { name: 'Move Official brands down' }).hasAttribute('disabled')).toBe(true); // nor the last down
  });

  it('moves a section up and down, and resets', async () => {
    setup();
    const panel = await openOrder();
    fireEvent.click(within(panel).getByRole('button', { name: 'Move Retreats up' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Move Retreats up' }));
    expect(rows(panel).indexOf('retreats')).toBe(5);
    fireEvent.click(within(panel).getByRole('button', { name: 'Move Retreats down' }));
    expect(rows(panel).indexOf('retreats')).toBe(6);
    fireEvent.click(within(panel).getByRole('button', { name: 'Reset order' }));
    expect(rows(panel)).toEqual(['offers', 'protocols', 'shop', 'events', 'talks', 'treats', 'forum', 'retreats', 'funnel', 'brands']);
  });

  it('saves the chosen order with the page, and nothing when it is the default', async () => {
    setup();
    const panel = await openOrder();
    for (let i = 0; i < 7; i += 1) fireEvent.click(within(panel).getByRole('button', { name: 'Move Retreats up' }));
    expect(rows(panel)[0]).toBe('retreats');
    fireEvent.click(await screen.findByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0].social_links.section_order).toMatch(/^retreats,offers,protocols,shop,events/);
  });
});

const brand = (id: string, name: string, kind: 'personal' | 'business', links: Record<string, string> = {}) => ({ id, guide_id: 'owner', name, kind, slug: kind === 'personal' ? null : 'tre-lune', logo_url: null, contact_email: 'a@b.com', whatsapp_phone: '', website_url: '', social_links: links, language: 'English', pricing_region: 'Australia', currency: 'GBP', is_primary: kind === 'personal' });

describe('saving a brand keeps what it already has', () => {
  it('keeps the tagline, about text and background of a business brand, and its saved page order, when it is saved from the builder', async () => {
    mocks.profile.mockReturnValue({ user_id: 'owner', slug: 'test-guide', display_name: 'Test Guide', status: 'approved', onboarding_step: 6, social_links: {}, avatar_url: null, contact_email: 'g@example.com' });
    mocks.listBrands.mockReturnValue([brand('p', 'Test Guide', 'personal'), brand('0b1c2d3e-aaaa-bbbb-cccc-111122223333', 'Tre Lune', 'business', { headline: 'Natural hormonal support', bio: 'About Tre Lune', theme_background: 'https://x/bg.jpg', theme_background_type: 'image', section_order: 'retreats,events' })]);
    window.history.replaceState({}, '', '/guardians/workspace?step=1');
    setup();
    await screen.findByDisplayValue('Test Guide');
    fireEvent.click((await screen.findAllByRole('button', { name: /Tre Lune/ })).find((button) => button.getAttribute('aria-pressed') !== null && !button.closest('[data-brand-scope="circles"]') && /^TTre Lune$/.test(button.textContent || ''))!);
    await screen.findByDisplayValue('Tre Lune');
    await new Promise((resolve) => setTimeout(resolve, 30));
    fireEvent.click(within(screen.getByRole('region', { name: 'R3 house style profile image' })).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.brands).toHaveBeenCalled());
    const saved = mocks.brands.mock.calls[0][1] as Array<{ name: string; id?: string; social_links: Record<string, string> }>;
    const tre = saved.find((item) => item.name === 'Tre Lune')!;
    expect(tre.id).toBe('0b1c2d3e-aaaa-bbbb-cccc-111122223333'); // saved by id, so its content and page address stay with it
    expect(tre.social_links).toMatchObject({ headline: 'Natural hormonal support', bio: 'About Tre Lune', theme_background: 'https://x/bg.jpg', theme_background_type: 'image' });
    expect(tre.social_links.section_order).toMatch(/^retreats,events,/); // the saved order, written out in full
  });
});

describe('the email sign-up switch and the brands\' page addresses in the builder', () => {
  it('has a switch for the email sign-up at the bottom of the page, on by default, saved with the page', async () => {
    setup();
    const panel = await openOrder();
    const toggle = panel.querySelector('[data-email-capture-toggle] input') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0].social_links.email_capture).toBe('off');
  });

  it('saves nothing special when the sign-up is left on', async () => {
    setup();
    await openOrder();
    fireEvent.click(await screen.findByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0].social_links.email_capture).toBe('');
  });

  it('keeps a brand\'s page address on its site card after switching away from it and back', async () => {
    const TRE = '0b1c2d3e-aaaa-bbbb-cccc-111122223333';
    mocks.profile.mockReturnValue({ user_id: 'owner', slug: 'test-guide', display_name: 'Test Guide', status: 'approved', onboarding_step: 6, social_links: {}, avatar_url: null, contact_email: 'g@example.com' });
    mocks.listBrands.mockReturnValue([brand('p', 'Test Guide', 'personal'), brand(TRE, 'Tre Lune', 'business', {})]);
    window.history.replaceState({}, '', '/guardians/workspace?step=1');
    setup();
    await screen.findByDisplayValue('Test Guide');
    const chip = async (text: string) => (await screen.findAllByRole('button')).find((button) => button.getAttribute('aria-pressed') !== null && !button.closest('[data-brand-scope="circles"]') && button.textContent === text)!;
    await waitFor(() => expect(screen.getAllByText('/guardians/test-guide/tre-lune').length).toBeGreaterThan(0));
    fireEvent.click(await chip('TTre Lune')); // open the brand
    await screen.findByDisplayValue('Tre Lune');
    fireEvent.click(await chip('TTest Guide')); // and back to the personal one
    await screen.findByDisplayValue('Test Guide');
    expect(screen.getAllByText('/guardians/test-guide/tre-lune').length).toBeGreaterThan(0); // not the Guardian's own page
  });
});
