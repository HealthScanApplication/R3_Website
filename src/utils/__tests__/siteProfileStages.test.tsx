// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SiteProfileForm } from '../../components/guides/GuidePortal';
import type { GuideProfile } from '../guidePortal';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const guide = (over: Partial<GuideProfile> = {}): GuideProfile => ({
  user_id: 'owner', slug: 'test-guide', display_name: 'Test Guide', headline: 'Sleep coach', bio: 'Helps people sleep.', avatar_url: null,
  contact_email: 'guide@example.com', whatsapp_phone: '', social_links: {}, specialties: [], status: 'approved', commission_percent: 30, onboarding_step: 5, ...over,
});

/** The tab edits a controlled profile, so keep it in state like the workspace does. */
function Harness({ initial }: { initial: GuideProfile }) {
  const [profile, setProfile] = React.useState(initial);
  return <SiteProfileForm userId="owner" profile={profile} onProfile={setProfile} />;
}
const open = (initial = guide()) => render(<Harness initial={initial} />);

it('opens with the basics and the required contact; links, booking and about stay closed with a summary', async () => {
  open();
  expect(await screen.findByDisplayValue('Test Guide')).toBeTruthy();
  expect(screen.getByDisplayValue('guide@example.com')).toBeTruthy();
  for (const name of [/Links/, /Booking/, /About/]) expect(screen.getByRole('button', { name }).getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByPlaceholderText(/instagram\.com/)).toBeNull();
  expect(screen.queryByText(/Booking page URL/)).toBeNull();
  expect(screen.queryByText('Bio')).toBeNull();
  expect(screen.getByText('Sleep coach')).toBeTruthy(); // About's summary shows the headline while closed
  expect(screen.queryByText(/Brand kit/i)).toBeNull(); // the brand look is its own stage
  fireEvent.click(screen.getByRole('button', { name: /Links/ }));
  expect(screen.getByPlaceholderText(/instagram\.com/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /About/ }));
  expect(screen.getByText('Bio')).toBeTruthy();
});

it('moves to the brand stage on its own and back, keeping the edits', async () => {
  open();
  await screen.findByDisplayValue('Test Guide');
  fireEvent.change(screen.getByDisplayValue('Test Guide'), { target: { value: 'Renamed Guide' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to brand' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy());
  expect(screen.queryByDisplayValue('guide@example.com')).toBeNull();
  expect(screen.getByText(/Brand kit/i)).toBeTruthy();
  expect(screen.getByText(/Renamed Guide · English/)).toBeTruthy(); // the summary row names what you are editing
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect((screen.getByDisplayValue('Renamed Guide') as HTMLInputElement).value).toBe('Renamed Guide');
  expect(screen.getByDisplayValue('guide@example.com')).toBeTruthy();
});

it('keeps the stage controls as buttons in a labelled group', async () => {
  open();
  await screen.findByDisplayValue('Test Guide');
  const group = screen.getByRole('group', { name: 'Profile stages' });
  expect(group.querySelectorAll('button').length).toBe(2);
  expect(screen.getByRole('button', { name: '1 · Profile' }).getAttribute('aria-current')).toBe('step');
  expect(screen.getByRole('button', { name: '2 · Brand' }).getAttribute('aria-current')).toBeNull();
});

it('rejects an address with two @ signs before the brand stage', async () => {
  open(guide({ contact_email: 'guide@@example.com' }));
  await screen.findByDisplayValue('Test Guide');
  fireEvent.click(screen.getByRole('button', { name: 'Continue to brand' }));
  expect(await screen.findByText('Add a valid contact email.')).toBeTruthy();
  expect(screen.queryByText(/Brand kit/i)).toBeNull();
});

it('checks the name and email before the brand stage, and opens Contact when the email is wrong', async () => {
  open(guide({ contact_email: '' }));
  await screen.findByDisplayValue('Test Guide');
  fireEvent.click(screen.getByRole('button', { name: /Contact/ })); // close it, then see that the error reopens it
  expect(screen.getByRole('button', { name: /Contact/ }).getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: '2 · Brand' }));
  expect((await screen.findByText('Add a valid contact email.')).getAttribute('role')).toBe('alert');
  expect(screen.getByRole('button', { name: /Contact/ }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.queryByText(/Brand kit/i)).toBeNull();
  fireEvent.change(document.querySelector('input[type="email"]') as HTMLInputElement, { target: { value: 'guide@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: '2 · Brand' }));
  await waitFor(() => expect(screen.getByText(/Brand kit/i)).toBeTruthy());
  expect(screen.queryByText('Add a valid contact email.')).toBeNull();
});
