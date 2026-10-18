// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { defaultBrandKit, type BrandKit } from '../brandKit';

vi.mock('../guidePortal', async (importOriginal) => ({ ...await importOriginal<any>(), uploadGuideImage: vi.fn(async (_: string, f: File) => `https://cdn.example/${f.name}`) }));
const { BrandKitFields } = await import('../../components/guides/BrandKitFields');
afterEach(cleanup);

function Demo({ onKit }: { onKit: (k: BrandKit) => void }) {
  const [kit, setKit] = useState(defaultBrandKit());
  const [logo, setLogo] = useState<string | null>(null);
  return <BrandKitFields userId="u" brandName="Calm Co" kit={kit} onChange={(k) => { setKit(k); onKit(k); }} logoUrl={logo} onLogo={setLogo} />;
}

it('edits typeface, button style and colours, with a live preview', () => {
  const onKit = vi.fn();
  render(<Demo onKit={onKit} />);
  fireEvent.change(screen.getByLabelText(/Typeface/), { target: { value: 'Fraunces' } });
  expect(onKit).toHaveBeenLastCalledWith(expect.objectContaining({ font: 'Fraunces' }));
  fireEvent.click(screen.getByRole('button', { name: 'Brand colours' }));
  fireEvent.change(screen.getByLabelText('Primary CTA colour'), { target: { value: '#2f5d50' } });
  expect(onKit).toHaveBeenLastCalledWith(expect.objectContaining({ ctaMode: 'colour', primary: '#2F5D50' }));
  const preview = screen.getByLabelText('Brand preview');
  expect(preview.textContent).toContain('Calm Co');
  expect((screen.getByText('Start the routine') as HTMLElement).style.background).toMatch(/47, 93, 80|2f5d50/i);
  fireEvent.click(screen.getByRole('button', { name: 'Monochrome' }));
  fireEvent.click(screen.getByRole('button', { name: 'White on black' }));
  expect(onKit).toHaveBeenLastCalledWith(expect.objectContaining({ ctaMode: 'mono', mono: 'white_on_black' }));
});

it('uploads a logo and a looping video background', async () => {
  const onKit = vi.fn();
  render(<Demo onKit={onKit} />);
  fireEvent.change(screen.getByLabelText('Upload logo'), { target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] } });
  expect(await screen.findByAltText('Calm Co logo')).toHaveProperty('src', 'https://cdn.example/logo.png');
  fireEvent.change(screen.getByLabelText('Upload background image, GIF or video'), { target: { files: [new File(['x'], 'loop.mp4', { type: 'video/mp4' })] } });
  await waitFor(() => expect(onKit).toHaveBeenLastCalledWith(expect.objectContaining({ background: 'https://cdn.example/loop.mp4', backgroundType: 'video' })));
});

it('accepts an animated GIF background as an image', async () => {
  const onKit = vi.fn();
  render(<Demo onKit={onKit} />);
  const input = screen.getByLabelText('Upload background image, GIF or video') as HTMLInputElement;
  expect(input.accept).toContain('image/gif');
  fireEvent.change(input, { target: { files: [new File(['GIF89a'], 'calm.gif', { type: 'image/gif' })] } });
  await waitFor(() => expect(onKit).toHaveBeenLastCalledWith(expect.objectContaining({ background: 'https://cdn.example/calm.gif', backgroundType: 'image' })));
  expect((screen.getByLabelText('Upload logo') as HTMLInputElement).accept).toContain('image/gif');
});

function BriefDemo({ onKit, token }: { onKit: (k: BrandKit) => void; token: string | null }) {
  const [kit, setKit] = useState(defaultBrandKit());
  return <BrandKitFields userId="u" brandName="Calm Co" kit={kit} onChange={(k) => { setKit(k); onKit(k); }} logoUrl={null} onLogo={() => {}} accessToken={token} facts={{ about: 'Sleep coach', tags: ['Sleep'] }} />;
}

it('drafts the voice and visual brief with AI when the route answers', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    expect(url).toContain('/guides/brand-brief');
    return new Response(JSON.stringify({ brief: { voice: 'Gentle and practical.', visual: 'Dawn light, linen, quiet rooms.', words: 'routine, rest', avoid: 'cure, detox' } }), { status: 200 });
  }));
  const onKit = vi.fn();
  render(<BriefDemo onKit={onKit} token="t" />);
  fireEvent.click(screen.getByRole('button', { name: /Draft with AI/ }));
  await waitFor(() => expect(onKit).toHaveBeenLastCalledWith(expect.objectContaining({ voice: 'Gentle and practical.', visual: 'Dawn light, linen, quiet rooms.' })));
  expect(screen.getByRole('status').textContent).toMatch(/Drafted with AI/);
  expect((screen.getByLabelText('Brand voice') as HTMLTextAreaElement).value).toBe('Gentle and practical.');
  vi.unstubAllGlobals();
});

it('falls back to an offline draft from the brand details when AI is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'AI brand brief is not configured' }), { status: 501 })));
  const onKit = vi.fn();
  render(<BriefDemo onKit={onKit} token="t" />);
  fireEvent.click(screen.getByRole('button', { name: /Draft with AI/ }));
  await waitFor(() => expect(onKit).toHaveBeenLastCalledWith(expect.objectContaining({ voice: expect.stringMatching(/^Calm Co sounds/) })));
  expect(screen.getByRole('status').textContent).toMatch(/AI is not available/);
  expect(screen.getByRole('button', { name: /Redraft with AI/ })).toBeTruthy();
  vi.unstubAllGlobals();
});
