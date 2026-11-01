// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Onboarding } from '../../components/guides/GuidePortal';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({ ...await importOriginal<any>(), getGuideProfile: async () => null, listGuideBrands: async () => [], listGuideOffers: async () => [], listGuideProducts: async () => [] }));

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response)); window.history.replaceState({}, '', '/guardians/workspace?step=5'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const setup = () => render(<Onboarding userId="owner" accessToken="t" name="Test Guide" email="guide@example.com" accountAvatarUrl={null} onDone={() => {}} />);

describe('Build your offers', () => {
  it('shows the three steps to completion under the title, with the first one current', async () => {
    setup();
    const steps = await screen.findByLabelText('Three steps to completion');
    const buttons = within(steps).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['01 · Business goal', '02 · Lead magnets', '03 · Build offers']);
    expect(buttons[0].getAttribute('aria-current')).toBe('step');
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true); // you cannot skip ahead
  });

  it('lists the goals as vertical cards: Simple on its own row, then Build, then Convert', async () => {
    setup();
    const cards = await screen.findByText('Start simple');
    expect(cards).toBeTruthy();
    const container = document.querySelector('[data-goal-cards]') as HTMLElement;
    const rows = [...container.querySelectorAll('[data-goal-row]')];
    expect(rows.map((row) => row.getAttribute('data-goal-row'))).toEqual(['simple', 'build-convert']);
    expect(rows[0].querySelectorAll('[data-choice-card="vertical"]').length).toBe(1);
    const second = [...rows[1].querySelectorAll('[data-choice-card="vertical"]')];
    expect(second.map((card) => card.textContent)).toEqual([expect.stringContaining('Build your audience'), expect.stringContaining('Convert your audience')]);
    expect(rows[0].textContent).toMatch(/SIMPLE/);
  });

  it('Back goes to Products, and Continue moves the tracker to step two', async () => {
    setup();
    await screen.findByText('Start simple');
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    const steps = await screen.findByLabelText('Three steps to completion');
    const buttons = within(steps).getAllByRole('button');
    expect(buttons[1].getAttribute('aria-current')).toBe('step');
    expect(buttons[0].textContent).toBe('✓ 01 · Business goal');
  });
});
