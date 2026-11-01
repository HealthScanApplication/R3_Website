// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GuardianGetStarted, Onboarding } from '../../components/guides/GuidePortal';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('the Get started page', () => {
  it('says what a Guardian is: share knowledge, book clients, help people', () => {
    render(<GuardianGetStarted onStart={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: /Share what you know/ })).toBeTruthy();
    const promises = within(screen.getByRole('list', { name: 'What a Guardian does' })).getAllByRole('listitem');
    expect(promises.map((li) => within(li).getByRole('heading', { level: 2 }).textContent)).toEqual(['Share what you know', 'Book clients', 'Help people keep going']);
    expect(screen.getByText(/booking link or ROUTINE³ Booking/)).toBeTruthy();
  });

  it('previews the six steps in order', () => {
    render(<GuardianGetStarted onStart={() => {}} />);
    const items = within(screen.getByLabelText('The six steps')).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['01Profile', '02Guidance', '03Audience', '04Products', '05Offers', '06Site']);
  });

  it('promises nothing about money while payments are not live', () => {
    const { container } = render(<GuardianGetStarted onStart={() => {}} />);
    expect(container.textContent).not.toMatch(/\bearn|income|payout|revenue|salary|[$£€]|\bpaid\b|\bprice/i);
  });

  it('starts the setup from its one button', () => {
    const onStart = vi.fn();
    render(<GuardianGetStarted onStart={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: /Start with your profile/ }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('where Onboarding opens', () => {
  const setup = (props: Partial<React.ComponentProps<typeof Onboarding>> = {}) => render(<Onboarding userId="owner" accessToken="t" name="Test Guide" email="guide@example.com" accountAvatarUrl={null} onDone={() => {}} {...props} />);
  const profileForm = () => screen.findByDisplayValue('Test Guide');

  it('opens a new Guardian on Get started, before the profile form and without the step bar', async () => {
    window.history.replaceState({}, '', '/guardians/workspace');
    setup();
    expect(await screen.findByRole('heading', { level: 1, name: /Share what you know/ })).toBeTruthy();
    expect(screen.queryByPlaceholderText('you@example.com')).toBeNull();
    expect(screen.queryByLabelText('Guardian setup progress')).toBeNull();
  });

  it('"Start with your profile" opens step 01 and puts it in the address, so Back returns to Get started', async () => {
    window.history.replaceState({}, '', '/guardians/workspace');
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Start with your profile/ }));
    expect(await profileForm()).toBeTruthy();
    expect(window.location.search).toBe('?step=1');
    expect(screen.getByLabelText('Guardian setup progress')).toBeTruthy();
  });

  it('opens someone who already has a profile on Profile: they are here to edit it', async () => {
    window.history.replaceState({}, '', '/guardians/workspace');
    setup({ hasProfile: true });
    expect(await profileForm()).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: /Share what you know/ })).toBeNull();
  });

  it('keeps ?step=1 on the profile form for a new Guardian', async () => {
    window.history.replaceState({}, '', '/guardians/workspace?step=1');
    setup();
    expect(await profileForm()).toBeTruthy();
  });

  it('pressing the picture on Get started goes to 01 Profile even while the builders are locked', async () => {
    window.history.replaceState({}, '', '/guardians/workspace');
    setup();
    await screen.findByRole('heading', { level: 1, name: /Share what you know/ });
    const link = screen.getByLabelText('Your profile') as HTMLAnchorElement;
    expect(link.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(link);
    expect(await profileForm()).toBeTruthy();
    expect(window.location.search).toBe('?step=1');
  });

  it('pressing the picture from a later step returns to 01 Profile', async () => {
    window.history.replaceState({}, '', '/guardians/workspace?step=2');
    setup();
    await screen.findByLabelText('Guardian setup progress');
    expect(screen.queryByDisplayValue('Test Guide')).toBeNull();
    fireEvent.click(screen.getByLabelText('Your profile'));
    expect(await profileForm()).toBeTruthy();
    expect(window.location.search).toBe('?step=1');
  });
});
