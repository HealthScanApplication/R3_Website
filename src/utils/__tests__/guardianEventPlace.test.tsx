// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { GuardianWebsite } from '../../components/guides/GuidePortal';

const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const event = (id: string, title: string, venue: string | null, location: string | null, format = 'in_person') => ({ id, guide_id: 'owner', title, description: 'A talk.', start_at: future(30), end_at: null, timezone: 'UTC', venue, location, format, image_url: null, info_url: 'https://example.com/e', source_url: 'manual', source_name: null, status: 'published' });
const EVENTS = [
  event('e1', 'Dubai', 'Arjaan by Rotana, Dubai', 'Arjaan by Rotana, Dubai'),
  event('e2', 'Cape Town, South Africa', 'Rots Church, 25 Lelie Street, Protea Hoogte', 'Rots Church, 25 Lelie Street, Protea Hoogte'),
  event('e3', 'Live Q&A', 'Zoom', null, 'virtual'),
];
const PROFILE = { user_id: 'owner', slug: 'barbara-oneill', display_name: "Barbara O'Neill", headline: 'Natural wellness.', bio: 'Bio.', avatar_url: null, specialties: ['Wellness'], status: 'approved', onboarding_step: 5, contact_email: 'b@example.com', whatsapp_phone: '', commission_percent: 0, social_links: {} };

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, accessToken: null, signOut: () => {}, loading: false }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfileBySlug: async () => PROFILE,
  listGuideOffers: async () => [],
  listGuideValueRamps: async () => [],
  listGuideEvents: async () => EVENTS,
}));

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('event places', () => {
  it('shows the country flag in the place tag and a real map of the place', async () => {
    window.history.replaceState({}, '', '/guardians/barbara-oneill');
    render(<GuardianWebsite slug="barbara-oneill" isSignedIn={false} />);
    await waitFor(() => expect(document.querySelectorAll('[data-destination-header]').length).toBeGreaterThanOrEqual(3));
    const headers = [...document.querySelectorAll('[data-destination-header]')] as HTMLElement[];
    const dubai = headers.find((h) => /Arjaan by Rotana/.test(h.textContent || ''))!;
    expect(within(dubai).getByRole('img', { name: 'United Arab Emirates' }).textContent).toBe('🇦🇪');
    const dubaiMap = dubai.querySelector('iframe[data-place-map]') as HTMLIFrameElement;
    const dubaiUrl = new URL(dubaiMap.getAttribute('src')!);
    expect(dubaiUrl.hostname).toBe('maps.google.com');
    expect(dubaiUrl.searchParams.get('output')).toBe('embed'); // a real map, not a drawing
    expect(dubaiUrl.searchParams.get('q')).toBe('Arjaan by Rotana, Dubai');
    expect(dubaiMap.getAttribute('loading')).toBe('lazy');
    expect(dubaiMap.style.filter).not.toMatch(/invert/); // a light, quiet map, not the dark inverted one
    expect((dubai.querySelector('[data-destination-header]') || dubai).getAttribute('style') || '').not.toMatch(/202A21/);

    // The venue alone has no country: it comes from the title, and the map is asked for the whole address.
    const capeTown = headers.find((h) => /Rots Church/.test(h.textContent || ''))!;
    expect(within(capeTown).getByRole('img', { name: 'South Africa' }).textContent).toBe('🇿🇦');
    expect(new URL((capeTown.querySelector('iframe[data-place-map]') as HTMLIFrameElement).getAttribute('src')!).searchParams.get('q')).toMatch(/Rots Church.*Cape Town, South Africa|Cape Town, South Africa.*Rots Church/);
  });

  it('keeps the map to a plain picture: not interactive, and no name tag laid over it', async () => {
    window.history.replaceState({}, '', '/guardians/barbara-oneill');
    render(<GuardianWebsite slug="barbara-oneill" isSignedIn={false} />);
    await waitFor(() => expect(document.querySelectorAll('[data-destination-header] iframe[data-place-map]').length).toBeGreaterThanOrEqual(2));
    for (const header of [...document.querySelectorAll('[data-destination-header]')] as HTMLElement[]) {
      const map = header.querySelector('iframe[data-place-map]') as HTMLIFrameElement | null;
      if (map) expect(map.style.pointerEvents).toBe('none');
      expect(header.textContent).not.toMatch(/Barbara O'Neill/); // the logo badge says whose it is; no second label on the map
    }
  });

  it('an online event has no map and no flag', async () => {
    window.history.replaceState({}, '', '/guardians/barbara-oneill');
    render(<GuardianWebsite slug="barbara-oneill" isSignedIn={false} />);
    await waitFor(() => expect(document.querySelectorAll('[data-destination-header]').length).toBeGreaterThanOrEqual(3));
    const online = ([...document.querySelectorAll('[data-destination-header]')] as HTMLElement[]).find((h) => /Zoom/.test(h.textContent || ''))!;
    expect(online.querySelector('iframe[data-place-map]')).toBeNull();
    expect(online.querySelector('[data-place-flag]')).toBeNull();
  });
});
