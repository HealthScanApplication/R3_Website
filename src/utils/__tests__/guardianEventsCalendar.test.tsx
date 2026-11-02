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

  it('highlights only the days an event starts, not the days one is under way, and puts the events in a slide beside the calendar', async () => {
    visit();
    const root = await section();
    expect(day(root, '2099-03-05').style.background).toMatch(/rgb\(17, 18, 15\)/); // an event starts: solid ink (black on the light surface, white on the dark)
    expect(day(root, '2099-03-09').style.backgroundImage).toMatch(/repeating-linear-gradient/); // the days inside an event: diagonal lines, not a fill
    expect(day(root, '2099-03-09').style.backgroundColor).toMatch(/rgb\(231, 225, 213\)/); // the first section under the dark hero is light, and the calendar takes its surface
    expect(day(root, '2099-03-05').style.backgroundImage).toBe('none'); // the start day is solid
    expect(day(root, '2099-03-13').style.backgroundImage).toBe('none'); // a day with nothing on is plain
    expect(day(root, '2099-03-09').style.color).toMatch(/rgb\(17, 18, 15\)/); // dark ink on the light surface
    // Days of the neighbouring months are ordinary days: nothing disabled, dimmed or greyed.
    const outside = day(root, '2099-02-27');
    expect(outside.disabled).toBe(false);
    expect(outside.style.opacity).toBe('');
    expect(outside.style.color).toMatch(/rgb\(17, 18, 15\)/);
    expect(day(root, '2099-03-09').getAttribute('data-has-event')).toBe('true');
    const layout = root.querySelector('.g-events-layout') as HTMLElement;
    expect(layout.querySelector('.g-events-calendar [data-events-calendar]')).not.toBeNull();
    const stack = layout.querySelector('.g-events-slide') as HTMLElement;
    expect(stack.getAttribute('aria-label')).toBe('Events');
    expect(stack.querySelectorAll('article').length).toBe(3);
    expect(layout.querySelector('.g-events-calendar')!.nextElementSibling!.contains(stack)).toBe(true); // the slide is the column to the right of the calendar
    expect(root.textContent).toMatch(/Days of the event/); // the legend says what the lines are
    expect((root.querySelector('button[aria-label="Next month"]') as HTMLElement).style.border).toMatch(/^0|none/); // arrows only, no boxes
    expect(within(root).getByRole('button', { name: 'Next events' })).toBeTruthy(); // arrows slide through them
    expect(within(root).getByRole('button', { name: 'Previous events' })).toBeTruthy();
    const card = stack.querySelector('article') as HTMLElement;
    fireEvent.pointerMove(card, { clientX: 10, clientY: 10, pointerType: 'mouse' });
    expect(card.style.getPropertyValue('--ry')).not.toBe(''); // the card tilts with the pointer
  });

  it('numbers each day of a multi-day event inside the calendar, and leaves one-day events unnumbered', async () => {
    visit();
    const root = await section();
    expect(day(root, '2099-03-05').querySelector('[data-day-label]')!.textContent).toBe('Day 1'); // the retreat starts; the one-day workshop adds no number
    expect(day(root, '2099-03-09').querySelector('[data-day-label]')!.textContent).toBe('Day 5');
    expect(day(root, '2099-03-12').querySelector('[data-day-label]')!.textContent).toBe('Day 8');
    expect(day(root, '2099-03-12').getAttribute('aria-label')).toMatch(/day 8 of 8/);
    expect(day(root, '2099-03-13').querySelector('[data-day-label]')).toBeNull();
    cleanup();
    EVENTS = [event('x', 'One', SYD(5), SYD(9)), event('y', 'Two', SYD(7), SYD(12))];
    visit();
    const again = await section();
    expect(day(again, '2099-03-08').querySelector('[data-day-label]')!.textContent).toBe('D4 · D2'); // overlapping events: each one's day number
  });

  it('choosing a day scrolls the slide to that day\'s events and marks them, another day moves it, and Clear brings back the plain list', async () => {
    visit();
    const root = await section();
    const slide = root.querySelector('.g-events-slide') as HTMLElement;
    const scrolled: number[] = [];
    (slide as any).scrollTo = (options: { left: number }) => { scrolled.push(options.left); };
    expect(root.querySelectorAll('article').length).toBe(3);
    fireEvent.click(day(root, '2099-03-09')); // only the week-long retreat is on
    expect(root.querySelectorAll('article').length).toBe(3); // nothing is hidden: it is one slide
    const marked = [...root.querySelectorAll('[data-on-day="true"]')];
    expect(marked.length).toBe(1);
    expect(marked[0].textContent).toMatch(/Lifestyle Retreat/);
    expect(scrolled.length).toBeGreaterThan(0); // the slide moved to it
    expect(root.querySelector('[data-events-count]')!.textContent).toMatch(/1 on your day/);
    fireEvent.click(day(root, '2099-03-05')); // another day moves the marker
    expect(day(root, '2099-03-05').getAttribute('aria-pressed')).toBe('true');
    expect(day(root, '2099-03-09').getAttribute('aria-pressed')).not.toBe('true');
    expect(day(root, '2099-03-05').style.backgroundColor).toMatch(/rgb\(199, 216, 163\)/); // the chosen day is green, even where an event starts
    expect(day(root, '2099-03-05').style.backgroundImage).toBe('none');
    expect(root.querySelector('[data-on-day="true"]')!.textContent).not.toMatch(/Lifestyle Retreat/);
    fireEvent.click(within(root).getByRole('button', { name: 'Clear dates' }));
    expect(root.querySelectorAll('[data-on-day="true"]').length).toBe(0);
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
    expect(root.querySelectorAll('[data-on-day="true"]').length).toBe(1);
    expect(root.querySelector('[data-on-day="true"]')!.textContent).toMatch(/Spring Talk/);
  });

  it('says so when nothing is on for the chosen dates, and offers to clear them', async () => {
    visit();
    const root = await section();
    fireEvent.click(day(root, '2099-03-20'));
    expect(root.querySelectorAll('[data-on-day="true"]').length).toBe(0);
    expect(within(root).getByText(/Nothing is on for those dates/)).toBeTruthy();
    fireEvent.click(within(root).getAllByRole('button', { name: /clear/i })[0]);
    expect(within(root).queryByText(/Nothing is on for those dates/)).toBeNull();
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
