// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// A Guardian's shop product can have its picture replaced with an AI one in the product form. Storage and the image
// provider are mocks; nothing reaches Supabase or OpenAI.
const backend = vi.hoisted(() => {
  const upload = vi.fn(async (..._a: unknown[]) => ({ error: null as null | { message: string } }));
  const from = vi.fn((_bucket: string) => ({ upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/guide-assets/${p}` } }) }));
  const saveGuideProduct = vi.fn(async (_guideId: string, product: any, protocolIds: string[]) => ({ ...product, id: product.id || 'p1', guide_id: 'g', commission_percent: null, created_at: '', updated_at: '', protocol_ids: protocolIds }));
  return { upload, from, saveGuideProduct, client: { storage: { from } } };
});
vi.mock('../supabase/client', () => ({ getSupabaseClient: () => backend.client }));
const provider = vi.hoisted(() => ({ imageStatus: vi.fn(), generateImage: vi.fn() }));
vi.mock('../guardianImages', async (importOriginal) => ({ ...(await importOriginal<typeof import('../guardianImages')>()), imageStatus: provider.imageStatus, generateImage: provider.generateImage }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../guidePortal')>()),
  listGuideProducts: vi.fn(async () => []),
  listGuideBrands: vi.fn(async () => []),
  saveGuideProduct: backend.saveGuideProduct,
}));

import { GuardianProducts } from '../../components/guides/GuardianProducts';

const status = { live: true, house: true, house_left: 5, house_per_day: 10, model: 'gpt-image-1', prices: { low: { square: 0.011, wide: 0.016 }, medium: { square: 0.042, wide: 0.063 }, high: { square: 0.167, wide: 0.25 } }, own: { connected: false, key_hint: null, connected_at: null, available: true } };
const WEBP = `data:image/webp;base64,${btoa('RIFF....WEBPVP8 ')}`;

beforeEach(() => {
  provider.imageStatus.mockResolvedValue(status);
  provider.generateImage.mockResolvedValue({ image: WEBP, usd: 0.042, mock: false, size: '1024x1024' });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function openForm(props: Partial<React.ComponentProps<typeof GuardianProducts>> = {}) {
  render(<GuardianProducts guideId="g" guardianSlug="barbara" commissionPercent={15} protocols={[]} {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: /Add your first product/ }));
  fireEvent.change(screen.getByLabelText('Shopify product link'), { target: { value: 'https://shop.barbara.com/products/sleep-mag' } });
  fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Sleep Magnesium' } });
  fireEvent.change(screen.getByLabelText('Short description'), { target: { value: 'Magnesium glycinate for a calmer night.' } });
}

it('draws the product from its name and description, previews it, and only fills the Image link once it is accepted', async () => {
  await openForm();
  fireEvent.click(screen.getByRole('button', { name: 'Add image with AI' }));
  const dialog = await screen.findByRole('dialog', { name: 'Replace image with AI' });
  fireEvent.click(await within(dialog).findByRole('button', { name: /^Generate/ }));
  await within(dialog).findByAltText('New image');
  const prompt = provider.generateImage.mock.calls[0][0] as string;
  expect(prompt).toContain('"Sleep Magnesium", a wellness product');
  expect(prompt).toContain('Magnesium glycinate for a calmer night.');
  expect((screen.getByLabelText('Image link') as HTMLInputElement).value).toBe(''); // still the old image while previewing
  expect(backend.upload).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));
  await waitFor(() => expect((screen.getByLabelText('Image link') as HTMLInputElement).value).toMatch(/^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/guide-assets\/g\/ai-image-\d+\.webp$/));
  expect((backend.upload.mock.calls[0] as unknown[])[0]).toMatch(/^g\/ai-image-\d+\.webp$/);
  expect(backend.saveGuideProduct).not.toHaveBeenCalled(); // kept with the product when Save product is pressed

  fireEvent.click(screen.getByRole('button', { name: /Save product/ }));
  await screen.findByText('Sleep Magnesium saved.');
  expect(backend.saveGuideProduct).toHaveBeenCalledWith('g', expect.objectContaining({ image_url: expect.stringMatching(/\/g\/ai-image-\d+\.webp$/) }), []);
});

it('Cancel leaves the product\'s image exactly as it was', async () => {
  await openForm();
  fireEvent.change(screen.getByLabelText('Image link'), { target: { value: 'https://cdn.shopify.com/mag.png' } });
  fireEvent.click(screen.getByRole('button', { name: 'Replace with AI' }));
  const dialog = await screen.findByRole('dialog', { name: 'Replace image with AI' });
  fireEvent.click(await within(dialog).findByRole('button', { name: /^Generate/ }));
  await within(dialog).findByAltText('New image');
  expect(within(dialog).getByAltText('Current image')).toHaveProperty('src', 'https://cdn.shopify.com/mag.png');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog', { name: 'Replace image with AI' })).toBeNull();
  expect((screen.getByLabelText('Image link') as HTMLInputElement).value).toBe('https://cdn.shopify.com/mag.png');
  expect(backend.upload).not.toHaveBeenCalled();
});

it('with no image provider connected it refuses politely and the image link is untouched', async () => {
  provider.imageStatus.mockResolvedValue({ ...status, house: false });
  const openContentBuilder = vi.fn();
  await openForm({ onOpenContentBuilder: openContentBuilder });
  fireEvent.change(screen.getByLabelText('Image link'), { target: { value: 'https://cdn.shopify.com/mag.png' } });
  fireEvent.click(screen.getByRole('button', { name: 'Replace with AI' }));
  const dialog = await screen.findByRole('dialog', { name: 'Replace image with AI' });
  expect((await within(dialog).findByRole('alert')).textContent).toMatch(/No image provider is connected/);
  fireEvent.click(within(dialog).getByRole('button', { name: /Open the Content builder/ }));
  expect(openContentBuilder).toHaveBeenCalledTimes(1);
  expect(provider.generateImage).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Image link') as HTMLInputElement).value).toBe('https://cdn.shopify.com/mag.png');
});

it('a picture can still be dropped on the product form (manual upload)', async () => {
  await openForm();
  const input = screen.getByTestId('photo-input') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(10)], 'jar.png', { type: 'image/png' })] } });
  await waitFor(() => expect((screen.getByLabelText('Image link') as HTMLInputElement).value).toMatch(/\/g\/cover-\d+\.png$/));
});
