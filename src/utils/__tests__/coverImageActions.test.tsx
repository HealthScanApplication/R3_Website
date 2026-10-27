// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// Storage and the database are faked; the image provider is a mock. Nothing here reaches Supabase or OpenAI.
const backend = vi.hoisted(() => {
  const upload = vi.fn(async (..._a: unknown[]) => ({ error: null as null | { message: string } }));
  const storage = vi.fn((_bucket: string) => ({ upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/guide-assets/${p}` } }) }));
  const calls: Array<[string, ...unknown[]]> = [];
  let row: Record<string, unknown> = {};
  let failWith: { message: string } | null = null;
  const from = vi.fn((table: string) => ({
    update: (payload: Record<string, unknown>) => {
      calls.push(['update', table, payload]);
      const chain: any = {
        eq: (column: string, value: unknown) => { calls.push(['eq', column, value]); return chain; },
        select: () => chain,
        single: async () => (failWith ? { data: null, error: failWith } : { data: { ...row, ...payload }, error: null }),
      };
      return chain;
    },
  }));
  return { upload, storage, from, calls, client: { storage: { from: storage }, from }, setRow: (r: Record<string, unknown>) => { row = r; }, fail: (e: { message: string } | null) => { failWith = e; } };
});
vi.mock('../supabase/client', () => ({ getSupabaseClient: () => backend.client }));

const provider = vi.hoisted(() => ({ imageStatus: vi.fn(), generateImage: vi.fn() }));
vi.mock('../guardianImages', async (importOriginal) => ({ ...(await importOriginal<typeof import('../guardianImages')>()), imageStatus: provider.imageStatus, generateImage: provider.generateImage }));
const brands = vi.hoisted(() => ({ list: vi.fn(async (_guideId: string) => [] as unknown[]) }));
vi.mock('../guidePortal', async (importOriginal) => ({ ...(await importOriginal<typeof import('../guidePortal')>()), listGuideBrands: brands.list }));

import { CoverImageActions } from '../../components/guides/CoverImageActions';
import { OfferCoverControls } from '../../components/guides/OfferCoverControls';

const status = { live: true, house: true, house_left: 5, house_per_day: 10, model: 'gpt-image-1', prices: { low: { square: 0.011, wide: 0.016 }, medium: { square: 0.042, wide: 0.063 }, high: { square: 0.167, wide: 0.25 } }, own: { connected: false, key_hint: null, connected_at: null, available: true } };
const WEBP = `data:image/webp;base64,${btoa('RIFF....WEBPVP8 ')}`;
const png = () => new File([new Uint8Array(10)], 'jar.png', { type: 'image/png' });
const mp4 = () => new File([new Uint8Array(10)], 'clip.mp4', { type: 'video/mp4' });
const big = () => new File([new Uint8Array(9 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
const drop = (el: Element, files: File[]) => fireEvent.drop(el, { dataTransfer: { files, types: ['Files'] } });

beforeEach(() => {
  provider.imageStatus.mockResolvedValue(status);
  provider.generateImage.mockResolvedValue({ image: WEBP, usd: 0.042, mock: false, size: '1024x1024' });
  backend.calls.length = 0;
  backend.fail(null);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('CoverImageActions: manual upload keeps working beside the AI button', () => {
  const setup = (props: Partial<React.ComponentProps<typeof CoverImageActions>> = {}) => {
    const onChange = vi.fn(async (_url: string | null) => undefined);
    const view = render(<CoverImageActions userId="u-1" title="Deep sleep" description="Seven calm evenings." kind="routine" imageUrl="https://cdn.example/old.jpg" onChange={onChange} {...props} />);
    return { onChange, zone: view.container.firstElementChild as HTMLElement };
  };

  it('Upload image opens the file chooser', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('a chosen image is stored in the person\'s own folder and handed on', async () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByTestId('photo-input'), { target: { files: [png()] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const [path, file, options] = backend.upload.mock.calls[0] as [string, File, { contentType: string }];
    expect(backend.storage).toHaveBeenCalledWith('guide-assets');
    expect(path).toMatch(/^u-1\/cover-\d+\.png$/);
    expect(options.contentType).toBe('image/png');
    expect(file.type).toBe('image/png');
    expect(onChange).toHaveBeenCalledWith(`https://x.supabase.co/storage/v1/object/public/guide-assets/${path}`);
  });

  it('a dropped image works the same way', async () => {
    const { onChange, zone } = setup();
    drop(zone, [png()]);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect((backend.upload.mock.calls[0] as unknown[])[0]).toMatch(/^u-1\/cover-\d+\.png$/);
  });

  it('refuses a video or a file that is too large with a plain message, and stores nothing', async () => {
    const { onChange, zone } = setup();
    drop(zone, [mp4()]);
    expect((await screen.findByRole('alert')).textContent).toBe('Choose a JPG, PNG or WebP image.');
    drop(zone, [big()]);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The image must be smaller than 8 MB.'));
    expect(backend.upload).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a failed upload shows the reason and changes nothing', async () => {
    backend.upload.mockResolvedValueOnce({ error: { message: 'Bucket not found' } });
    const { onChange, zone } = setup();
    drop(zone, [png()]);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Bucket not found/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Remove clears the image, and is only offered when there is one', async () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    cleanup();
    setup({ imageUrl: null });
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
  });

  it('Replace with AI: accepted pictures go through the same onChange as an upload', async () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Replace with AI' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: /^Generate/ }));
    await within(dialog).findByAltText('New image');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect((backend.upload.mock.calls[0] as unknown[])[0]).toMatch(/^u-1\/ai-image-\d+\.webp$/);
    expect(onChange.mock.calls[0][0]).toMatch(/^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/guide-assets\/u-1\/ai-image-\d+\.webp$/);
  });

  it('a change that cannot be saved is reported, and the dialog stays open on the preview', async () => {
    const { onChange } = setup({ onChange: vi.fn(async () => { throw new Error('Could not save the image.'); }) });
    void onChange;
    fireEvent.click(screen.getByRole('button', { name: 'Replace with AI' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: /^Generate/ }));
    await within(dialog).findByAltText('New image');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/Could not save the image/);
    expect(within(dialog).getByAltText('New image')).toBeTruthy();
  });

  it('a file dropped on the open AI dialog does not become an upload (the dialog sits inside the drop target)', async () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Replace with AI' }));
    const dialog = await screen.findByRole('dialog');
    drop(dialog, [png()]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(backend.upload).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('while an upload runs the buttons are switched off', async () => {
    let finish: (value: { error: null }) => void = () => undefined;
    backend.upload.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const { zone } = setup();
    drop(zone, [png()]);
    await waitFor(() => expect(screen.getByRole('button', { name: /Uploading/ })).toHaveProperty('disabled', true));
    expect(screen.getByRole('button', { name: 'Replace with AI' })).toHaveProperty('disabled', true);
    finish({ error: null });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload image' })).toHaveProperty('disabled', false));
  });
});

describe('OfferCoverControls: the cover is saved on the offer', () => {
  const offer = { id: 'o-1', guide_id: 'u-1', kind: 'routine', title: '7-day menopause routine', description: 'A gentle week. Delivery: PDF.', cover_url: 'https://cdn.example/old.jpg', price_cents: 0, currency: 'EUR', affiliate_url: null, access_model: 'free', file_path: null, booking_url: null, status: 'draft' } as const;
  beforeEach(() => backend.setRow({ ...offer }));

  it('an accepted AI picture is stored, then set as the offer\'s cover_url (only on this Guardian\'s own offer)', async () => {
    const onUpdated = vi.fn();
    render(<OfferCoverControls offer={offer as any} title="7-day menopause routine" guideId="u-1" onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Replace with AI' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: /^Generate/ }));
    await within(dialog).findByAltText('New image');
    expect(backend.calls).toEqual([]); // the offer is untouched while previewing
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    const path = (backend.upload.mock.calls[0] as unknown[])[0] as string;
    expect(path).toMatch(/^u-1\/ai-image-\d+\.webp$/);
    const url = `https://x.supabase.co/storage/v1/object/public/guide-assets/${path}`;
    expect(backend.calls).toEqual([['update', 'guide_offers', { cover_url: url }], ['eq', 'id', 'o-1'], ['eq', 'guide_id', 'u-1']]);
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: 'o-1', cover_url: url }));
  });

  it('the prompt is built from this offer\'s title and description', async () => {
    render(<OfferCoverControls offer={offer as any} title="7-day menopause routine" guideId="u-1" onUpdated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Replace with AI' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: /^Generate/ }));
    await within(dialog).findByAltText('New image');
    const prompt = provider.generateImage.mock.calls[0][0] as string;
    expect(prompt).toContain('"7-day menopause routine", a daily routine');
    expect(prompt).toContain('A gentle week.');
    expect(prompt).not.toContain('Delivery');
  });

  it('a manual upload sets the cover too, and Remove clears it', async () => {
    const onUpdated = vi.fn();
    render(<OfferCoverControls offer={offer as any} title="7-day menopause routine" guideId="u-1" onUpdated={onUpdated} />);
    fireEvent.change(screen.getByTestId('photo-input'), { target: { files: [png()] } });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    expect((backend.upload.mock.calls[0] as unknown[])[0]).toMatch(/^u-1\/cover-\d+\.png$/);
    expect(backend.calls[0]).toEqual(['update', 'guide_offers', { cover_url: expect.stringMatching(/\/u-1\/cover-\d+\.png$/) }]);
    backend.calls.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(2));
    expect(backend.calls[0]).toEqual(['update', 'guide_offers', { cover_url: null }]);
  });

  it('when the offer cannot be updated the cover is not reported as changed and the person is told', async () => {
    backend.fail({ message: 'new row violates row-level security policy' });
    const onUpdated = vi.fn();
    render(<OfferCoverControls offer={offer as any} title="7-day menopause routine" guideId="u-1" onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Replace with AI' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: /^Generate/ }));
    await within(dialog).findByAltText('New image');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/row-level security/);
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
