// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Onboarding, guessProductFromUrl } from '../../components/guides/GuidePortal';

const mocks = vi.hoisted(() => ({ create: vi.fn(), del: vi.fn(), offers: vi.fn(), products: vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfile: async () => null,
  listGuideBrands: async () => [],
  listGuideOffers: async () => mocks.offers(),
  listGuideProducts: async () => mocks.products(),
  createGuideOffer: mocks.create,
  deleteGuideOffer: mocks.del,
}));

beforeEach(() => {
  mocks.create.mockReset(); mocks.del.mockReset(); mocks.offers.mockReset(); mocks.offers.mockReturnValue([]); mocks.products.mockReset(); mocks.products.mockReturnValue([]);
  mocks.create.mockImplementation(async (_guide: string, offer: any) => ({ id: `offer-${mocks.create.mock.calls.length}`, guide_id: 'owner', cover_url: null, ...offer }));
  mocks.del.mockResolvedValue(undefined);
  window.history.replaceState({}, '', '/guardians/workspace?step=4');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const setup = () => render(<Onboarding userId="owner" accessToken="t" name="Test Guide" email="guide@example.com" accountAvatarUrl={null} onDone={() => {}} />);
const group = async (id: 'free' | 'paid') => {
  await screen.findByText(/Add what you already sell/);
  fireEvent.click(screen.getByRole('tab', { name: id === 'free' ? /^Lead magnets/ : /^Paid products/ }));
  return document.querySelector(`[data-upload-group="${id}"]`) as HTMLElement;
};
const built = (el: HTMLElement) => el.querySelectorAll('[data-built-card] .r3-pcard');

describe('reading a pasted link', () => {
  it('guesses the type and a name from the address', () => {
    expect(guessProductFromUrl('https://example.com/files/sleep-reset-guide.pdf')).toEqual({ type: 'ebook', title: 'Sleep Reset Guide' });
    expect(guessProductFromUrl('https://cal.com/guide/intro-call').type).toBe('one_to_one_call');
    expect(guessProductFromUrl('https://www.youtube.com/playlist?list=abc').type).toBe('course');
    expect(guessProductFromUrl('https://www.skool.com/my-community').type).toBe('community');
    expect(guessProductFromUrl('https://my-shop.myshopify.com/products/tea').type).toBe('product');
    expect(guessProductFromUrl('https://example.com/something').type).toBeUndefined();
    expect(guessProductFromUrl('not a link')).toEqual({});
  });
});

describe('Upload your products (setup step 04)', () => {
  const offer = (id: string, kind: string, title: string, price: number) => ({ id, guide_id: 'owner', kind, title, description: null, cover_url: null, price_cents: price, currency: 'GBP', affiliate_url: 'https://x.example/a', access_model: price ? 'paid' : 'free', file_path: null, booking_url: null, status: 'draft' });

  it('has one section per type, lowest value first, and lead magnets (free) apart from paid', async () => {
    mocks.offers.mockReturnValue([offer('o1', 'festival', 'Misty Retreat', 365000), offer('o2', 'ebook', 'Sleep guide', 1900), offer('o3', 'course', 'Gut course', 14900), offer('o4', 'ebook', 'Free checklist', 0)]);
    setup();
    const free = await group('free');
    const VALUE_ORDER = ['ebook', 'recipe_book', 'product', 'course', 'routine', 'routine_guidance', 'one_to_one_call', 'group_call', 'community', 'in_person', 'festival'];
    const kinds = [...free.querySelectorAll('[data-type-section]')].map((el) => el.getAttribute('data-type-section')!);
    expect(kinds.length).toBeGreaterThan(1);
    expect(kinds).toEqual([...kinds].sort((a, b) => VALUE_ORDER.indexOf(a) - VALUE_ORDER.indexOf(b))); // lowest value first
    expect(kinds).not.toContain('product'); // a physical product is never a lead magnet
    expect(free.querySelectorAll('[data-built-card]').length).toBe(1); // only the free checklist is a lead magnet
    const paid = await group('paid');
    await waitFor(() => expect(paid.querySelectorAll('[data-built-card]').length).toBe(3));
    const order = [...paid.querySelectorAll('[data-type-section]')].filter((el) => el.querySelector('[data-built-card]')).map((el) => el.getAttribute('data-type-section'));
    expect(order).toEqual(['ebook', 'course', 'festival']); // a PDF guide, then the course, then the retreat
  });

  it('sorts the cards inside a section from low to high', async () => {
    mocks.offers.mockReturnValue([offer('o1', 'ebook', 'Big guide', 9900), offer('o2', 'ebook', 'Small guide', 900), offer('o3', 'ebook', 'Middle guide', 2900)]);
    setup();
    const paid = await group('paid');
    await waitFor(() => expect(paid.querySelectorAll('[data-built-card]').length).toBe(3));
    expect([...paid.querySelectorAll('[data-type-section="ebook"] [data-built-card]')].map((el) => /Small|Middle|Big/.exec(el.textContent || '')![0])).toEqual(['Small', 'Middle', 'Big']);
  });

  it('collapses and expands each section, saying so for assistive tech', async () => {
    mocks.offers.mockReturnValue([offer('o1', 'ebook', 'Sleep guide', 1900)]);
    setup();
    const paid = await group('paid');
    await waitFor(() => expect(paid.querySelector('[data-built-card]')).not.toBeNull());
    const section = paid.querySelector('[data-type-section="ebook"]') as HTMLElement;
    const toggle = section.querySelector('[data-type-toggle]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toMatch(/PDF guide · 1/);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect((section.querySelector('[data-built-card]')!.closest('[hidden]'))).not.toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(section.querySelector('[data-built-card]')!.closest('[hidden]')).toBeNull();
  });

  it('gives every card the same fixed size', async () => {
    setup();
    await group('paid');
    const css = [...document.querySelectorAll('style')].map((el) => el.textContent).join('\n');
    expect(css).toMatch(/\[data-upload-group\] \.r3-pcard\{height:480px;min-height:480px\}/);
    expect(css).toMatch(/\[data-upload-group\] \.r3-pcard-media\{height:200px\}/);
  });

  it('keeps physical products and the shop under Paid products, not under Lead magnets', async () => {
    const product = (id: string, title: string, price: number) => ({ id, guide_id: 'owner', shop_domain: 'shop.example', myshopify_domain: null, product_handle: id, variant_id: null, variant_title: null, title, description: null, image_url: null, price_cents: price, currency: 'AUD', discount_code: null, commission_percent: null, status: 'published', sort_order: 0, created_at: '', updated_at: '', brand_id: null });
    mocks.products.mockReturnValue([product('p1', 'Mineral Bundle', 26990), product('p2', 'Wild Yam Cream', 23500)]);
    setup();
    const free = await group('free');
    expect(free.querySelector('[data-build-type="product"]')).toBeNull();
    expect([...(within(free).getByLabelText('Lead magnets type 1') as HTMLSelectElement).options].map((option) => option.text)).not.toContain('Physical product');
    expect(free.querySelector('[data-shop-products]')).toBeNull();
    const paid = await group('paid');
    expect(paid.querySelector('[data-build-type="product"]')).not.toBeNull();
    await waitFor(() => expect(paid.querySelector('[data-shop-products]')).not.toBeNull());
    expect(paid.querySelector('[data-shop-products]')!.textContent).toMatch(/Shop products · 2/);
    expect(paid.querySelector('[data-type-section="product"]')!.contains(paid.querySelector('[data-shop-products]'))).toBe(true); // in the Physical product section
  });

  it('keeps lead magnets and paid products apart, each with a link, name, type and (for paid) price per row', async () => {
    setup();
    const free = await group('free');
    expect(within(free).getByRole('heading', { name: 'Lead magnets' })).toBeTruthy();
    expect(within(free).queryByLabelText(/price/i)).toBeNull(); // free means no price
    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    const paid = await group('paid');
    expect(within(paid).getByRole('heading', { name: 'Paid products' })).toBeTruthy();
    expect((document.querySelector('[data-upload-group="free"]') as HTMLElement).closest('[role="tabpanel"]')!.hasAttribute('hidden')).toBe(true); // one tab shown at a time
    expect(within(paid).getByLabelText('Paid products price 1')).toBeTruthy();
    const options = [...(within(paid).getByLabelText('Paid products type 1') as HTMLSelectElement).options].map((option) => option.text);
    expect(options).toEqual(expect.arrayContaining(['PDF guide', 'Video course', 'Protocol', 'Protocol + call', 'Community or membership', 'Retreat', 'Physical product']));
  });

  it('a pasted PDF link fills the type and name, and saves as a free lead magnet', async () => {
    setup();
    const free = await group('free');
    fireEvent.change(within(free).getByLabelText('Lead magnets link 1'), { target: { value: 'https://example.com/files/sleep-checklist.pdf' } });
    expect((within(free).getByLabelText('Lead magnets type 1') as HTMLSelectElement).value).toBe('ebook');
    expect((within(free).getByLabelText('Lead magnets name 1') as HTMLInputElement).value).toBe('Sleep Checklist');
    fireEvent.click(within(free).getByRole('button', { name: /^Save lead magnet/i }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ kind: 'ebook', title: 'Sleep Checklist', price_cents: 0, access_model: 'free', affiliate_url: 'https://example.com/files/sleep-checklist.pdf', booking_url: null, status: 'draft' });
  });

  it('a booking link on a paid call is kept as the booking link with its price, and needs a price first', async () => {
    setup();
    const paid = await group('paid');
    fireEvent.change(within(paid).getByLabelText('Paid products link 1'), { target: { value: 'https://cal.com/guide/intro-call' } });
    const save = within(paid).getByRole('button', { name: /^Save paid product/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // no price yet
    fireEvent.change(within(paid).getByLabelText('Paid products price 1'), { target: { value: '49' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ kind: 'one_to_one_call', price_cents: 4900, access_model: 'paid', booking_url: 'https://cal.com/guide/intro-call', affiliate_url: null });
  });

  it('several rows save together, and the saved products appear as cards', async () => {
    setup();
    const paid = await group('paid');
    fireEvent.change(within(paid).getByLabelText('Paid products link 1'), { target: { value: 'https://example.com/a-guide.pdf' } });
    fireEvent.change(within(paid).getByLabelText('Paid products price 1'), { target: { value: '19' } });
    fireEvent.click(within(paid).getByRole('button', { name: /add another/i }));
    fireEvent.change(within(paid).getByLabelText('Paid products link 2'), { target: { value: 'https://www.youtube.com/playlist?list=abc' } });
    fireEvent.change(within(paid).getByLabelText('Paid products price 2'), { target: { value: '99' } });
    fireEvent.click(within(paid).getByRole('button', { name: /^Save 2 paid products/i }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(built(paid).length).toBe(2));
  });

  it('every type has a "build a new one" link that opens the builder that makes it', async () => {
    setup();
    const paid = await group('paid');
    const href = (type: string) => paid.querySelector(`[data-build-type="${type}"]`)?.getAttribute('href');
    // made by the Offer builder: it opens with that type picked out
    for (const type of ['ebook', 'course', 'one_to_one_call', 'group_call', 'in_person', 'community']) expect(href(type)).toBe(`/guardians/workspace?tab=offer_builder&type=${type}`);
    // made elsewhere
    expect(href('routine')).toBe('/guardians/workspace?tab=protocols');
    expect(href('routine_guidance')).toBe('/guardians/workspace?tab=protocols');
    expect(href('recipe_book')).toBe('/guardians/workspace?tab=recipes');
    expect(href('festival')).toBe('/guardians/workspace?tab=events');
    expect(href('product')).toBe('/guardians/workspace?tab=products');
    // the dotted cards link the same way
    expect(paid.querySelector('[data-suggestion="course"] [data-suggestion-build]')?.getAttribute('href')).toBe('/guardians/workspace?tab=offer_builder&type=course');
  });

  it('Delete works without the browser dialog: it asks in the page, then deletes', async () => {
    mocks.offers.mockReturnValue([{ id: 'o1', guide_id: 'owner', kind: 'routine', title: '7-day menopause sleep challenge', description: null, price_cents: 0, currency: 'GBP', access_model: 'free', status: 'draft', affiliate_url: null, booking_url: null, file_path: null, cover_url: null }]);
    const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false); // a browser that swallows dialogs
    setup();
    const free = await group('free');
    const card = (await within(free).findByText('7-day menopause sleep challenge')).closest('.r3-pcard') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /delete/i }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith('owner', 'o1'));
    await waitFor(() => expect(built(free).length).toBe(0));
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('Cancel keeps the product', async () => {
    mocks.offers.mockReturnValue([{ id: 'o1', guide_id: 'owner', kind: 'ebook', title: 'Keep me', description: null, price_cents: 2900, currency: 'GBP', access_model: 'paid', status: 'draft', affiliate_url: null, booking_url: null, file_path: null, cover_url: null }]);
    setup();
    const paid = await group('paid');
    const card = (await within(paid).findByText('Keep me')).closest('.r3-pcard') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /delete/i }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(mocks.del).not.toHaveBeenCalled();
    expect(within(paid).getByText('Keep me')).toBeTruthy();
  });

  it('shows suggested products as dotted cards beside the current ones, each numbered by value with a suggested price', async () => {
    setup();
    const paid = await group('paid');
    const cards = [...paid.querySelectorAll('[data-suggestion]')];
    expect(cards.length).toBe(11);
    expect(paid.querySelector('[data-suggestion="recipe_book"] [data-value-rank]')?.textContent).toBe('#02');
    expect(paid.querySelector('[data-suggestion="festival"] [data-value-rank]')?.textContent).toBe('#11');
    for (const card of cards) expect(card.querySelector('[data-suggested-price]')?.textContent).toMatch(/^Suggested \D?\d/);
    const free = await group('free');
    expect([...free.querySelectorAll('[data-suggestion]')].every((card) => card.querySelector('[data-suggested-price]')?.textContent === 'Free')).toBe(true);
    expect(free.querySelector('[data-suggestion="festival"]')).toBeNull(); // a retreat is not a lead magnet
  });

  it('a dotted card fills the next empty row with its type and suggested price', async () => {
    setup();
    const paid = await group('paid');
    fireEvent.click(paid.querySelector('[data-suggestion="routine"] [data-suggestion-upload]') as HTMLElement);
    expect((within(paid).getByLabelText('Paid products type 1') as HTMLSelectElement).value).toBe('routine');
    expect((within(paid).getByLabelText('Paid products price 1') as HTMLInputElement).value).toBe('49');
    expect(paid.querySelector('[data-suggestion="routine"] [data-suggestion-build]')?.getAttribute('href')).toBe('/guardians/workspace?tab=protocols');
  });

  it('a type you already have shows its current card instead of the dotted one, and deleting it brings the dotted card back, with an empty "add" card always at the end', async () => {
    mocks.offers.mockReturnValue([{ id: 'o1', guide_id: 'owner', kind: 'ebook', title: '21-day sleep reset', description: null, price_cents: 2900, currency: 'GBP', access_model: 'paid', status: 'draft', affiliate_url: null, booking_url: null, file_path: null, cover_url: null }]);
    setup();
    const paid = await group('paid');
    const card = (await within(paid).findByText('21-day sleep reset')).closest('.r3-pcard') as HTMLElement;
    expect(paid.querySelector('[data-suggestion="ebook"]')).toBeNull();
    expect(paid.querySelector('[data-add-empty]')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: /delete/i }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(paid.querySelector('[data-suggestion="ebook"]')).toBeTruthy());
    expect(paid.querySelector('[data-add-empty]')).toBeTruthy();
  });

  it('the suggestion cards carry a colour for their type, and the cards sit three to a row', async () => {
    setup();
    const paid = await group('paid');
    const colours = [...paid.querySelectorAll('[data-suggestion]')].map((card) => (card as HTMLElement).style.getPropertyValue('--type'));
    expect(colours.every((colour) => /^#[0-9A-F]{6}$/i.test(colour))).toBe(true);
    expect(new Set(colours).size).toBe(colours.length); // a different colour for each type
    const grid = paid.querySelector('.r3-pcard')!.closest('[style*="grid-template-columns"]') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toMatch(/minmax\(240px/);
  });

  it('switching tabs keeps what was typed in the other tab', async () => {
    setup();
    const free = await group('free');
    fireEvent.change(within(free).getByLabelText('Lead magnets link 1'), { target: { value: 'https://example.com/a-checklist.pdf' } });
    await group('paid');
    const back = await group('free');
    expect((within(back).getByLabelText('Lead magnets link 1') as HTMLInputElement).value).toBe('https://example.com/a-checklist.pdf');
  });
});
