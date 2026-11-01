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
const view = (onOfferDeleted = vi.fn()) => render(<StepRelated step={5} guardianSlug="john-ferreira" displayName="John Ferreira" related={related} userId="owner" onOfferDeleted={onOfferDeleted} />);

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

describe('protocols, audiences and sites under each setup step', () => {
  const protocol = (id: string, name: string) => ({ id, name, total_days: 7, is_public: false, image_url: null, description: 'A week of sleep habits.' }) as any;
  const ramp = (id: string, name: string) => ({ id, name, slug: id, audience: 'Women', problem: 'Sleep', offer_ids: ['a'], status: 'published' }) as any;

  it('shows protocols as Protocol cards with Edit, and Delete once signed in with a token', () => {
    render(<StepRelated step={2} guardianSlug="john-ferreira" displayName="John Ferreira" related={{ leads: [], offers: [], ramps: [], protocols: [protocol('p1', 'Starter Protocol'), protocol('p2', 'Plant medicine Prep')] }} accessToken="token" />);
    const section = screen.getByRole('region', { name: 'Your Protocols' });
    expect(section.querySelectorAll('.r3-pcard').length).toBe(2);
    expect(within(section).getAllByRole('button', { name: /delete/i }).length).toBeGreaterThanOrEqual(2);
    expect(within(section).getAllByRole('button', { name: /edit/i }).length).toBeGreaterThanOrEqual(2);
  });

  it('shows one card per audience, and removing one tells the page', () => {
    const onRemoveAudience = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<StepRelated step={3} guardianSlug="john-ferreira" displayName="John Ferreira" related={{ leads: [], offers: [], ramps: [], protocols: [] }}
      audiences={[{ group: 'Everyone', ages: '18–80', stages: [], problems: ['Sleep problems', 'Low energy'] }, { group: 'Women', ages: '32–55', stages: ['Menopause'], problems: ['Hot flushes'] }]} onRemoveAudience={onRemoveAudience} />);
    const section = screen.getByRole('region', { name: 'Your audiences' });
    expect(section.querySelectorAll('.r3-pcard').length).toBe(2);
    expect(within(section).getByText(/Helps with sleep problems, low energy/)).toBeTruthy();
    const card = within(section).getByText('Women').closest('.r3-pcard') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /delete/i }));
    expect(onRemoveAudience).toHaveBeenCalledWith('Women');
  });

  it('lists every site under Site, with All / Profile / Offer path tabs and a brand filter', () => {
    const brands = [{ id: 'personal', name: 'John Ferreira', kind: 'personal' as const, logo: null }, { id: 'b2', name: 'Calm Co', kind: 'business' as const, logo: null }];
    render(<StepRelated step={6} guardianSlug="john-ferreira" displayName="John Ferreira" related={{ leads: [], offers: [], protocols: [], ramps: [ramp('better-sleep', 'Better sleep')] }} brands={brands} activeBrandId="personal" />);
    const section = screen.getByRole('region', { name: 'Your sites' });
    expect(within(section).getByText(/In your workspace · Your sites · 3/)).toBeTruthy();
    expect(within(section).getByRole('group', { name: 'Filter sites by brand' })).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: 'Offer path sites' }));
    expect(within(section).getByText(/Your sites · 1/)).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: 'Profile sites' }));
    expect(within(section).getByText(/Your sites · 2/)).toBeTruthy();
  });
});
