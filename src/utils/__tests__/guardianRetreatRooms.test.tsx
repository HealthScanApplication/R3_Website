// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GuardianWebsite } from '../../components/guides/GuidePortal';

const room = (label: string, prices: [number, number][], note: string | null = null) => ({ label, note, currency: 'AUD', prices: prices.map(([guests, cents]) => ({ guests, cents })) });
const retreat = (id: string, title: string, options: unknown[] = []) => ({ id, guide_id: 'owner', title, description: 'A residential program.', location: 'Misty Mountain, Bellbrook NSW', image_url: null, booking_url: 'https://www.mmh.com.au/contact', source_url: 'https://www.mmh.com.au/our-program', source_external_id: id, status: 'published', options });
let RETREATS: any[] = [];
const PROFILE = { user_id: 'owner', slug: 'barbara-oneill', display_name: "Barbara O'Neill", headline: 'Hi', bio: 'Bio.', avatar_url: null, specialties: ['Wellness'], status: 'approved', onboarding_step: 5, contact_email: 'a@b.com', social_links: {} };

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, accessToken: null, signOut: () => {}, loading: false }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfileBySlug: async () => PROFILE,
  listGuideOffers: async () => [],
  listGuideValueRamps: async () => [],
  listGuideEvents: async () => [],
  listGuideRetreats: async () => RETREATS,
  listPublicGuideBrands: async () => [],
}));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response));
  RETREATS = [
    retreat('r8', '8 Day / 7 Night Lifestyle Program', [room('Lodge Room', [[1, 365000], [2, 585000], [3, 785000]], 'Shared bathroom.'), room('Family Unit', [[1, 550000], [2, 760000], [3, 990000], [4, 1200000]], 'Two bedrooms.')]),
    retreat('plain', 'Day Retreat'),
  ];
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const visit = () => { window.history.replaceState({}, '', '/guardians/barbara-oneill'); return render(<GuardianWebsite slug="barbara-oneill" isSignedIn={false} />); };
const card = async (title: string) => { await screen.findByRole('region', { name: "Barbara O'Neill's retreats" }); return ([...document.querySelectorAll('[data-retreat-card]')] as HTMLElement[]).find((el) => el.textContent!.includes(title))!; };

describe('retreat rooms as a dropdown', () => {
  it('offers the rooms of a programme as a choice on one card, priced for the first room and guest count', async () => {
    visit();
    const programme = await card('8 Day / 7 Night');
    const rooms = within(programme).getByLabelText(/Room for/) as HTMLSelectElement;
    expect([...rooms.options].map((option) => option.text)).toEqual(['Lodge Room', 'Family Unit']);
    expect(programme.querySelector('[data-room-price]')!.textContent).toMatch(/\$3,650/);
    expect(programme.querySelector('[data-room-price]')!.textContent).toMatch(/1 person · Lodge Room/);
    expect(programme.querySelector('[data-room-note]')!.textContent).toBe('Shared bathroom.');
  });

  it('changing the guests changes the price, and changing the room shows its own guest choices', async () => {
    visit();
    const programme = await card('8 Day / 7 Night');
    const guests = within(programme).getByLabelText(/Guests for/) as HTMLSelectElement;
    expect([...guests.options].map((option) => option.text)).toEqual(['1 person', '2 people', '3 people']);
    fireEvent.change(guests, { target: { value: '2' } });
    expect(programme.querySelector('[data-room-price]')!.textContent).toMatch(/\$5,850/);
    fireEvent.change(within(programme).getByLabelText(/Room for/), { target: { value: '1' } }); // Family Unit takes four
    expect([...(within(programme).getByLabelText(/Guests for/) as HTMLSelectElement).options].map((option) => option.text)).toEqual(['1 person', '2 people', '3 people', '4 people']);
    expect(programme.querySelector('[data-room-price]')!.textContent).toMatch(/\$5,500/); // back to one guest in the new room
    expect(programme.querySelector('[data-room-note]')!.textContent).toBe('Two bedrooms.');
    fireEvent.change(within(programme).getByLabelText(/Guests for/), { target: { value: '4' } });
    expect(programme.querySelector('[data-room-price]')!.textContent).toMatch(/\$12,000/);
  });

  it('a retreat with one price has no dropdown and keeps its "See package price" line', async () => {
    visit();
    const plain = await card('Day Retreat');
    expect(plain.querySelector('[data-retreat-rooms]')).toBeNull();
    expect(plain.textContent).toMatch(/See package price/);
  });
});
