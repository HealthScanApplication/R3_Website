// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Onboarding } from '../../components/guides/GuidePortal';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({ ...await importOriginal<any>(), getGuideProfile: async () => null, listGuideBrands: async () => [], listGuideOffers: async () => [], listGuideProducts: async () => [] }));

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const setup = (step: number) => { window.history.replaceState({}, '', `/guardians/workspace?step=${step}`); return render(<Onboarding userId="owner" accessToken="t" name="Test Guide" email="guide@example.com" accountAvatarUrl={null} onDone={() => {}} />); };

describe('vertical choice cards with a realm tag', () => {
  it('guidance cards are vertical and carry the BODY, MIND or SOUL tag of the tab they are in', async () => {
    setup(2);
    const panel = await screen.findByRole('tabpanel');
    const cards = [...panel.querySelectorAll('[data-choice-card="vertical"]')];
    expect(cards.length).toBeGreaterThan(5);
    expect(cards.every((card) => card.querySelector('[data-realm-tag]')?.textContent === 'BODY')).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: /^MIND/ }));
    const mind = [...screen.getByRole('tabpanel').querySelectorAll('[data-choice-card="vertical"]')];
    expect(mind.length).toBeGreaterThan(3);
    expect(mind.every((card) => card.querySelector('[data-realm-tag]')?.textContent === 'MIND')).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: /^SOUL/ }));
    expect([...screen.getByRole('tabpanel').querySelectorAll('[data-realm-tag]')].every((tag) => tag.textContent === 'SOUL')).toBe(true);
  });
  it('audience cards are vertical too (picture above, words below, centred)', async () => {
    setup(3);
    await screen.findAllByText('Everyone');
    const everyone = document.querySelector('[data-choice-card]') as HTMLElement;
    expect(everyone.textContent).toMatch(/Everyone/);
    expect(everyone.getAttribute('data-choice-card')).toBe('vertical');
    expect(everyone.style.flexDirection).toBe('column');
    expect(everyone.style.textAlign).toBe('center');
    expect(within(everyone).getByText(/General guidance/)).toBeTruthy();
  });
});
