// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';

const h = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('../scene/heroScene', () => {
  return { createHeroScene: (...a: unknown[]) => h.create(...a) };
});

import { HeroDevices } from '../HeroDevices';

const RING = 'Concept illustration of the R3 Note smart ring';
const CLIP = 'Concept illustration of the R3 Clip camera wearable';
type Opts = { ringUrl: string; reducedMotion: boolean; onReady: () => void };

let captured: { el: HTMLElement; opts: Opts } | null;
let handle: { dispose: ReturnType<typeof vi.fn> };
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await new Promise(r => setTimeout(r, 0)); });
const scene = () => screen.queryByTestId('hero-scene');

function stubMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  captured = null;
  handle = { dispose: vi.fn() };
  h.create.mockReset();
  h.create.mockImplementation(async (el: HTMLElement, opts: Opts) => { captured = { el, opts }; return handle; });
  stubMotion(false);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({}) as unknown as RenderingContext);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HeroDevices', () => {
  it('first paint shows both drawn arts and an invisible scene layer over them', async () => {
    const { container } = render(<HeroDevices />);
    expect(screen.getByRole('img', { name: RING })).toBeTruthy();
    expect(screen.getByRole('img', { name: CLIP })).toBeTruthy();
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.position).toBe('relative');
    expect(scene()!.style.opacity).toBe('0');
    expect(scene()!.style.position).toBe('absolute');
    expect(scene()!.getAttribute('aria-hidden')).toBe('true');
    await settle();
  });

  it('creates the scene with the ring url and the scene div', async () => {
    render(<HeroDevices />);
    await settle();
    expect(captured!.opts.ringUrl).toBe('/models/r3-ring.stl');
    expect(captured!.opts.reducedMotion).toBe(false);
    expect(captured!.el).toBe(scene());
  });

  it('on ready fades the scene in, then unmounts the drawn layer after 500 ms', async () => {
    render(<HeroDevices />);
    await settle();
    vi.useFakeTimers();
    act(() => captured!.opts.onReady());
    expect(scene()!.style.opacity).toBe('1');
    expect(scene()!.style.transition).toMatch(/500ms/);
    expect(screen.queryByRole('img', { name: RING })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(499); });
    expect(screen.queryByRole('img', { name: RING })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole('img', { name: RING })).toBeNull();
    expect(screen.queryByRole('img', { name: CLIP })).toBeNull();
    expect(screen.getByRole('img', { name: 'R³ Note and R³ Clip, interactive 3D view; drag to turn' })).toBeTruthy();
  });

  it('under reduced motion passes reducedMotion and unmounts the drawn layer immediately', async () => {
    stubMotion(true);
    render(<HeroDevices />);
    await settle();
    expect(captured!.opts.reducedMotion).toBe(true);
    act(() => captured!.opts.onReady());
    expect(scene()!.style.opacity).toBe('1');
    expect(scene()!.style.transition).toBe('none');
    expect(screen.queryByRole('img', { name: RING })).toBeNull();
  });

  it('works when matchMedia is undefined', async () => {
    vi.stubGlobal('matchMedia', undefined);
    render(<HeroDevices />);
    await settle();
    expect(captured!.opts.reducedMotion).toBe(false);
  });

  it('keeps the drawn layer and removes the scene layer when createHeroScene rejects', async () => {
    h.create.mockRejectedValue(new Error('no gl'));
    render(<HeroDevices />);
    await settle();
    expect(scene()).toBeNull();
    expect(screen.getByRole('img', { name: RING })).toBeTruthy();
    expect(screen.getByRole('img', { name: CLIP })).toBeTruthy();
  });

  it('falls back the same way when WebGL is unavailable, without creating a scene', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    render(<HeroDevices />);
    await settle();
    expect(h.create).not.toHaveBeenCalled();
    expect(scene()).toBeNull();
    expect(screen.getByRole('img', { name: RING })).toBeTruthy();
  });

  it('falls back when probing WebGL throws', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => { throw new Error('boom'); });
    render(<HeroDevices />);
    await settle();
    expect(h.create).not.toHaveBeenCalled();
    expect(scene()).toBeNull();
  });

  it('disposes the handle on unmount', async () => {
    const { unmount } = render(<HeroDevices />);
    await settle();
    unmount();
    expect(handle.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes a late handle that resolves after unmount, without any React warning', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolve!: (v: unknown) => void;
    h.create.mockImplementation(() => new Promise(r => { resolve = r; }));
    const { unmount } = render(<HeroDevices />);
    await settle();
    unmount();
    await act(async () => { resolve(handle); await Promise.resolve(); });
    expect(handle.dispose).toHaveBeenCalledTimes(1);
    expect(err).not.toHaveBeenCalled();
  });

  it('a late rejection after unmount sets no state and warns nothing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let reject!: (e: unknown) => void;
    h.create.mockImplementation(() => new Promise((_, r) => { reject = r; }));
    const { unmount } = render(<HeroDevices />);
    await settle();
    unmount();
    await act(async () => { reject(new Error('late')); await Promise.resolve(); });
    expect(err).not.toHaveBeenCalled();
  });

  it('falls back when the dynamic import itself rejects', async () => {
    vi.resetModules();
    vi.doMock('../scene/heroScene', () => { throw new Error('chunk failed'); });
    const { HeroDevices: Fresh } = await import('../HeroDevices');
    render(<Fresh />);
    await settle();
    expect(scene()).toBeNull();
    expect(screen.getByRole('img', { name: RING })).toBeTruthy();
    vi.doUnmock('../scene/heroScene');
  });
});
