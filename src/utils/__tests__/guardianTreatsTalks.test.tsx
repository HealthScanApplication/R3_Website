// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GuardianWebsite } from '../../components/guides/GuidePortal';
import { TreatsTalksManager, offerFromDraft } from '../../components/guides/TreatsTalksManager';

const offer = (over: Record<string, any>) => ({ id: over.id, guide_id: 'owner', kind: 'treat', title: 'Treat', description: null, cover_url: null, price_cents: 13000, currency: 'AUD', affiliate_url: null, access_model: 'paid', file_path: null, booking_url: null, status: 'published', ...over });
let OFFERS: any[] = [];
const PROFILE = { user_id: 'owner', slug: 'barbara-oneill', display_name: "Barbara O'Neill", headline: 'Natural wellness.', bio: 'Bio.', avatar_url: null, specialties: ['Wellness'], status: 'approved', onboarding_step: 5, contact_email: 'relax@example.com', whatsapp_phone: '', commission_percent: 0, social_links: { currency: 'AUD' } };
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn() }));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, accessToken: null, signOut: () => {}, loading: false }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfileBySlug: async () => PROFILE,
  listGuideOffers: async () => OFFERS,
  listGuideValueRamps: async () => [],
  createGuideOffer: mocks.create, updateGuideOfferDetails: mocks.update, deleteGuideOffer: mocks.remove,
}));

