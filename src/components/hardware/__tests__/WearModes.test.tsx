// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';

const h = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../scene/wearScene', () => ({ createWearScene: (...a: unknown[]) => h.create(...a) }));

import { WearModes } from '../WearModes';

const NAMES = ['Watch', 'Cap clip', 'Necklace'];
const LINES = [
  "On its steel link bracelet it's a watch: time, heart rate and sleep.",
  "Clipped to a cap's bill, a hinge aims it ahead, at your plate or down at your board.",
  'On a chain it hangs as a diamond at chest height and captures as you go.',
];
const settle = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); await new Promise(r => setTimeout(r, 0)); });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WearModes', () => {
  beforeEach(() => { h.create.mockReset(); });

  it('has the heading and intro', () => {
    render(<WearModes />);
    const section = screen.getByRole('region', { name: 'One clip, three ways to wear it' });
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('One clip, three ways to wear it');
    expect(section.textContent).toContain('The R³ Clip moves from your wrist to your cap to a chain in seconds.');
  });

  it('shows three cards in order with their names and lines', () => {
    render(<WearModes />);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(3);
    expect(cards.map(c => within(c).getByRole('heading', { level: 3 }).textContent)).toEqual(NAMES);
    expect(cards.map(c => c.querySelector('p')?.textContent)).toEqual(LINES);
  });

  it('shows a drawn fallback in each square stage when 3D is unavailable (no IntersectionObserver)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<WearModes />);
    for (const id of ['watch', 'clip', 'necklace']) {
      const stage = screen.getByTestId(`wear-stage-${id}`);
      expect(stage.style.aspectRatio).toBe('1 / 1');
      expect(within(stage).getByTestId(`wear-fallback-${id}`).querySelector('svg')).toBeTruthy();
    }
    expect(h.create).not.toHaveBeenCalled();
  });

  it('falls back when WebGL is missing, and loads one scene per mode when it is there', async () => {
    const ios: Array<{ cb: IntersectionObserverCallback }> = [];
    vi.stubGlobal('IntersectionObserver', class {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(public cb: IntersectionObserverCallback) { ios.push(this); }
    });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({}) as unknown as RenderingContext);
    h.create.mockImplementation(async (_el: HTMLElement, o: { onReady: () => void }) => { o.onReady(); return { dispose: vi.fn() }; });
    render(<WearModes />);
    // Nothing drawn while waiting: no fallback before 3D has a chance.
    expect(screen.queryByTestId('wear-fallback-watch')).toBeNull();
    act(() => ios.forEach(io => io.cb([{ isIntersecting: true } as IntersectionObserverEntry], io as unknown as IntersectionObserver)));
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(3));
    expect(h.create.mock.calls.map(c => (c[1] as { mode: string }).mode)).toEqual(['watch', 'clip', 'necklace']);
    await settle();
    expect(screen.getByTestId('wear-stage-clip').getAttribute('role')).toBe('img');
    cleanup();

    getContext.mockImplementation(() => null);
    ios.length = 0;
    h.create.mockClear();
    render(<WearModes />);
    act(() => ios.forEach(io => io.cb([{ isIntersecting: true } as IntersectionObserverEntry], io as unknown as IntersectionObserver)));
    await waitFor(() => expect(screen.getAllByTestId(/^wear-fallback-/)).toHaveLength(3));
    expect(h.create).not.toHaveBeenCalled();
  });

  it('falls back when the scene fails', async () => {
    const ios: Array<{ cb: IntersectionObserverCallback }> = [];
    vi.stubGlobal('IntersectionObserver', class {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(public cb: IntersectionObserverCallback) { ios.push(this); }
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({}) as unknown as RenderingContext);
    h.create.mockRejectedValue(new Error('no model'));
    render(<WearModes />);
    act(() => ios.forEach(io => io.cb([{ isIntersecting: true } as IntersectionObserverEntry], io as unknown as IntersectionObserver)));
    await waitFor(() => expect(screen.getAllByTestId(/^wear-fallback-/)).toHaveLength(3));
    expect(h.create).toHaveBeenCalledTimes(3);
    expect(screen.queryByTestId('wear-scene-watch')).toBeNull();
  });
});
