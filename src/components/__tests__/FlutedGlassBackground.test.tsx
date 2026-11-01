// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { FlutedGlassBackground } from '../FlutedGlassBackground';

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
let io: { cb: IOCallback; options?: IntersectionObserverInit; disconnect: ReturnType<typeof vi.fn> } | null = null;
const OriginalIO = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
let rafQueue: Map<number, FrameRequestCallback>;
let rafId = 0;
let visibility: DocumentVisibilityState = 'visible';
const pauseSpy = vi.fn();
const playSpy = vi.fn(() => Promise.resolve());

const glStub = new Proxy({}, {
  get: (_t, k) => (k === 'getProgramParameter' || k === 'getShaderParameter' ? () => true : () => ({})),
});

beforeEach(() => {
  io = null;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    disconnect = vi.fn();
    constructor(cb: IOCallback, options?: IntersectionObserverInit) { io = { cb, options, disconnect: this.disconnect }; }
    observe() {}
    unobserve() {}
    takeRecords() { return []; }
  };
  HTMLCanvasElement.prototype.getContext = (() => glStub) as unknown as typeof originalGetContext;
  rafQueue = new Map();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafQueue.set(++rafId, cb); return rafId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafQueue.delete(id); });
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pauseSpy);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(playSpy);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  pauseSpy.mockClear();
  playSpy.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = OriginalIO;
});

const runFrame = () => act(() => {
  const entries = [...rafQueue.entries()];
  rafQueue.clear();
  entries.forEach(([, cb]) => cb(performance.now()));
});
const intersect = (v: boolean) => act(() => { io!.cb([{ isIntersecting: v }]); });
const setVisibility = (v: DocumentVisibilityState) => act(() => { visibility = v; document.dispatchEvent(new Event('visibilitychange')); });

describe('FlutedGlassBackground render loop gating', () => {
  it('schedules no frames until the canvas is within 200px of the viewport', () => {
    render(<FlutedGlassBackground videos={['a.mp4']} />);
    expect(io?.options?.rootMargin).toBe('200px');
    expect(rafQueue.size).toBe(0);
    intersect(false);
    expect(rafQueue.size).toBe(0);
  });

  it('starts frames on intersect, keeps scheduling, and stops when it leaves', () => {
    render(<FlutedGlassBackground videos={['a.mp4']} />);
    intersect(true);
    expect(rafQueue.size).toBe(1);
    runFrame();
    expect(rafQueue.size).toBe(1);
    expect(playSpy).toHaveBeenCalled();
    intersect(false);
    expect(rafQueue.size).toBe(0);
    expect(pauseSpy).toHaveBeenCalled();
    playSpy.mockClear();
    intersect(true);
    expect(rafQueue.size).toBe(1);
    expect(playSpy).toHaveBeenCalled();
  });

  it('stops on a hidden tab and resumes when visible again', () => {
    render(<FlutedGlassBackground videos={['a.mp4']} />);
    intersect(true);
    runFrame();
    setVisibility('hidden');
    expect(rafQueue.size).toBe(0);
    expect(pauseSpy).toHaveBeenCalled();
    setVisibility('visible');
    expect(rafQueue.size).toBe(1);
  });

  it('does not start while intersecting on a hidden tab', () => {
    visibility = 'hidden';
    render(<FlutedGlassBackground videos={['a.mp4']} />);
    intersect(true);
    expect(rafQueue.size).toBe(0);
  });

  it('cleans up on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<FlutedGlassBackground videos={['a.mp4']} />);
    intersect(true);
    unmount();
    expect(rafQueue.size).toBe(0);
    expect(io!.disconnect).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('runs immediately when IntersectionObserver is missing', () => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    render(<FlutedGlassBackground videos={['a.mp4']} />);
    expect(rafQueue.size).toBe(1);
  });
});
