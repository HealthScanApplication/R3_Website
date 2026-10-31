// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

type Opts = { device: 'ring' | 'watch'; finish: string; reducedMotion: boolean; onReady: () => void };
type Handle = { setFinish: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };

const h = vi.hoisted(() => ({
  imported: 0,
  create: vi.fn(),
}));

vi.mock('../scene/deviceScene', () => {
  h.imported++;
  return { createDeviceScene: (...a: unknown[]) => h.create(...a) };
});

import { DevicePair } from '../DevicePair';

const RING = 'Concept illustration of the R3 Ring smart ring';
const CLIP = 'Concept illustration of the R3 Clip camera wearable';

let ios: Array<{ cb: IntersectionObserverCallback; options?: IntersectionObserverInit; el?: Element; disconnect: ReturnType<typeof vi.fn> }>;
let calls: Array<{ el: HTMLElement; opts: Opts; handle: Handle }>;
const settle = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); await new Promise(r => setTimeout(r, 0)); });
const intersect = (i: number) => act(() => { ios[i].cb([{ isIntersecting: true } as IntersectionObserverEntry], ios[i] as unknown as IntersectionObserver); });
const card = (title: string) => screen.getByRole('heading', { name: title }).closest('article') as HTMLElement;

beforeEach(() => {
  ios = [];
  calls = [];
  h.create.mockReset();
  h.create.mockImplementation(async (el: HTMLElement, opts: Opts) => {
    const handle = { setFinish: vi.fn(), dispose: vi.fn() };
    calls.push({ el, opts, handle });
    return handle;
  });
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = vi.fn();
    observe = vi.fn((el: Element) => { this.el = el; });
    el?: Element;
    constructor(public cb: IntersectionObserverCallback, public options?: IntersectionObserverInit) { ios.push(this); }
  });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({}) as unknown as RenderingContext);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DevicePair', () => {
  it('keeps the copy and shows a finish radio group under each card, White selected', () => {
    render(<DevicePair />);
    for (const title of ['R³ Ring', 'R³ Clip']) {
      const group = within(card(title)).getByRole('radiogroup', { name: `${title} finish` });
      const radios = within(group).getAllByRole('radio');
      expect(radios.map(r => r.getAttribute('aria-label'))).toEqual(['White', 'Black', 'Silver']);
      expect(radios.map(r => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
      expect(radios.map(r => r.tabIndex)).toEqual([0, -1, -1]);
      expect(within(card(title)).getByText('White')).toBeTruthy();
    }
    expect(screen.getByText(/touch and slide surface controls the clip/)).toBeTruthy();
    expect(screen.getByText(/necklace, a watch, or a clip/)).toBeTruthy();
  });

  it('lists Inputs / Outputs / Value under each card with the exact text', () => {
    render(<DevicePair />);
    const expected: Record<string, string[][]> = {
      'R³ Ring': [
        ['Inputs', 'Tap, double tap, press and hold, swipe. Heart rate, sleep and activity sensors.'],
        ['Outputs', "Commands to the R³ Clip's camera and microphone, and to your phone: music and your AI agent."],
        ['Value', 'Log anything without taking your phone out.'],
      ],
      'R³ Clip': [
        ['Inputs', "Camera (photo and video), microphone, heart rate, sleep and activity sensors, and your phone's GPS."],
        ['Outputs', 'Logged meals, activities, tasks and journals; directions to your next calendar event; replies from your AI agent; an end-of-day reel.'],
        ['Value', 'A record of your day, made in the moment.'],
      ],
    };
    for (const [title, rows] of Object.entries(expected)) {
      const dls = card(title).querySelectorAll('dl');
      expect(dls).toHaveLength(1);
      const got = Array.from(dls[0].querySelectorAll('dt')).map(dt => [dt.textContent, dt.nextElementSibling?.tagName === 'DD' ? dt.nextElementSibling.textContent : null]);
      expect(got).toEqual(rows);
    }
  });

  it('while loading shows only the backdrop: no drawing, and the scene module is not imported before intersecting', async () => {
    render(<DevicePair />);
    expect(screen.queryByRole('img', { name: RING })).toBeNull();
    expect(screen.queryByRole('img', { name: CLIP })).toBeNull();
    expect(ios).toHaveLength(2);
    expect(ios[0].options?.rootMargin).toBe('200px');
    await settle();
    expect(h.imported).toBe(0);
    expect(h.create).not.toHaveBeenCalled();
    intersect(0);
    await settle();
    expect(h.imported).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].opts).toMatchObject({ device: 'ring', finish: 'white', reducedMotion: false });
    expect(screen.queryByRole('img', { name: RING })).toBeNull();     // still loading: no drawing
    expect(screen.getByTestId('device-scene-ring').style.opacity).toBe('0');
    intersect(1);
    await settle();
    expect(calls[1].opts).toMatchObject({ device: 'watch', finish: 'white' });
  });

  it('fades the scene in when ready', async () => {
    render(<DevicePair />);
    intersect(0);
    await settle();
    act(() => calls[0].opts.onReady());
    const layer = screen.getByTestId('device-scene-ring');
    expect(layer.style.opacity).toBe('1');
    expect(layer.style.transition).toMatch(/500ms/);
    expect(screen.getByRole('img', { name: /R³ Ring in White, interactive 3D view/ })).toBeTruthy();
    expect(screen.queryByRole('img', { name: RING })).toBeNull();
  });

  it('clicking a swatch checks it and calls setFinish; the two cards are independent', async () => {
    render(<DevicePair />);
    intersect(0);
    await settle();
    intersect(1);
    await settle();
    const ringHandle = calls.find(c => c.opts.device === 'ring')!.handle;
    const watchHandle = calls.find(c => c.opts.device === 'watch')!.handle;
    ringHandle.setFinish.mockClear();
    watchHandle.setFinish.mockClear();
    const silver = within(card('R³ Ring')).getByRole('radio', { name: 'Silver' });
    fireEvent.click(silver);
    expect(silver.getAttribute('aria-checked')).toBe('true');
    expect(within(card('R³ Ring')).getByRole('radio', { name: 'White' }).getAttribute('aria-checked')).toBe('false');
    expect(within(card('R³ Ring')).getByText('Silver')).toBeTruthy();
    expect(ringHandle.setFinish).toHaveBeenCalledWith('silver');
    expect(watchHandle.setFinish).not.toHaveBeenCalled();
    expect(within(card('R³ Clip')).getByRole('radio', { name: 'White' }).getAttribute('aria-checked')).toBe('true');
    expect(h.create).toHaveBeenCalledTimes(2);   // no reload
  });

  it('arrow keys move the selection within the group', async () => {
    render(<DevicePair />);
    const group = within(card('R³ Clip')).getByRole('radiogroup');
    const [white, black, silver] = within(group).getAllByRole('radio');
    fireEvent.keyDown(white, { key: 'ArrowRight' });
    expect(black.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(black);
    fireEvent.keyDown(black, { key: 'ArrowLeft' });
    fireEvent.keyDown(white, { key: 'ArrowLeft' });
    expect(silver.getAttribute('aria-checked')).toBe('true');
  });

  it('shows the drawing when the scene errors', async () => {
    h.create.mockRejectedValue(new Error('no gl'));
    render(<DevicePair />);
    intersect(0);
    await settle();
    expect(screen.getByRole('img', { name: RING })).toBeTruthy();
    expect(screen.queryByTestId('device-scene-ring')).toBeNull();
  });

  it('shows the drawing without importing the scene when WebGL is missing', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    render(<DevicePair />);
    intersect(1);
    await settle();
    expect(h.create).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: CLIP })).toBeTruthy();
  });

  it('shows the drawings when IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<DevicePair />);
    expect(screen.getByRole('img', { name: RING })).toBeTruthy();
    expect(screen.getByRole('img', { name: CLIP })).toBeTruthy();
  });

  it('disposes the scenes on unmount', async () => {
    const { unmount } = render(<DevicePair />);
    intersect(0);
    await settle();
    unmount();
    expect(calls[0].handle.dispose).toHaveBeenCalledTimes(1);
  });
});
