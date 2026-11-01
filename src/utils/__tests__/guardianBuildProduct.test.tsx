// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Onboarding } from '../../components/guides/GuidePortal';

const mocks = vi.hoisted(() => ({ create: vi.fn(), del: vi.fn(), offers: vi.fn(), upload: vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfile: async () => null,
  listGuideBrands: async () => [],
  listGuideOffers: async () => mocks.offers(),
  listGuideProducts: async () => [],
  createGuideOffer: mocks.create,
  deleteGuideOffer: mocks.del,
  uploadGuideFile: mocks.upload,
}));

beforeEach(() => {
  mocks.create.mockReset(); mocks.upload.mockReset(); mocks.upload.mockResolvedValue('owner/offer-1.pdf'); mocks.del.mockReset(); mocks.offers.mockReset(); mocks.offers.mockReturnValue([]);
  mocks.create.mockImplementation(async (_guide: string, offer: any) => ({ id: 'new-offer', guide_id: 'owner', cover_url: null, currency: 'GBP', ...offer }));
  window.history.replaceState({}, '', '/guardians/workspace?step=4');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const setup = () => render(<Onboarding userId="owner" accessToken="t" name="Test Guide" email="guide@example.com" accountAvatarUrl={null} onDone={() => {}} />);

describe('Build a product (setup step 04)', () => {
  it('offers every product type, and saving one creates a draft offer with the name and price', async () => {
    setup();
    const panel = await screen.findByRole('region', { name: 'Build a product' });
    const types = [...panel.querySelectorAll('[data-product-type]')].map((el) => el.getAttribute('data-product-type'));
    expect(types).toEqual(expect.arrayContaining(['ebook', 'recipe_book', 'routine', 'routine_guidance', 'one_to_one_call', 'group_call', 'in_person', 'festival']));
    fireEvent.click(panel.querySelector('[data-product-type="routine"]') as HTMLElement);
    fireEvent.change(within(panel).getByLabelText('Product name'), { target: { value: 'Menopause sleep Protocol' } });
    fireEvent.change(within(panel).getByLabelText('Product price'), { target: { value: '49' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const [guide, offer] = mocks.create.mock.calls[0];
    expect(guide).toBe('owner');
    expect(offer).toMatchObject({ kind: 'routine', title: 'Menopause sleep Protocol', price_cents: 4900, access_model: 'paid', status: 'draft' });
    const built = await screen.findByRole('region', { name: 'Products you have built' });
    expect(within(built).getByText('Menopause sleep Protocol')).toBeTruthy();
  });

  it('a price of nothing makes it a free product', async () => {
    setup();
    const panel = await screen.findByRole('region', { name: 'Build a product' });
    fireEvent.click(panel.querySelector('[data-product-type="ebook"]') as HTMLElement);
    fireEvent.change(within(panel).getByLabelText('Product price'), { target: { value: '' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ kind: 'ebook', price_cents: 0, access_model: 'free', status: 'draft' });
  });

  it('an uploaded PDF is stored and kept as the product file', async () => {
    setup();
    const panel = await screen.findByRole('region', { name: 'Build a product' });
    fireEvent.click(panel.querySelector('[data-product-type="ebook"]') as HTMLElement);
    fireEvent.click(within(panel).getByRole('radio', { name: 'Upload a PDF' }));
    const file = new File(['%PDF'], 'method.pdf', { type: 'application/pdf' });
    fireEvent.change(within(panel).getByLabelText('Product file'), { target: { files: [file] } });
    fireEvent.change(within(panel).getByLabelText('Product price'), { target: { value: '19' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.upload).toHaveBeenCalledWith('owner', file);
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ kind: 'ebook', file_path: 'owner/offer-1.pdf', price_cents: 1900 });
  });

  it('a booking link on a call is kept as the booking link, and any other link as the product link; it needs a real URL', async () => {
    setup();
    const panel = await screen.findByRole('region', { name: 'Build a product' });
    fireEvent.click(panel.querySelector('[data-product-type="one_to_one_call"]') as HTMLElement);
    fireEvent.click(within(panel).getByRole('radio', { name: 'I have a link' }));
    const save = within(panel).getByRole('button', { name: 'Save product' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(panel).getByLabelText('Product link'), { target: { value: 'not a link' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(within(panel).getByLabelText('Product link'), { target: { value: 'https://cal.com/guide/intro' } });
    fireEvent.click(save);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ kind: 'one_to_one_call', booking_url: 'https://cal.com/guide/intro', affiliate_url: null });
  });
});
