// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ del: vi.fn(async () => {}) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({ ...await importOriginal<any>(), deleteGuideOffer: mocks.del }));
import { StepRelated } from '../../components/guides/GuidePortal';

afterEach(cleanup);

const offer = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, kind: 'protocol', access_model: 'free', status: 'draft', price_cents: 0, currency: 'GBP', description: 'A short description.', cover_url: null, ...extra }) as any;
const related = { leads: [], protocols: [], ramps: [], offers: [offer('o1', '21-day sleep reset', { access_model: 'paid', price_cents: 2900 }), offer('o2', '7-day menopause sleep challenge')] };
const view = (onOfferDeleted = vi.fn()) => render(<StepRelated step={4} guardianSlug="john-ferreira" displayName="John Ferreira" related={related} userId="owner" onOfferDeleted={onOfferDeleted} />);

describe('your offers in the workspace', () => {
  it('shows each offer as the same card as a Protocol, with Edit and Delete', () => {
    view();
    const section = screen.getByRole('region', { name: 'Your offers' });
    expect(section.querySelectorAll('.r3-pcard').length).toBe(2);
    expect(within(section).getByText('21-day sleep reset')).toBeTruthy();
    expect(within(section).getAllByRole('button', { name: /edit/i }).length).toBeGreaterThanOrEqual(2);
    expect(within(section).getAllByRole('button', { name: /delete/i }).length).toBeGreaterThanOrEqual(2);
  });

  it('deletes an offer after confirming and tells the page', async () => {
    const onOfferDeleted = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    view(onOfferDeleted);
    const card = screen.getByText('21-day sleep reset').closest('.r3-pcard') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith('owner', 'o1'));
    expect(onOfferDeleted).toHaveBeenCalledWith('o1');
  });

  it('keeps the offer when the Guardian cancels', async () => {
    mocks.del.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    view();
    const card = screen.getByText('21-day sleep reset').closest('.r3-pcard') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /delete/i }));
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
