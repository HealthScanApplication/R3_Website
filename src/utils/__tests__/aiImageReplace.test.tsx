// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { defaultBrandKit, brandKitLinks } from '../brandKit';
import { HOUSE_IMAGE_STYLE } from '../guardianImageStyle';

// The browser's storage client is faked, the image provider is a mock: nothing here touches Supabase or OpenAI, and nothing is paid for.
const store = vi.hoisted(() => {
  const upload = vi.fn(async (..._a: unknown[]) => ({ error: null as null | { message: string } }));
  const from = vi.fn((_bucket: string) => ({ upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/guide-assets/${p}` } }) }));
  return { upload, from, client: { storage: { from } } };
});
vi.mock('../supabase/client', () => ({ getSupabaseClient: () => store.client }));

const provider = vi.hoisted(() => ({ imageStatus: vi.fn(), generateImage: vi.fn() }));
vi.mock('../guardianImages', async (importOriginal) => ({ ...(await importOriginal<typeof import('../guardianImages')>()), imageStatus: provider.imageStatus, generateImage: provider.generateImage }));

const brands = vi.hoisted(() => ({ list: vi.fn(async (_guideId: string) => [] as unknown[]) }));
vi.mock('../guidePortal', async (importOriginal) => ({ ...(await importOriginal<typeof import('../guidePortal')>()), listGuideBrands: brands.list }));

import { AiImageReplace } from '../../components/guides/AiImageReplace';

const status = (over: Record<string, unknown> = {}, own: Record<string, unknown> = {}) => ({
  live: true, house: true, house_left: 5, house_per_day: 10, model: 'gpt-image-1',
  prices: { low: { square: 0.011, wide: 0.016 }, medium: { square: 0.042, wide: 0.063 }, high: { square: 0.167, wide: 0.25 } },
  own: { connected: false, key_hint: null, connected_at: null, available: true, ...own },
  ...over,
});
const WEBP = `data:image/webp;base64,${btoa('RIFF....WEBPVP8 ')}`;
const SVG = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"/>')}`;
const brandWith = (visual: string) => ({ guide_id: 'u-1', name: 'Barbara O\'Neill', kind: 'personal', is_primary: true, social_links: brandKitLinks({ ...defaultBrandKit(), visual }) });

const onAccepted = vi.fn();
const onOpenContentBuilder = vi.fn();
function setup(props: Partial<React.ComponentProps<typeof AiImageReplace>> = {}) {
  return render(<AiImageReplace userId="u-1" title="7-day menopause routine" description="A gentle week of food, movement and sleep. Delivery: PDF by email." kind="routine" currentUrl="https://cdn.example/old.jpg" onAccepted={onAccepted} onOpenContentBuilder={onOpenContentBuilder} {...props} />);
}
const openDialog = async () => { fireEvent.click(screen.getByRole('button', { name: 'Replace with AI' })); return screen.findByRole('dialog'); };
const generate = async (dialog: HTMLElement) => {
  fireEvent.click(await within(dialog).findByRole('button', { name: /^Generate/ }));
  return within(dialog).findByAltText('New image');
};

beforeEach(() => {
  provider.imageStatus.mockResolvedValue(status());
  provider.generateImage.mockResolvedValue({ image: WEBP, usd: 0.042, mock: false, size: '1024x1024' });
  brands.list.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('the style: the brand\'s visual language, else the house pencil sketch, always visible and editable', () => {
  it('shows the house pencil style when the brand kit has no visual language, and says it is the default', async () => {
    setup();
    const dialog = await openDialog();
    const style = await within(dialog).findByLabelText('Image style') as HTMLTextAreaElement;
    expect(style.value).toBe(HOUSE_IMAGE_STYLE);
    expect(dialog.textContent).toMatch(/House pencil sketch/i);
    fireEvent.change(style, { target: { value: 'Charcoal and soft light.' } });
    expect(style.value).toBe('Charcoal and soft light.');
  });

  it('uses the brand kit\'s Visual language when it has one, and can go back to the house style', async () => {
    brands.list.mockResolvedValue([brandWith('Soft morning light, linen and herbs.')]);
    setup();
    const dialog = await openDialog();
    const style = await within(dialog).findByLabelText('Image style') as HTMLTextAreaElement;
    await waitFor(() => expect(style.value).toBe('Soft morning light, linen and herbs.'));
    expect(brands.list).toHaveBeenCalledWith('u-1');
    expect(dialog.textContent).toMatch(/your brand.s Visual language/i);
    fireEvent.click(within(dialog).getByRole('button', { name: /house pencil style/i }));
    expect(style.value).toBe(HOUSE_IMAGE_STYLE);
  });

  it('keeps what the person typed when the brand kit arrives a moment later', async () => {
    let release: (value: unknown[]) => void = () => undefined;
    brands.list.mockReturnValue(new Promise<unknown[]>((resolve) => { release = resolve; }));
    setup();
    const dialog = await openDialog();
    const style = await within(dialog).findByLabelText('Image style') as HTMLTextAreaElement;
    fireEvent.change(style, { target: { value: 'My own words.' } });
    await act(async () => { release([brandWith('Brand look')]); });
    expect(style.value).toBe('My own words.');
  });

  it('a brand kit that cannot be read falls back to the house style instead of blocking', async () => {
    brands.list.mockRejectedValue(new Error('offline'));
    setup();
    const dialog = await openDialog();
    expect(((await within(dialog).findByLabelText('Image style')) as HTMLTextAreaElement).value).toBe(HOUSE_IMAGE_STYLE);
  });
});

describe('preview, accept, try again, cancel', () => {
  it('asks the image pipeline for a square image built from the title, description and style, and spends nothing until Generate is pressed', async () => {
    setup();
    const dialog = await openDialog();
    await within(dialog).findByLabelText('Image style');
    expect(provider.generateImage).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Generate · ≈ \$0\.042/ }));
    await within(dialog).findByAltText('New image');
    expect(provider.generateImage).toHaveBeenCalledTimes(1);
    const [prompt, aspect, quality, source] = provider.generateImage.mock.calls[0];
    expect(prompt).toContain('"7-day menopause routine", a daily routine');
    expect(prompt).toContain('A gentle week of food, movement and sleep.');
    expect(prompt).not.toContain('Delivery');
    expect(prompt).toContain(`Style: ${HOUSE_IMAGE_STYLE}`);
    expect([aspect, quality, source]).toEqual(['1:1', 'medium', 'house']);
  });

  it('shows the result beside the current image and never replaces anything until Accept', async () => {
    setup();
    const dialog = await openDialog();
    const preview = await generate(dialog);
    expect(preview).toHaveProperty('src', WEBP);
    expect(within(dialog).getByAltText('Current image')).toHaveProperty('src', 'https://cdn.example/old.jpg');
    expect(within(dialog).getByRole('button', { name: 'Accept' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(onAccepted).not.toHaveBeenCalled();
    expect(store.upload).not.toHaveBeenCalled();
  });

  it('Accept stores the image in guide-assets under the person\'s own folder and hands back its public address', async () => {
    setup();
    const dialog = await openDialog();
    await generate(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(store.from).toHaveBeenCalledWith('guide-assets');
    const [path, file, options] = store.upload.mock.calls[0] as [string, File, { contentType: string; upsert: boolean }];
    expect(path).toMatch(/^u-1\/ai-image-\d+\.webp$/);
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/webp');
    expect(options).toEqual({ contentType: 'image/webp', upsert: false });
    expect(onAccepted).toHaveBeenCalledWith(`https://x.supabase.co/storage/v1/object/public/guide-assets/${path}`);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Try again draws another with the style as it is now, and the first is not kept', async () => {
    provider.generateImage.mockResolvedValueOnce({ image: WEBP, usd: 0.042, mock: false, size: '1024x1024' })
      .mockResolvedValueOnce({ image: `data:image/webp;base64,${btoa('SECOND....WEBP')}`, usd: 0.042, mock: false, size: '1024x1024' });
    setup();
    const dialog = await openDialog();
    await generate(dialog);
    fireEvent.change(within(dialog).getByLabelText('Image style'), { target: { value: 'Ink wash, loose and light.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(provider.generateImage).toHaveBeenCalledTimes(2));
    expect(provider.generateImage.mock.calls[1][0]).toContain('Style: Ink wash, loose and light.');
    await waitFor(() => expect((within(dialog).getByAltText('New image') as HTMLImageElement).src).toContain(btoa('SECOND....WEBP')));
    expect(onAccepted).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(store.upload).toHaveBeenCalledTimes(1);
  });

  it('Cancel throws the result away: nothing is stored and nothing changes', async () => {
    setup();
    const dialog = await openDialog();
    await generate(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onAccepted).not.toHaveBeenCalled();
    expect(store.upload).not.toHaveBeenCalled();
  });

  it('closing before the picture arrives drops it instead of reporting it later', async () => {
    let finish: (value: unknown) => void = () => undefined;
    provider.generateImage.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    setup();
    const dialog = await openDialog();
    fireEvent.click(await within(dialog).findByRole('button', { name: /^Generate/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await act(async () => { finish({ image: WEBP, usd: 0.042, mock: false, size: '1024x1024' }); });
    expect(onAccepted).not.toHaveBeenCalled();
    expect(store.upload).not.toHaveBeenCalled();
  });

  it('a failed generation says why, keeps the current image and lets the person try again', async () => {
    provider.generateImage.mockRejectedValueOnce(new Error('OpenAI declined this prompt. Try describing the scene differently.'));
    setup();
    const dialog = await openDialog();
    fireEvent.click(await within(dialog).findByRole('button', { name: /^Generate/ }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/OpenAI declined this prompt/);
    expect(onAccepted).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: /^Generate/ })).toHaveProperty('disabled', false);
  });

  it('a failed save keeps the preview, reports the problem and does not claim the image was accepted', async () => {
    store.upload.mockResolvedValueOnce({ error: { message: 'mime type not supported' } });
    setup();
    const dialog = await openDialog();
    await generate(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/mime type not supported/);
    expect(onAccepted).not.toHaveBeenCalled();
    expect(within(dialog).getByAltText('New image')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Accept' })).toHaveProperty('disabled', false);
  });

  it('bills the Guardian\'s own OpenAI account when one is connected', async () => {
    provider.imageStatus.mockResolvedValue(status({}, { connected: true, key_hint: 'sk-…4242' }));
    setup();
    const dialog = await openDialog();
    expect((await within(dialog).findByText(/sk-…4242/)).textContent).toMatch(/Billed to your OpenAI account/);
    await generate(dialog);
    expect(provider.generateImage.mock.calls[0][3]).toBe('own');
  });
});

describe('no image provider connected', () => {
  it('refuses politely, says how to connect, and never calls the pipeline', async () => {
    provider.imageStatus.mockResolvedValue(status({ house: false }));
    setup();
    const dialog = await openDialog();
    const message = await within(dialog).findByRole('alert');
    expect(message.textContent).toMatch(/No image provider is connected/);
    expect(message.textContent).toMatch(/OpenAI/);
    expect(within(dialog).queryByRole('button', { name: /^Generate/ })).toBeNull();
    expect(within(dialog).getByRole('link', { name: /platform\.openai\.com/ })).toHaveProperty('href', 'https://platform.openai.com/api-keys');
    fireEvent.click(within(dialog).getByRole('button', { name: /Open the Content builder/ }));
    expect(onOpenContentBuilder).toHaveBeenCalledTimes(1);
    expect(provider.generateImage).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('without a way to open the Content builder it still gives the instruction', async () => {
    provider.imageStatus.mockResolvedValue(status({ house: false }));
    setup({ onOpenContentBuilder: undefined });
    const dialog = await openDialog();
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/Content builder/);
    expect(within(dialog).queryByRole('button', { name: /Open the Content builder/ })).toBeNull();
  });

  it('when the status itself cannot be read, says so instead of offering a button that cannot work', async () => {
    provider.imageStatus.mockRejectedValue(new Error('Sign in first.'));
    setup();
    const dialog = await openDialog();
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/Sign in first/);
    expect(within(dialog).queryByRole('button', { name: /^Generate/ })).toBeNull();
  });
});

describe('test mode', () => {
  it('previews the free placeholder but cannot keep it as a cover', async () => {
    provider.imageStatus.mockResolvedValue(status({ live: false }));
    provider.generateImage.mockResolvedValue({ image: SVG, usd: 0, mock: true, size: '1024x1024' });
    setup();
    const dialog = await openDialog();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Generate test image · free' }));
    await within(dialog).findByAltText('New image');
    expect(dialog.textContent).toMatch(/test image/i);
    expect(within(dialog).getByRole('button', { name: 'Accept' })).toHaveProperty('disabled', true);
    expect(store.upload).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
  });
});

describe('the button', () => {
  it('can be switched off, e.g. while another save is running', () => {
    setup({ disabled: true });
    expect(screen.getByRole('button', { name: 'Replace with AI' })).toHaveProperty('disabled', true);
  });
  it('reads "Add image with AI" when there is no image yet', () => {
    setup({ currentUrl: null });
    expect(screen.getByRole('button', { name: 'Add image with AI' })).toBeTruthy();
  });
});
