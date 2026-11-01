// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { HeroGlassOverlay, heroGlassOn } from '../../components/guides/HeroGlassOverlay';

afterEach(cleanup);

describe('HeroGlassOverlay', () => {
  it('draws glass ribs across the middle and a vignette, as decoration only', () => {
    const { container } = render(<div style={{ position: 'relative' }}><HeroGlassOverlay /></div>);
    const root = container.querySelector('[data-hero-glass]') as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.style.pointerEvents).toBe('none');
    const ribs = [...container.querySelectorAll('[data-glass-rib]')] as HTMLElement[];
    expect(ribs.length).toBe(3);
    for (const rib of ribs) { const left = parseFloat(rib.style.left); expect(left).toBeGreaterThan(8); expect(left).toBeLessThan(90); } // the middle, not the edges
    expect(container.querySelector('[data-hero-vignette]')).toBeTruthy();
    expect(container.querySelector('style')!.textContent).toMatch(/prefers-reduced-motion/); // the slow drift stops for reduced motion
  });
});

describe('heroGlassOn', () => {
  it('is on by default for a video clip, off by default otherwise, and the Guardian can force either', () => {
    expect(heroGlassOn('', true)).toBe(true);
    expect(heroGlassOn(undefined, true)).toBe(true);
    expect(heroGlassOn('', false)).toBe(false);
    expect(heroGlassOn('off', true)).toBe(false);
    expect(heroGlassOn('on', false)).toBe(true);
  });
});
