// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { UseCases, UseCaseCard } from '../UseCases';
import { USE_CASES, USE_CASES_TITLE } from '../copy';

afterEach(cleanup);

describe('UseCases', () => {
  it('renders the heading and 11 cards', () => {
    render(<UseCases />);
    expect(screen.getByRole('heading', { level: 2, name: USE_CASES_TITLE })).toBeTruthy();
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(11);
    expect(cards.map(c => within(c).getByRole('heading', { level: 3 }).textContent)).toEqual(USE_CASES.map(u => u.title));
    expect(screen.getByText('Say "headache, 6 out of 10" and it\'s logged against your day.')).toBeTruthy();
  });

  it('a card without an image renders the placeholder with the scene text and no <img>', () => {
    const u = { ...USE_CASES[0], image: undefined };
    const { container } = render(<UseCaseCard item={u} />);
    expect(container.querySelector('img')).toBeNull();
    const ph = screen.getByTestId(`usecase-placeholder-${u.id}`);
    expect(ph.getAttribute('role')).toBe('img');
    expect(ph.getAttribute('aria-label')).toBe(u.scene);
    expect(ph.textContent).toContain(u.scene);
    expect(screen.getByText(u.gesture)).toBeTruthy();
    expect(screen.getByText(u.result)).toBeTruthy();
  });

  it('a card with an image renders <img alt=scene>', () => {
    const u = { ...USE_CASES[1], image: '/images/r3/activity.jpg', video: undefined };
    const { container } = render(<UseCaseCard item={u} />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('alt')).toBe(u.scene);
    expect(img.getAttribute('src')).toBe(u.image);
    expect(screen.queryByTestId(`usecase-placeholder-${u.id}`)).toBeNull();
  });

  it('a card with a clip renders a muted looping <video> with the still as poster, lazily loaded', () => {
    const u = { ...USE_CASES[2], video: '/videos/use-cases/task.mp4' };
    const { container } = render(<UseCaseCard item={u} />);
    const v = container.querySelector('video') as HTMLVideoElement;
    expect(v).toBeTruthy();
    expect(v.getAttribute('src')).toBe(u.video);
    expect(v.getAttribute('poster')).toBe(u.image);
    expect(v.muted).toBe(true);
    expect(v.loop).toBe(true);
    expect(v.hasAttribute('playsinline')).toBe(true);
    expect(v.getAttribute('preload')).toBe('none');
    expect(v.getAttribute('aria-label')).toBe(u.scene);
  });

  it('with reduced motion a card with a clip shows only its still', () => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      const u = { ...USE_CASES[2], video: '/videos/use-cases/task.mp4' };
      const { container } = render(<UseCaseCard item={u} />);
      expect(container.querySelector('video')).toBeNull();
      expect(container.querySelector('img')?.getAttribute('src')).toBe(u.image);
    } finally {
      window.matchMedia = orig;
    }
  });

  it('each card has a how box: what you do → what the devices do, then the gesture line', () => {
    render(<UseCases />);
    for (const u of USE_CASES) {
      expect(u.how.from.length).toBeGreaterThan(0);
      expect(u.how.to.length).toBeGreaterThan(0);
      const box = screen.getByTestId(`usecase-how-${u.id}`);
      const icons = [...box.querySelectorAll('[data-how-icon]')].map(e => e.getAttribute('data-how-icon'));
      expect(icons).toEqual([...u.how.from, ...u.how.to]);
      expect(box.textContent).toBe(u.gesture);
    }
    const meal = screen.getByTestId('usecase-how-meal');
    expect([...meal.querySelectorAll('[data-how-icon]')].map(e => e.getAttribute('data-how-icon'))).toEqual(['ring-tap', 'camera', 'mic']);
  });

  it('every use case ships with its own still', () => {
    for (const u of USE_CASES) {
      expect(u.image).toBe(`/images/hardware/use-cases/${u.id}.webp`);
      expect(u.video).toBe(`/videos/use-cases/${u.id}.mp4`);
    }
  });

  it('lays out 3 / 2 / 1 columns with scoped media queries', () => {
    const { container } = render(<UseCases />);
    const css = container.querySelector('style')?.textContent ?? '';
    expect(css).toContain('@media (min-width: 700px)');
    expect(css).toContain('@media (min-width: 1100px)');
    expect(css).toMatch(/\.r3-hw-usecases\s*\{[^}]*grid-template-columns:\s*repeat\(3/);
  });
});
