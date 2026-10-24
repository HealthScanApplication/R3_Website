// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({ user: null as null | { id: string }, accessToken: null as null | string }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user, accessToken: auth.accessToken, signOut: () => {} }) }));
import { OfferProtocolItems, matchOfferRoutine } from '../../components/guides/OfferProtocolItems';
import { publicAnonKey } from '../supabase/info';

const routines = [
  { id: 'r1', name: '7-day menopause sleep challenge for women', total_days: 7, description: 'A week of sleep.' },
  { id: 'r2', name: 'Gut plan', total_days: 7, description: null },
];
const rows = [
  { id: 'i1', display_name: 'Get morning daylight', scheduled_time: '07:30:00', group_name: null, day_number: null, sort_order: 1, kind: 'action', item_type: 'activity', category: 'do', subtype: 'wellness', duration_minutes: 20, notes: 'Spend time outdoors soon after waking.' },
  { id: 'i2', display_name: 'Follow a quiet wind-down routine', scheduled_time: '21:30:00', group_name: null, day_number: null, sort_order: 2, kind: 'action', item_type: 'activity', category: 'do', subtype: 'wellness', duration_minutes: 30, notes: null },
];
const calls: { url: string; auth: string }[] = [];
function serve(list = routines, items: unknown = rows) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), auth: String((init.headers as Record<string, string>).Authorization) });
    const body = String(url).includes('/protocols?') ? list : String(url).includes('/protocol_items?') ? items : [];
    return new Response(JSON.stringify(body), { status: 200 });
  }));
}
beforeEach(() => { calls.length = 0; auth.user = null; auth.accessToken = null; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('matches the routine named like the offer, ignoring case, punctuation and the "R3 Protocol >" prefix; none or two is no match', () => {
  expect(matchOfferRoutine('7-Day Menopause Sleep Challenge for Women!', routines)?.id).toBe('r1');
  expect(matchOfferRoutine('R3 Protocol > Gut plan', routines)?.id).toBe('r2');
  expect(matchOfferRoutine('Something else', routines)).toBeNull();
  expect(matchOfferRoutine('Gut plan', [...routines, { ...routines[1], id: 'r3' }])).toBeNull();
  expect(matchOfferRoutine('', routines)).toBeNull();
});

it('a visitor reads only the published routines, with the public key, and sees the routine\'s steps by part of the day', async () => {
  serve();
  render(<OfferProtocolItems guideId="g1" offerTitle="7-day menopause sleep challenge for women" />);
  const panel = await screen.findByRole('region', { name: 'What is inside 7-day menopause sleep challenge for women' });
  expect(panel.textContent).toContain('Inside this routine');
  expect(panel.textContent).toContain('Get morning daylight');
  expect(panel.textContent).toContain('Follow a quiet wind-down routine');
  expect(panel.textContent).toMatch(/Morning/);
  expect(panel.textContent).toMatch(/Evening/);
  const list = calls.find((c) => c.url.includes('/protocols?'))!;
  expect(list.url).toContain('user_id=eq.g1');
  expect(list.url).toContain('is_public=eq.true');
  expect(list.auth).toBe(`Bearer ${publicAnonKey}`);
});

it('the Guardian, signed in, reads their own routines (drafts too) with their own token', async () => {
  auth.user = { id: 'g1' }; auth.accessToken = 'owner-token';
  serve();
  render(<OfferProtocolItems guideId="g1" offerTitle="7-day menopause sleep challenge for women" />);
  await screen.findByRole('region', { name: /What is inside/ });
  const list = calls.find((c) => c.url.includes('/protocols?'))!;
  expect(list.url).not.toContain('is_public');
  expect(list.auth).toBe('Bearer owner-token');
  expect(calls.find((c) => c.url.includes('/protocol_items?'))!.auth).toBe('Bearer owner-token');
});

it('someone else signed in is still a visitor: published routines only', async () => {
  auth.user = { id: 'someone-else' }; auth.accessToken = 'their-token';
  serve();
  render(<OfferProtocolItems guideId="g1" offerTitle="7-day menopause sleep challenge for women" />);
  await screen.findByRole('region', { name: /What is inside/ });
  const list = calls.find((c) => c.url.includes('/protocols?'))!;
  expect(list.url).toContain('is_public=eq.true');
  expect(list.auth).toBe(`Bearer ${publicAnonKey}`);
});

it('shows nothing when no routine matches, when it has no steps, or when a read fails', async () => {
  serve();
  const none = render(<OfferProtocolItems guideId="g1" offerTitle="An offer with no routine" />);
  await waitFor(() => expect(calls.some((c) => c.url.includes('/protocols?'))).toBe(true));
  expect(none.container.querySelector('section')).toBeNull();
  expect(calls.some((c) => c.url.includes('/protocol_items?'))).toBe(false);
  cleanup();
  serve(routines, []);
  const empty = render(<OfferProtocolItems guideId="g1" offerTitle="Gut plan" />);
  await waitFor(() => expect(calls.some((c) => c.url.includes('/protocol_items?'))).toBe(true));
  expect(empty.container.querySelector('section')).toBeNull();
  cleanup();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
  const failed = render(<OfferProtocolItems guideId="g1" offerTitle="Gut plan" />);
  await waitFor(() => expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
  expect(failed.container.querySelector('section')).toBeNull();
});