beforeEach(() => { mocks.create.mockReset(); mocks.update.mockReset(); mocks.remove.mockReset(); vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const visit = () => { window.history.replaceState({}, '', '/guardians/barbara-oneill'); return render(<GuardianWebsite slug="barbara-oneill" isSignedIn={false} />); };

describe('Treats and Talks on the public site', () => {
  it('lists published treats with their type, length, description and price, and books through the booking link or by email', async () => {
    OFFERS = [
      offer({ id: 't1', title: 'Hot Stone Massage', description: 'Massage · 60 min\nWarm volcanic stones with long, firm strokes.', price_cents: 13000, booking_url: 'https://www.mmh.com.au/contact' }),
      offer({ id: 't2', title: 'Gua Sha Facial', description: 'Facial · 60 min\nA tool-assisted facial massage.', price_cents: 13000 }),
      offer({ id: 't3', title: 'Head Massage', description: 'Massage · 30 min\nTension and headaches.', price_cents: 7000 }),
      offer({ id: 't4', title: 'Unfinished Draft', description: 'Massage · 45 min\nNot ready.', status: 'draft' }),
    ];
    visit();
    const section = await screen.findByRole('region', { name: "Barbara O'Neill's treats" });
    expect(within(section).getByRole('heading', { name: 'Treats' })).toBeTruthy();
    expect(within(section).getAllByText(/Hot Stone Massage|Gua Sha Facial|Head Massage/).length).toBe(3);
    expect(within(section).queryByText('Unfinished Draft')).toBeNull(); // a draft is not shown
    const hot = section.querySelector('[data-offer-card="treat"]:has(h4)') as HTMLElement;
    const card = ([...section.querySelectorAll('[data-offer-card="treat"]')] as HTMLElement[]).find((c) => /Hot Stone/.test(c.textContent || ''))!;
    expect(hot).toBeTruthy();
    expect(within(card).getByText('Massage')).toBeTruthy();
    expect(card.querySelector('[data-offer-minutes]')!.textContent).toBe('1 hr');
    expect(card.querySelector('[data-offer-price]')!.textContent).toMatch(/\$130$/);
    expect(within(card).getByText(/Warm volcanic stones/)).toBeTruthy();
    expect((within(card).getByRole('link', { name: 'Book Hot Stone Massage' }) as HTMLAnchorElement).getAttribute('href')).toBe('https://www.mmh.com.au/contact');
    const gua = ([...section.querySelectorAll('[data-offer-card="treat"]')] as HTMLElement[]).find((c) => /Gua Sha/.test(c.textContent || ''))!;
    const href = (within(gua).getByRole('link', { name: 'Book Gua Sha Facial' }) as HTMLAnchorElement).getAttribute('href')!;
    expect(href).toMatch(/^mailto:relax@example\.com\?subject=/);
    expect(decodeURIComponent(href)).toContain('Treat: Gua Sha Facial');
  });

  it('filters by type and groups them under it', async () => {
    OFFERS = [
      offer({ id: 't1', title: 'Hot Stone Massage', description: 'Massage · 60 min\nStones.' }),
      offer({ id: 't2', title: 'Gua Sha Facial', description: 'Facial · 60 min\nTool.' }),
    ];
    visit();
    const section = await screen.findByRole('region', { name: "Barbara O'Neill's treats" });
    const chips = within(within(section).getByRole('group', { name: 'Filter treats by type' })).getAllByRole('button').map((b) => b.textContent);
    expect(chips).toEqual(['All', 'Massage', 'Facial']);
    fireEvent.click(within(section).getByRole('button', { name: 'Facial' }));
    expect(within(section).queryByText('Hot Stone Massage')).toBeNull();
    expect(within(section).getByText('Gua Sha Facial')).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: 'All' }));
    expect(within(section).getByText('Hot Stone Massage')).toBeTruthy();
  });

  it('shows talks as their own section, and adds Talks and Treats to the section links only when there are some', async () => {
    OFFERS = [offer({ id: 'k1', kind: 'talk', title: 'Food as Medicine', description: 'Lecture · 90 min\nWhat to eat and why.', price_cents: 0, access_model: 'free' }), offer({ id: 't1', title: 'Head Massage', description: 'Massage · 30 min\nTension.', price_cents: 7000 })];
    visit();
    const talks = await screen.findByRole('region', { name: "Barbara O'Neill's talks" });
    expect(within(talks).getByRole('heading', { name: 'Talks and lectures' })).toBeTruthy();
    expect(talks.querySelector('[data-offer-price]')!.textContent).toBe('Free');
    expect(talks.querySelector('[data-offer-minutes]')!.textContent).toBe('1 hr 30 min');
    for (const name of ['Talks', 'Treats']) expect(await screen.findByRole('link', { name })).toBeTruthy();
    expect((screen.getByRole('link', { name: 'Treats' }) as HTMLAnchorElement).getAttribute('href')).toBe('#treats');
  });

  it('shows no section and no link when there are none published', async () => {
    OFFERS = [offer({ id: 't1', title: 'Hidden', status: 'draft' })];
    visit();
    await waitFor(() => expect(screen.getAllByText('Natural wellness.').length).toBeGreaterThan(0));
    expect(screen.queryByRole('region', { name: /treats/i })).toBeNull();
    expect(screen.queryByRole('region', { name: /talks/i })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Treats' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Talks' })).toBeNull();
  });
});

