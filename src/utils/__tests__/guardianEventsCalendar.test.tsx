// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GuardianWebsite } from '../../components/guides/GuidePortal';

const event = (id: string, title: string, start: string, end: string | null = null) => ({ id, guide_id: 'owner', title, description: null, start_at: start, end_at: end, timezone: 'Australia/Sydney', venue: null, location: 'Bellbrook NSW', format: 'in_person', image_url: null, info_url: null, source_url: 'manual', source_name: null, source_external_id: id, status: 'published', brand_id: null });
// Sydney is UTC+11 in March: 05 Mar 00:00 there is 04 Mar 13:00 UTC.
const SYD = (day: number, month = 3) => `2099-${String(month).padStart(2, '0')}-${String(day - 1).padStart(2, '0')}T13:00:00.000Z`;
let EVENTS: any[] = [];
const PROFILE = { user_id: 'owner', slug: 'barbara-oneill', display_name: "Barbara O'Neill", headline: 'Hi', bio: 'Bio.', avatar_url: null, specialties: ['Wellness'], status: 'approved', onboarding_step: 5, contact_email: 'a@b.com', social_links: {} };

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, accessToken: null, signOut: () => {}, loading: false }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfileBySlug: async () => PROFILE,
  listGuideOffers: async () => [],
  listGuideValueRamps: async () => [],
  listGuideEvents: async () => EVENTS,
  listPublicGuideBrands: async () => [],
}));

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const visit = () => { window.history.replaceState({}, '', '/guardians/barbara-oneill'); return render(<GuardianWebsite slug="barbara-oneill" isSignedIn={false} />); };
const section = () => screen.findByRole('region', { name: "Barbara O'Neill's events" });
const cards = (root: HTMLElement) => [...root.querySelectorAll('article')].map((card) => /Weekend|Retreat|Workshop|Talk|Program/.exec(card.textContent || '')?.[0] + ':' + (card.textContent || '').match(/(\d+) ([A-Z]{3}) 2099/)?.[0]);
const day = (root: HTMLElement, key: string) => root.querySelector(`[data-day="${key}"]`) as HTMLButtonElement;

describe('events calendar', () => {
  beforeEach(() => {
    EVENTS = [
      event('a', 'Garden Workshop', SYD(5)),               // 5 Mar, one day
      event('b', 'Lifestyle Retreat', SYD(5), SYD(12)),    // 5 to 12 Mar
      event('c', 'Spring Talk', SYD(2, 4)),                // 2 Apr
    ];
  });

  it('opens on the first month with events and marks the days they start and the days they are under way', async () => {
    visit();
    const root = await section();
    const calendar = root.querySelector('[data-events-calendar]') as HTMLElement;
    expect(calendar.querySelector('[role=heading]')!.textContent).toMatch(/March 2099/);
    expect(day(root, '2099-03-05').getAttribute('data-has-event')).toBe('true');
    expect(day(root, '2099-03-05').getAttribute('aria-label')).toMatch(/2 events/); // two start there
    expect(day(root, '2099-03-09').getAttribute('data-has-event')).toBe('true'); // the retreat is under way
    expect(day(root, '2099-03-09').getAttribute('aria-label')).toMatch(/1 event/);
    expect(day(root, '2099-03-13').getAttribute('data-has-event')).toBeNull(); // nothing on
    expect(day(root, '2099-03-13').getAttribute('aria-label')).toMatch(/no events/);
  });

  it('choosing a day shows only the cards that fit, a second day makes a range, and Clear brings everything back', async () => {
    visit();
    const root = await section();
    expect(root.querySelectorAll('article').length).toBe(3);
    fireEvent.click(day(root, '2099-03-09')); // only the week-long retreat is on
    expect(root.querySelectorAll('article').length).toBe(1);
    expect(root.querySelector('article')!.textContent).toMatch(/Lifestyle Retreat/);
    expect(root.querySelector('[data-events-count]')!.textContent).toMatch(/1 of 3 events fit your dates/);
    fireEvent.click(day(root, '2099-03-05')); // 5 to 9 Mar: all of March's events
    expect(root.querySelectorAll('article').length).toBe(2);
    expect(day(root, '2099-03-07').getAttribute('aria-pressed')).toBe('true'); // the range is highlighted
    fireEvent.click(within(root).getByRole('button', { name: 'Clear dates' }));
    expect(root.querySelectorAll('article').length).toBe(3);
    expect(root.querySelector('[data-calendar-range]')).toBeNull();
  });

  it('moves between months within the events\' span, and picks a day in another month', async () => {
    visit();
    const root = await section();
    const prev = within(root).getByRole('button', { name: 'Previous month' }) as HTMLButtonElement;
    const next = within(root).getByRole('button', { name: 'Next month' }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true); // nothing before March
    fireEvent.click(next);
    expect(root.querySelector('[data-events-calendar] [role=heading]')!.textContent).toMatch(/April 2099/);
    expect(next.disabled).toBe(true); // nothing after April
    fireEvent.click(day(root, '2099-04-02'));
    expect(root.querySelectorAll('article').length).toBe(1);
    expect(root.querySelector('article')!.textContent).toMatch(/Spring Talk/);
  });

  it('says so when nothing is on for the chosen dates, and offers to clear them', async () => {
    visit();
    const root = await section();
    fireEvent.click(day(root, '2099-03-20'));
    expect(root.querySelectorAll('article').length).toBe(0);
    expect(within(root).getByText(/Nothing is on for those dates/)).toBeTruthy();
    fireEvent.click(within(root).getAllByRole('button', { name: /clear/i })[0]);
    expect(root.querySelectorAll('article').length).toBe(3);
  });

  it('shows every upcoming event when no dates are chosen, as before', async () => {
    EVENTS = Array.from({ length: 14 }, (_, i) => event(`e${i}`, `Weekend ${i + 1}`, SYD(i + 2)));
    visit();
    const root = await section();
    expect(root.querySelectorAll('article').length).toBe(14);
    expect(root.querySelector('[data-show-all-events]')).toBeNull();
  });

  it('re-opens on the first month of a different set of events', async () => {
    const { EventsCalendar } = await import('../../components/guides/EventsCalendar');
    const first = [{ id: 'a', start_at: '2099-03-05T00:00:00.000Z', end_at: null, timezone: 'UTC' }];
    const second = [{ id: 'b', start_at: '2099-09-10T00:00:00.000Z', end_at: null, timezone: 'UTC' }];
    const { container, rerender } = render(<EventsCalendar events={first} range={null} onChange={() => {}} />);
    expect(container.querySelector('[role=heading]')!.textContent).toMatch(/March 2099/);
    rerender(<EventsCalendar events={second} range={null} onChange={() => {}} />);
    expect(container.querySelector('[role=heading]')!.textContent).toMatch(/September 2099/);
  });
});
