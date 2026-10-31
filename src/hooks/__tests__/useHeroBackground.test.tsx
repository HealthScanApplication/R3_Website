// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { useHeroBackground } from '../useHeroBackground';
import { GOAL_WORDS } from '../../config/goalWords';

function setup({ reduce = false, saveData = false } = {}) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('reduced-motion') ? reduce : false,
    addEventListener: () => {}, removeEventListener: () => {},
  }));
  Object.defineProperty(window.navigator, 'connection', { value: { saveData, effectiveType: '4g' }, configurable: true });
}
const rows = Array.from({ length: 20 }, (_, i) => ({ video_url: `v${i}.mp4` }));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('useHeroBackground', () => {
  it('never fetches under reduced motion', async () => {
    vi.useFakeTimers(); setup({ reduce: true });
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useHeroBackground());
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(f).not.toHaveBeenCalled();
    expect(result.current.reduceMotion).toBe(true);
  });

  it('does not fetch with saveData', async () => {
    vi.useFakeTimers(); setup({ saveData: true });
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    renderHook(() => useHeroBackground());
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(f).not.toHaveBeenCalled();
  });

  it('fetches once and returns at most 10 urls', async () => {
    vi.useFakeTimers(); setup();
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => rows }); vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useHeroBackground());
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toContain('catalog_ingredients');
    expect(result.current.backgroundVideos.length).toBe(10);
  });

  it('a failed fetch yields []', async () => {
    vi.useFakeTimers(); setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')));
    const { result } = renderHook(() => useHeroBackground());
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.backgroundVideos).toEqual([]);
  });
});

describe('GOAL_WORDS', () => {
  it('matches the homepage words and is shared', () => {
    expect(GOAL_WORDS).toEqual(["weight loss", "clearer skin", "lean muscle", "more energy", "better sleep", "gut health", "healthy kids", "longevity"]);
    const src = fs.readFileSync(path.resolve(__dirname, '../../components/HeroSection.tsx'), 'utf8');
    expect(src).toContain('from "../config/goalWords"');
    expect(src).not.toMatch(/const GOAL_WORDS\s*=/);
  });
});
