// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

const bg = { reduceMotion: false, backgroundVideos: [] as string[] };
const devicesMounted = vi.fn();
vi.mock('../hardware/HeroDevices', () => ({ HeroDevices: () => { devicesMounted(); return <div data-testid="devices" />; } }));
vi.mock('../FlutedGlassBackground', () => ({ FlutedGlassBackground: () => <div data-testid="fluted" /> }));
vi.mock('../../hooks/useHeroBackground', () => ({ useHeroBackground: () => bg }));
import { HardwarePreorder } from '../HardwarePreorder';

const fetchStub = vi.fn();
globalThis.fetch = fetchStub as unknown as typeof fetch;

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
let ioInstances: Array<{ cb: IOCallback; options?: IntersectionObserverInit; disconnect: ReturnType<typeof vi.fn> }> = [];
const OriginalIO = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;

function installIO() {
  ioInstances = [];
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    disconnect = vi.fn();
    constructor(cb: IOCallback, options?: IntersectionObserverInit) { ioInstances.push({ cb, options, disconnect: this.disconnect }); }
    observe() {}
    unobserve() {}
    takeRecords() { return []; }
  };
}

beforeEach(() => { bg.reduceMotion = false; bg.backgroundVideos = []; devicesMounted.mockClear(); installIO(); });
afterEach(() => {
  cleanup();
  fetchStub.mockClear();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = OriginalIO;
});

describe('HardwarePreorder teaser', () => {
  it('has one call to action: a plain link to /wearables', () => {
    render(<HardwarePreorder />);
    const link = screen.getByRole('link', { name: /See the R³ Ring/ });
    expect(link.getAttribute('href')).toBe('/wearables');
    expect(link.textContent).toBe('See the R³ Ring — from $179');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('has the folio, one h2 and no h1', () => {
    render(<HardwarePreorder />);
    expect(screen.getByText('R³ hardware · first batch')).toBeTruthy();
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s).toHaveLength(1);
    expect(h2s[0].textContent).toBe('Meet the R³ Ring and R³ Clip.');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('has no form, textbox or button, and makes no network call', () => {
    const { container } = render(<HardwarePreorder />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('form, input, button')).toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('is a labelled section anchored at #hardware-preorder', () => {
    const { container } = render(<HardwarePreorder />);
    const section = container.querySelector('section#hardware-preorder')!;
    expect(section).toBeTruthy();
    const labelId = section.getAttribute('aria-labelledby')!;
    expect(container.querySelector(`#${labelId}`)?.tagName).toBe('H2');
  });

  it('carries none of the old copy and shows only the $179 price', () => {
    const { container } = render(<HardwarePreorder />);
    const text = container.textContent ?? '';
    for (const banned of ['Heart', 'Nothing records', 'ambient', 'camera off by default', 'Capture the moment']) {
      expect(text).not.toContain(banned);
    }
    expect(text.match(/\$\d+/g)).toEqual(['$179']);
  });

  it('has the hidden poster background and renders the fluted layer only with videos and motion', () => {
    const r1 = render(<HardwarePreorder />);
    const img = r1.container.querySelector('img') as HTMLImageElement;
    expect(img.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.queryByTestId('fluted')).toBeNull();
    r1.unmount();
    bg.backgroundVideos = ['a.mp4'];
    const r2 = render(<HardwarePreorder />);
    expect(screen.getByTestId('fluted')).toBeTruthy();
    r2.unmount();
    bg.reduceMotion = true;
    render(<HardwarePreorder />);
    expect(screen.queryByTestId('fluted')).toBeNull();
  });

  it('does not start the 3D devices until the section is within 400px of the viewport', () => {
    const { container } = render(<HardwarePreorder />);
    expect(devicesMounted).not.toHaveBeenCalled();
    expect(screen.queryByTestId('devices')).toBeNull();
    expect(container.querySelector('[data-testid="devices-fallback"] svg')).toBeTruthy();
    expect(ioInstances).toHaveLength(1);
    expect(ioInstances[0].options?.rootMargin).toBe('400px');
    act(() => { ioInstances[0].cb([{ isIntersecting: false }]); });
    expect(screen.queryByTestId('devices')).toBeNull();
    act(() => { ioInstances[0].cb([{ isIntersecting: true }]); });
    expect(screen.getByTestId('devices')).toBeTruthy();
    expect(container.querySelector('[data-testid="devices-fallback"]')).toBeNull();
    expect(ioInstances[0].disconnect).toHaveBeenCalled();
  });

  it('loads the devices immediately when IntersectionObserver is missing', () => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    render(<HardwarePreorder />);
    expect(screen.getByTestId('devices')).toBeTruthy();
  });

  it('centres the devices column vertically in the section', () => {
    const { container } = render(<HardwarePreorder />);
    const grid = container.querySelector('.r3-hw-teaser-grid') as HTMLElement;
    const stage = container.querySelector('.r3-hw-teaser-devices') as HTMLElement;
    expect(grid.style.flex).toMatch(/^1/);
    expect(stage.style.alignSelf).toBe('center');
    expect((grid.children[0] as HTMLElement).style.alignSelf).toBe('center');
  });
});
