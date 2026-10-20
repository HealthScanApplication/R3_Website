// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Onboarding } from '../../components/guides/GuidePortal';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
beforeEach(() => {
  window.history.replaceState({}, '', '/guardians/workspace?step=1');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const setup = (email = 'guide@example.com') => render(<Onboarding userId="owner" accessToken="t" name="Test Guide" email={email} accountAvatarUrl={null} onDone={() => {}} />);

it('opens with the basics and the required contact, keeps optional sections closed and the brand look for later', async () => {
  setup();
  expect(await screen.findByDisplayValue('Test Guide')).toBeTruthy();
  expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
  expect(screen.queryByPlaceholderText(/instagram\.com/)).toBeNull(); // Links is closed, with a summary
  expect(screen.getByRole('button', { name: /Links/ }).getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText(/Brand kit/i)).toBeNull(); // the brand look is its own stage
  fireEvent.click(screen.getByRole('button', { name: /Links/ }));
  expect(screen.getByRole('button', { name: /Links/ }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByPlaceholderText(/instagram\.com/)).toBeTruthy();
});

it('moves to the brand stage on its own and back, after checking the email', async () => {
  setup('');
  await screen.findByDisplayValue('Test Guide');
  fireEvent.click(screen.getByRole('button', { name: 'Continue to brand' }));
  expect(await screen.findByText('Add a valid contact email.')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'guide@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to brand' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy());
  expect(screen.queryByPlaceholderText('you@example.com')).toBeNull();
  expect(screen.getByText(/Brand kit/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect((screen.getByPlaceholderText('you@example.com') as HTMLInputElement).value).toBe('guide@example.com');
});

it('rejects an address with two @ signs, and the stage controls are buttons in a labelled group', async () => {
  setup('guide@@example.com');
  await screen.findByDisplayValue('Test Guide');
  expect(screen.getByRole('group', { name: 'Profile stages' }).querySelectorAll('button').length).toBe(2);
  expect(screen.getByRole('button', { name: '1 · Profile' }).getAttribute('aria-current')).toBe('step');
  fireEvent.click(screen.getByRole('button', { name: 'Continue to brand' }));
  expect(await screen.findByText('Add a valid contact email.')).toBeTruthy();
  expect(screen.queryByText(/Brand kit/i)).toBeNull();
});
