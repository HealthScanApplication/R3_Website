// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GuardianWebsite } from '../../components/guides/GuidePortal';
import { resetRates } from '../../utils/displayMoney';

const room = (label: string, prices: [number, number][], note: string | null = null) => ({ label, note, currency: 'AUD', prices: prices.map(([guests, cents]) => ({ guests, cents })) });
const retreat = (id: string, title: string, options: unknown[] = []) => ({ id, guide_id: 'owner', title, description: 'A residential program.', location: 'Misty Mountain, Bellbrook NSW', image_url: null, booking_url: 'https://www.mmh.com.au/contact', source_url: 'https://www.mmh.com.au/our-program', source_external_id: id, status: 'published', options });
let RETREATS: any[] = [];
let EVENTS: any[] = [];
const session = (id: string, title: string, start: string, end: string) => ({ id, guide_id: 'owner', title, description: null, start_at: start, end_at: end, timezone: 'Australia/Sydney', venue: null, location: 'Bellbrook NSW', format: 'in_person', image_url: null, info_url: 'https://www.mmh.com.au/our-program', source_url: 'https://www.mmh.com.au/our-program', source_name: null, source_external_id: id, status: 'published', brand_id: null });
const PROFILE = { user_id: 'owner', slug: 'barbara-oneill', display_name: "Barbara O'Neill", headline: 'Hi', bio: 'Bio.', avatar_url: null, specialties: ['Wellness'], status: 'approved', onboarding_step: 5, contact_email: 'a@b.com', social_links: {} };

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, accessToken: null, signOut: () => {}, loading: false }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfileBySlug: async () => PROFILE,
  listGuideOffers: async () => [],
  listGuideValueRamps: async () => [],
  listGuideEvents: async () => EVENTS,
  listGuideRetreats: async () => RETREATS,
  listPublicGuideBrands: async () => [],
}));

beforeEach(() => {
  EVENTS = [session('s1', '8 Day / 7 Night Lifestyle Program', '2099-03-04T13:00:00.000Z', '2099-03-11T13:00:00.000Z'), session('s2', 'Spring Talk', '2099-04-01T13:00:00.000Z', '2099-04-01T13:00:00.000Z')];
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response));
  RETREATS = [
    retreat('r8', '8 Day / 7 Night Lifestyle Program', [room('Lodge Room', [[1, 365000], [2, 585000], [3, 785000]], 'Shared bathroom.'), room('Family Unit', [[1, 550000], [2, 760000], [3, 990000], [4, 1200000]], 'Two bedrooms.')]),
    retreat('plain', 'Day Retreat'),
  ];
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const visit = () => { window.history.replaceState({}, '', '/guardians/barbara-oneill'); return render(<GuardianWebsite slug="barbara-oneill" isSignedIn={false} />); };
const card = async (title: string) => { await screen.findByRole('region', { name: "Barbara O'Neill's retreats" }); return ([...document.querySelectorAll('[data-retreat-card]')] as HTMLElement[]).find((el) => el.textContent!.includes(title))!; };