describe('Treats and Talks in the Guardian admin', () => {
  const managed = (onChange = vi.fn(), offers: any[] = []) => render(<TreatsTalksManager profile={PROFILE as any} offers={offers} onChange={onChange} />);

  it('adds a treat as a draft offer with its type and length on the first line, priced in the Guardian\'s currency', async () => {
    mocks.create.mockImplementation(async (_g: string, row: any) => ({ ...offer({ id: 'new' }), ...row }));
    const onChange = vi.fn();
    managed(onChange);
    fireEvent.click(screen.getByRole('button', { name: /Add a treat/ }));
    const form = screen.getByRole('group', { name: 'New treat' });
    fireEvent.change(within(form).getByLabelText('New name'), { target: { value: 'Swedish Massage' } });
    fireEvent.change(within(form).getByLabelText('New type'), { target: { value: 'Massage' } });
    fireEvent.change(within(form).getByLabelText('New length'), { target: { value: '60' } });
    fireEvent.change(within(form).getByLabelText('New price'), { target: { value: '120' } });
    fireEvent.change(within(form).getByLabelText('New description'), { target: { value: 'Long strokes to unwind.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add it' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const [guideId, row] = mocks.create.mock.calls[0];
    expect(guideId).toBe('owner');
    expect(row).toMatchObject({ kind: 'treat', title: 'Swedish Massage', description: 'Massage · 60 min\nLong strokes to unwind.', price_cents: 12000, access_model: 'paid', currency: 'AUD', status: 'draft', booking_url: null });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0][0].id).toBe('new');
  });

  it('adds a talk, and a blank price means free', async () => {
    mocks.create.mockImplementation(async (_g: string, row: any) => ({ ...offer({ id: 'k' }), ...row }));
    managed();
    fireEvent.click(screen.getByRole('button', { name: /Add a talk/ }));
    const form = screen.getByRole('group', { name: 'New talk' });
    fireEvent.change(within(form).getByLabelText('New name'), { target: { value: 'Food as Medicine' } });
    fireEvent.click(within(form).getByLabelText('New published'));
    fireEvent.click(within(form).getByRole('button', { name: 'Add it' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ kind: 'talk', price_cents: 0, access_model: 'free', status: 'published' });
  });

  it('says what is wrong instead of saving a bad one', () => {
    expect(offerFromDraft({ title: '', category: '', minutes: '', price: '', text: '', bookingUrl: '', status: 'draft' }, 'AUD').problem).toBe('Give it a name.');
    expect(offerFromDraft({ title: 'x', category: '', minutes: '', price: 'lots', text: '', bookingUrl: '', status: 'draft' }, 'AUD').problem).toMatch(/Price is a number/);
    expect(offerFromDraft({ title: 'x', category: '', minutes: '1.5', price: '', text: '', bookingUrl: '', status: 'draft' }, 'AUD').problem).toMatch(/whole number of minutes/);
    expect(offerFromDraft({ title: 'x', category: '', minutes: '', price: '', text: '', bookingUrl: 'javascript:alert(1)', status: 'draft' }, 'AUD').problem).toMatch(/https/);
    expect(offerFromDraft({ title: 'x', category: '', minutes: '', price: '$95.50', text: '', bookingUrl: '', status: 'draft' }, 'AUD').fields?.price_cents).toBe(9550);
    managed();
    fireEvent.click(screen.getByRole('button', { name: /Add a treat/ }));
    fireEvent.click(within(screen.getByRole('group', { name: 'New treat' })).getByRole('button', { name: 'Add it' }));
    expect(screen.getByRole('alert').textContent).toBe('Give it a name.');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('edits and publishes an existing treat, and deletes one after confirming', async () => {
    const existing = offer({ id: 't1', title: 'Hot Stone Massage', description: 'Massage · 60 min\nStones.', price_cents: 13000, status: 'draft' });
    mocks.update.mockImplementation(async (_g: string, _id: string, patch: any) => ({ ...existing, ...patch }));
    mocks.remove.mockResolvedValue(undefined);
    const onChange = vi.fn();
    managed(onChange, [existing, offer({ id: 'x', kind: 'ebook', title: 'Not a treat' })]);
    expect(screen.queryByText('Not a treat')).toBeNull(); // only treats and talks are managed here
    const row = document.querySelector('[data-managed-offer="t1"]') as HTMLElement;
    fireEvent.change(within(row).getByLabelText('Hot Stone Massage price'), { target: { value: '140' } });
    fireEvent.click(within(row).getByLabelText('Hot Stone Massage published'));
    fireEvent.click(within(row).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0].slice(0, 2)).toEqual(['owner', 't1']);
    expect(mocks.update.mock.calls[0][2]).toMatchObject({ price_cents: 14000, status: 'published', description: 'Massage · 60 min\nStones.' });
    expect((await within(row).findByRole('status')).textContent).toBe('Saved.');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(within(row).getByRole('button', { name: 'Delete Hot Stone Massage' }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('owner', 't1'));
    await waitFor(() => expect(onChange.mock.calls.at(-1)![0].map((o: any) => o.id)).toEqual(['x']));
  });
});
