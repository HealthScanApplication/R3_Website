// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({
  rows: [] as any[],
  publicRows: [] as any[],
  saveGuideProduct: vi.fn(async (_guideId: string, product: any, protocolIds: string[]) => ({ ...product, id: product.id || 'p1', guide_id: 'g', commission_percent: null, created_at: '', updated_at: '', protocol_ids: protocolIds })),
}));

vi.mock('../guidePortal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../guidePortal')>()),
  listGuideProducts: vi.fn(async () => db.rows),
  listPublicGuideProducts: vi.fn(async () => db.publicRows),
  saveGuideProduct: db.saveGuideProduct,
  deleteGuideProduct: vi.fn(async () => {}),
}));

import { GuardianProducts, GuardianShop, productsErrorMessage } from '../../components/guides/GuardianProducts';

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); db.saveGuideProduct.mockClear(); db.rows = []; db.publicRows = []; });

it('imports a Shopify product, picks a variant, attaches a Protocol and saves it', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/products/sleep-mag.js')) return Response.json({ title: 'Sleep Magnesium', handle: 'sleep-mag', description: '<p>Glycinate.</p>', featured_image: '//cdn.shopify.com/mag.png', variants: [{ id: 501, title: '60 caps', price: 1990, available: true }, { id: 502, title: '120 caps', price: 2990, available: true }] });
    if (url.endsWith('/meta.json')) return Response.json({ currency: 'EUR', myshopify_domain: 'barbara.myshopify.com' });
    return new Response('', { status: 404 });
  }));
  render(<GuardianProducts guideId="g" guardianSlug="barbara" commissionPercent={15} protocols={[{ id: 'pr1', name: 'Deep Sleep' }, { id: 'pr2', name: 'Gut Reset' }]} />);
  await settle();
  expect(screen.getByText('15%')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Add your first product/ }));
  fireEvent.change(screen.getByLabelText('Shopify product link'), { target: { value: 'https://shop.barbara.com/products/sleep-mag' } });
  fireEvent.click(screen.getByRole('button', { name: /Fetch from Shopify/ }));
  await waitFor(() => expect((screen.getByLabelText('Product name') as HTMLInputElement).value).toBe('Sleep Magnesium'));
  expect((screen.getByLabelText('Currency') as HTMLInputElement).value).toBe('EUR');
  fireEvent.change(screen.getByLabelText('Variant'), { target: { value: '502' } });
  expect((screen.getByLabelText('Price') as HTMLInputElement).value).toBe('29.90');
  fireEvent.change(screen.getByLabelText('Your discount code'), { target: { value: 'SLEEP10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Deep Sleep' }));
  fireEvent.click(screen.getByLabelText('Show on my site and in the app'));
  fireEvent.click(screen.getByRole('button', { name: /Save product/ }));
  await screen.findByText('Sleep Magnesium saved.');
  expect(db.saveGuideProduct).toHaveBeenCalledWith('g', expect.objectContaining({
    shop_domain: 'shop.barbara.com', myshopify_domain: 'barbara.myshopify.com', product_handle: 'sleep-mag', variant_id: '502', variant_title: '120 caps',
    price_cents: 2990, currency: 'EUR', discount_code: 'SLEEP10', status: 'published', image_url: 'https://cdn.shopify.com/mag.png',
  }), ['pr1']);
  const buy = screen.getByRole('link', { name: 'Open buy link for Sleep Magnesium' }).getAttribute('href')!;
  expect(buy).toMatch(/^https:\/\/shop\.barbara\.com\/cart\/502:1\?discount=SLEEP10&ref=routine3/);
  expect(screen.getByText(/On Deep Sleep/)).toBeTruthy();
});

it('saves a hand-filled product when the store cannot be read', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 404 })));
  render(<GuardianProducts guideId="g" guardianSlug="barbara" commissionPercent={15} protocols={[]} />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: /Add your first product/ }));
  fireEvent.change(screen.getByLabelText('Shopify product link'), { target: { value: 'https://headless.example.com/products/tea?variant=77' } });
  fireEvent.click(screen.getByRole('button', { name: /Fetch from Shopify/ }));
  expect(await screen.findByText(/fill in the details by hand/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Save product/ }));
  expect(await screen.findByText('Add the product name.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Calm Tea' } });
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '12,50' } });
  fireEvent.click(screen.getByRole('button', { name: /Save product/ }));
  await screen.findByText('Calm Tea saved.');
  expect(db.saveGuideProduct).toHaveBeenCalledWith('g', expect.objectContaining({ shop_domain: 'headless.example.com', product_handle: 'tea', variant_id: '77', price_cents: 1250, status: 'draft' }), []);
});

it('shows published products on the public site with attributed buy links, and nothing when empty', async () => {
  const { container } = render(<GuardianShop guideId="g" guardianSlug="barbara" guardianName="Barbara" pagePadding="24px" />);
  await settle();
  expect(container.innerHTML).toBe('');
  cleanup();
  db.publicRows = [{ id: 'p1', shop_domain: 'shop.barbara.com', product_handle: 'tea', variant_id: null, title: 'Calm Tea', price_cents: 1250, currency: 'EUR', discount_code: 'TEA5', image_url: null, description: null, protocol_ids: [] }];
  render(<GuardianShop guideId="g" guardianSlug="barbara" guardianName="Barbara" pagePadding="24px" />);
  expect(await screen.findByText('Calm Tea')).toBeTruthy();
  const href = screen.getByRole('link', { name: 'View product' }).getAttribute('href')!;
  expect(href.startsWith('https://shop.barbara.com/discount/TEA5?redirect=')).toBe(true);
  expect(decodeURIComponent(decodeURIComponent(href))).toContain('attributes[routine3_guardian]=barbara');
});

it('explains a missing products migration', () => {
  expect(productsErrorMessage({ code: 'PGRST205', message: "Could not find the table 'public.guide_products'" })).toContain('latest database update');
  expect(productsErrorMessage({ code: '23505', message: 'duplicate key' })).toBe('That product variant is already in your list.');
});