describe('retreat cards', () => {
  it('sit two across', async () => {
    visit();
    await card('Day Retreat');
    expect((document.querySelector('.g-retreats-grid') as HTMLElement).style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
  });
});

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

describe('rooms on the upcoming sessions', () => {
  const eventCard = async (title: string) => { const region = await screen.findByRole('region', { name: "Barbara O'Neill's events" }); return ([...region.querySelectorAll('article')] as HTMLElement[]).find((el) => el.textContent!.includes(title))!; };

  it('a session of a programme offers that programme\'s rooms and prices the choice', async () => {
    visit();
    const sessionCard = await eventCard('8 Day / 7 Night');
    const rooms = within(sessionCard).getByLabelText(/Room for/) as HTMLSelectElement;
    expect([...rooms.options].map((option) => option.text)).toEqual(['Lodge Room', 'Family Unit']);
    expect(sessionCard.querySelector('[data-room-price]')!.textContent).toMatch(/\$3,650/);
    fireEvent.change(within(sessionCard).getByLabelText(/Guests for/), { target: { value: '3' } });
    expect(sessionCard.querySelector('[data-room-price]')!.textContent).toMatch(/\$7,850/);
    fireEvent.change(rooms, { target: { value: '1' } });
    expect(sessionCard.querySelector('[data-room-price]')!.textContent).toMatch(/\$5,500/); // the new room, one guest again
  });

  it('keeps each session\'s choice to itself, and gives an event with no programme no dropdown', async () => {
    EVENTS = [session('s1', '8 Day / 7 Night Lifestyle Program', '2099-03-04T13:00:00.000Z', '2099-03-11T13:00:00.000Z'), session('s3', '8 Day / 7 Night Lifestyle Program', '2099-03-18T13:00:00.000Z', '2099-03-25T13:00:00.000Z'), session('s2', 'Spring Talk', '2099-04-01T13:00:00.000Z', '2099-04-01T13:00:00.000Z')];
    visit();
    const region = await screen.findByRole('region', { name: "Barbara O'Neill's events" });
    const sessions = ([...region.querySelectorAll('article')] as HTMLElement[]).filter((el) => el.textContent!.includes('8 Day / 7 Night'));
    expect(sessions).toHaveLength(2);
    fireEvent.change(within(sessions[0]).getByLabelText(/Room for/), { target: { value: '1' } });
    expect(sessions[0].querySelector('[data-room-price]')!.textContent).toMatch(/Family Unit/);
    expect(sessions[1].querySelector('[data-room-price]')!.textContent).toMatch(/Lodge Room/); // the other session is untouched
    const talk = ([...region.querySelectorAll('article')] as HTMLElement[]).find((el) => el.textContent!.includes('Spring Talk'))!;
    expect(talk.querySelector('[data-retreat-rooms]')).toBeNull();
    expect(talk.textContent).toMatch(/See booking price/);
  });
});

describe('prices follow the region, language and currency picker', () => {
  const RATES = { AUD: 1.6, GBP: 0.85, USD: 1.1 };
  const pick = (currency: string, locale = 'en') => localStorage.setItem('r3-store-locale', JSON.stringify({ region: 'Europe', locale, currency }));
  beforeEach(() => {
    resetRates(); localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (input: any) => (String(input).includes('frankfurter')
      ? ({ ok: true, status: 200, json: async () => ({ rates: RATES }) } as Response)
      : ({ ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response))));
  });
  afterEach(() => localStorage.clear());

  it('shows a room in the picked currency, marked as converted, and updates when the picker changes', async () => {
    pick('EUR');
    visit();
    const programme = await card('8 Day / 7 Night');
    await waitFor(() => expect(programme.querySelector('[data-room-price]')!.textContent).toMatch(/≈ €2,281/)); // A$3,650 at 1.6 per euro
    const display = screen.getByLabelText('Display currency') as HTMLSelectElement;
    fireEvent.change(display, { target: { value: 'USD' } });
    await waitFor(() => expect(programme.querySelector('[data-room-price]')!.textContent).toMatch(/≈ \$2,509/));
    fireEvent.change(display, { target: { value: 'AUD' } });
    await waitFor(() => expect(programme.querySelector('[data-room-price]')!.textContent).toMatch(/A\$3,650/)); // back to the price it is sold at
    expect(programme.querySelector('[data-room-price]')!.textContent).not.toMatch(/≈/);
  });

  it('follows the language for the number format, and the session cards too', async () => {
    pick('EUR', 'de');
    visit();
    const region = await screen.findByRole('region', { name: "Barbara O'Neill's events" });
    await waitFor(() => expect(region.querySelector('[data-room-price]')!.textContent!.replace(/\s/g, ' ')).toMatch(/≈ 2\.281,25 €/));
  });

  it('shows the price as it is when the rates cannot be fetched', async () => {
    pick('EUR');
    vi.stubGlobal('fetch', vi.fn(async (input: any) => { if (String(input).includes('frankfurter')) throw new Error('offline'); return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response; }));
    visit();
    const programme = await card('8 Day / 7 Night');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(programme.querySelector('[data-room-price]')!.textContent).toMatch(/A\$3,650/);
  });
});

describe('dates dropdown on a retreat programme', () => {
  afterEach(() => localStorage.clear());
  const programme = '8 Day / 7 Night Lifestyle Program';
  beforeEach(() => {
    localStorage.setItem('r3-store-locale', JSON.stringify({ region: 'United Kingdom', locale: 'en-GB', currency: 'AUD' })); // day-month order, and no conversion
    EVENTS = [
      session('old', programme, '2020-03-01T13:00:00.000Z', '2020-03-08T13:00:00.000Z'), // already over
      session('b', programme, '2100-01-14T13:00:00.000Z', '2100-01-21T13:00:00.000Z'),
      session('a', programme, '2099-03-04T13:00:00.000Z', '2099-03-11T13:00:00.000Z'),
      session('talk', 'Spring Talk', '2099-04-01T13:00:00.000Z', '2099-04-01T13:00:00.000Z'),
    ];
  });

  it('lists the programme\'s coming sessions, soonest first and grouped by year, and not the ones already over', async () => {
    visit();
    const programmeCard = await card(programme);
    const dates = within(programmeCard).getByLabelText(/Dates for/) as HTMLSelectElement;
    expect([...dates.options].map((option) => option.text)).toEqual(['5 Mar – 12 Mar 2099', '15 Jan – 22 Jan 2100']);
    expect([...dates.querySelectorAll('optgroup')].map((group) => group.label)).toEqual(['2099', '2100']);
    expect(dates.selectedIndex).toBe(0);
  });

  it('shows the chosen dates beside the price', async () => {
    visit();
    const programmeCard = await card(programme);
    expect(programmeCard.querySelector('[data-room-price]')!.textContent).toMatch(/Lodge Room · 5 Mar – 12 Mar 2099/);
    fireEvent.change(within(programmeCard).getByLabelText(/Dates for/), { target: { value: '1' } });
    expect(programmeCard.querySelector('[data-room-price]')!.textContent).toMatch(/Lodge Room · 15 Jan – 22 Jan 2100/);
    fireEvent.change(within(programmeCard).getByLabelText(/Guests for/), { target: { value: '2' } }); // the room choice is independent
    expect(programmeCard.querySelector('[data-room-price]')!.textContent).toMatch(/2 people · Lodge Room · 15 Jan/);
  });

  it('reads the dates in the page\'s chosen language', async () => {
    localStorage.setItem('r3-store-locale', JSON.stringify({ region: 'Germany', locale: 'de', currency: 'AUD' }));
    visit();
    const programmeCard = await card(programme);
    expect([...(within(programmeCard).getByLabelText(/Dates for/) as HTMLSelectElement).options][0].text).toMatch(/5\. März – 12\. März 2099/);
  });

  it('has no dates dropdown for a retreat with no sessions', async () => {
    visit();
    const plain = await card('Day Retreat');
    expect(plain.querySelector('[data-retreat-dates]')).toBeNull();
  });
});
