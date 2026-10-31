// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { GOAL_WORDS } from '../../../config/goalWords';

const bg = { reduceMotion: false, backgroundVideos: [] as string[] };
vi.mock('../HeroDevices', () => ({ HeroDevices: () => <div data-testid="devices" /> }));
vi.mock('../PreorderBlock', () => ({ PreorderBlock: () => <button type="button">Continue to payment</button> }));
vi.mock('../../FlutedGlassBackground', () => ({ FlutedGlassBackground: () => <div data-testid="fluted" /> }));
vi.mock('../../../hooks/useHeroBackground', () => ({ useHeroBackground: () => bg }));
import { HardwareHero } from '../HardwareHero';

const DECK = "Touch or slide the R³ Note to control the R³ Clip's camera, record a voice note, or hand a request to your AI assistant.";
const line2 = () => (screen.getByRole('heading', { level: 1 }).children[1] as HTMLElement).textContent;

beforeEach(() => { bg.reduceMotion = false; bg.backgroundVideos = []; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('HardwareHero', () => {
  it('renders one h1 with the two-line headline', () => {
    render(<HardwareHero />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect((h1s[0].children[0] as HTMLElement).textContent).toBe('Track a routine');
    expect(line2()).toBe('for weight loss');
  });

  it('rotates the goal word in order and wraps', () => {
    vi.useFakeTimers();
    render(<HardwareHero />);
    act(() => { vi.advanceTimersByTime(320); });
    for (let i = 1; i <= GOAL_WORDS.length; i++) {
      act(() => { vi.advanceTimersByTime(3200); });
      expect(line2()).toBe(`for ${GOAL_WORDS[i % GOAL_WORDS.length]}`);
    }
  });

  it('does not rotate under reduced motion', () => {
    vi.useFakeTimers();
    bg.reduceMotion = true;
    render(<HardwareHero />);
    act(() => { vi.advanceTimersByTime(20000); });
    expect(line2()).toBe('for weight loss');
  });

  it('has deck, folio, preorder wrapper, devices, hidden poster and labelled section', () => {
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

  it('renders the fluted layer only with videos and motion', () => {
    const r1 = render(<HardwareHero />);
    expect(screen.queryByTestId('fluted')).toBeNull();
    r1.unmount();
    bg.backgroundVideos = ['a.mp4'];
    const r2 = render(<HardwareHero />);
    expect(screen.getByTestId('fluted')).toBeTruthy();
    r2.unmount();
    bg.reduceMotion = true;
    render(<HardwareHero />);
    expect(screen.queryByTestId('fluted')).toBeNull();
  });
});
