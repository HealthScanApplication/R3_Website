// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { HERO_CLIPS, HERO_FEATURE_WORDS } from '../copy';

const bg = { reduceMotion: false, allowVideo: false, backgroundVideos: [] as string[] };
vi.mock('../HeroDevices', () => ({ HeroDevices: () => <div data-testid="devices" /> }));
vi.mock('../PreorderBlock', () => ({ PreorderBlock: () => <button type="button">Continue to payment</button> }));
vi.mock('../../FlutedGlassBackground', () => ({ FlutedGlassBackground: ({ videos }: { videos: string[] }) => <div data-testid="fluted" data-videos={videos.join(',')} /> }));
vi.mock('../../../hooks/useHeroBackground', () => ({ useHeroBackground: () => bg }));
import { HardwareHero } from '../HardwareHero';

const DECK = 'See it, say it, do it — in real time, without a phone. Tap the R³ Ring and the R³ Clip takes the photo, logs the activity or saves the voice note.';
const line = (i: number) => (screen.getByRole('heading', { level: 1 }).children[i] as HTMLElement).textContent;
const line1 = () => line(0);
const line2 = () => line(1);

beforeEach(() => { bg.reduceMotion = false; bg.allowVideo = false; bg.backgroundVideos = []; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('HardwareHero', () => {
  it('renders one h1 with the two-line headline', () => {
    render(<HardwareHero />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(line1()).toBe('Capture your meals');
    expect(line2()).toBe('without phone.');
  });

  it('rotates the feature word in order and wraps', () => {
    vi.useFakeTimers();
    render(<HardwareHero />);
    act(() => { vi.advanceTimersByTime(320); });
    for (let i = 1; i <= HERO_FEATURE_WORDS.length; i++) {
      act(() => { vi.advanceTimersByTime(3200); });
      expect(line1()).toBe(`Capture your ${HERO_FEATURE_WORDS[i % HERO_FEATURE_WORDS.length]}`);
      expect(line2()).toBe('without phone.');
    }
  });

  it('does not rotate under reduced motion', () => {
    vi.useFakeTimers();
    bg.reduceMotion = true;
    render(<HardwareHero />);
    act(() => { vi.advanceTimersByTime(20000); });
    expect(line1()).toBe('Capture your meals');
  });

  it('has deck, overline, preorder wrapper, devices, hidden poster and labelled section', () => {
    const { container } = render(<HardwareHero />);
    expect(screen.getByText(DECK)).toBeTruthy();
    expect(screen.getByText('R³ hardware · first batch')).toBeTruthy();
    const wrap = container.querySelector('#preorder') as HTMLElement;
    expect(within(wrap).getAllByRole('button', { name: 'Continue to payment' })).toHaveLength(1);
    expect(screen.getByTestId('devices')).toBeTruthy();
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    const section = container.querySelector('#hardware-hero') as HTMLElement;
    const id = section.getAttribute('aria-labelledby')!;
    expect(container.querySelector(`#${id}`)?.tagName).toBe('H1');
  });

  it('plays the R³ hero clips (not the produce clips) behind the fluted glass once video is allowed, never under reduced motion', () => {
    render(<HardwareHero />).unmount();
    expect(screen.queryByTestId('fluted')).toBeNull();
    bg.allowVideo = true;
    bg.backgroundVideos = ['a.mp4'];
    const r2 = render(<HardwareHero />);
    expect(screen.getByTestId('fluted').getAttribute('data-videos')).toBe(HERO_CLIPS.join(','));
    r2.unmount();
    bg.reduceMotion = true;
    render(<HardwareHero />);
    expect(screen.queryByTestId('fluted')).toBeNull();
  });

  it('the hero clips are the five first-person moments, in order', () => {
    expect(HERO_CLIPS).toEqual(['meal', 'navigate', 'activity', 'music', 'reel'].map(id => `/videos/hero/${id}.mp4`));
  });

  it('centres the devices column vertically in the hero (the grid fills the height, the stage self-centres)', () => {
    const { container } = render(<HardwareHero />);
    const grid = container.querySelector('.r3-hw-hero-grid') as HTMLElement;
    const stage = container.querySelector('.r3-hw-hero-devices') as HTMLElement;
    expect(grid.style.flex).toMatch(/^1/);
    expect(stage.style.alignSelf).toBe('center');
    expect((grid.children[0] as HTMLElement).style.alignSelf).toBe('center');
    expect(stage.contains(screen.getByTestId('devices'))).toBe(true);
  });

  it('centres the left text block (folio stays on top)', () => {
    const { container } = render(<HardwareHero />);
    const grid = container.querySelector('.r3-hw-hero-grid') as HTMLElement;
    const text = grid.children[0] as HTMLElement;
    expect(text.style.alignSelf).toBe('center');
    expect(text.contains(screen.getByRole('heading', { level: 1 }))).toBe(true);
  });

  it('uses the owner capture word list', () => {
    expect(HERO_FEATURE_WORDS).toEqual(['meals', 'workouts', 'thoughts', 'moments', 'ideas', 'heartbeats']);
    // Short words only: 10 letters ("heartbeats") is checked to fit one line at 375px and on desktop.
    for (const w of HERO_FEATURE_WORDS) expect(w.length).toBeLessThanOrEqual(10);
  });
});
