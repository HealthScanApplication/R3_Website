// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../../utils/hardwarePreorder', () => ({
  createPreorderIntent: vi.fn(),
  confirmPreorder: vi.fn(),
  fetchBackerCount: vi.fn().mockResolvedValue({ paid: 5, goal: 250, deadline: 'd', status: 'open' }),
}));
vi.mock('../HeroDevices', () => ({ HeroDevices: () => <div data-testid="devices" /> }));
vi.mock('../../FlutedGlassBackground', () => ({ FlutedGlassBackground: () => <div /> }));
vi.mock('../../../hooks/useHeroBackground', () => ({ useHeroBackground: () => ({ reduceMotion: true, backgroundVideos: [] }) }));
import { HardwarePage } from '../HardwarePage';
import { RingArt, ClipArt } from '../DeviceArt';

afterEach(cleanup);

describe('HardwarePage', () => {
  it('has exactly one h1, the hero headline', () => {
    render(<HardwarePage />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect((h1s[0].children[0] as HTMLElement).textContent).toBe('Track a routine');
  });

  it('shows device and section headings', () => {
    render(<HardwarePage />);
    const articles = screen.getAllByRole('article');
    const names = articles.map((a) => within(a).getByRole('heading').textContent);
    expect(names).toEqual(expect.arrayContaining(['R³ Note', 'R³ Clip']));
    for (const name of [
      'How it works',
      'Two devices, one routine',
      'A personal assistant for your routine',
      'Specifications',
      'Ready when you are.',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
    }
    expect(screen.queryByRole('heading', { name: 'Reserve your early-backer price' })).toBeNull();
  });

  it('contains the required words and no invented device names or prices', () => {
    const { container } = render(<HardwarePage />);
    const text = container.textContent ?? '';
    for (const w of ['touch', 'slide', 'necklace', 'watch', 'routine', 'calendar', 'email']) {
      expect(text.toLowerCase()).toContain(w);
    }
    expect(text).not.toContain('R³ Ring');
    expect(text).not.toMatch(/\bHeart\b(?!\s+rate)/);
    const prices = Array.from(new Set(text.match(/\$\d+(?:\.\d+)?/g) ?? [])).sort();
    expect(prices).toEqual(['$179', '$299']); // hero preorder shows no struck regular prices
  });

  it('has one #preorder inside the hero with the only checkout, and one email field', () => {
    const { container } = render(<HardwarePage />);
    expect(container.querySelectorAll('#preorder')).toHaveLength(1);
    const section = container.querySelector('#preorder') as HTMLElement;
    expect(section.closest('#hardware-hero')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Reserve →' })).toHaveLength(1);
    expect(within(section).getByRole('button', { name: 'Reserve →' })).toBeTruthy();
    expect(container.querySelectorAll('#preorder-email')).toHaveLength(1);
  });

  it('closing band links to #preorder', () => {
    render(<HardwarePage />);
    const link = screen.getByRole('link', { name: 'Reserve the R³ Note — $179' });
    expect(link.getAttribute('href')).toBe('#preorder');
    expect((link as HTMLElement).style.background).toBe('rgb(199, 217, 159)');
  });

  it('renders no main, footer or banner inside the page', () => {
    const { container } = render(<HardwarePage />);
    const root = container.querySelector('#hardware-page') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.querySelector('main, footer, header[role="banner"], [role="banner"], [role="main"], [role="contentinfo"]')).toBeNull();
    expect(screen.queryByRole('main')).toBeNull();
    expect(screen.queryByRole('contentinfo')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('offsets #preorder below the fixed header', () => {
    const { container } = render(<HardwarePage />);
    const section = container.querySelector('#preorder') as HTMLElement;
    const style = section.getAttribute('style') ?? '';
    expect(style).toContain('scroll-margin-top');
    expect(section.style.scrollMarginTop || style).toContain('calc(64px + 64px + 16px)');
  });

  it('every section has an aria-labelledby heading', () => {
    const { container } = render(<HardwarePage />);
    const sections = container.querySelectorAll('section');
    expect(sections.length).toBe(6);
    sections.forEach((s) => {
      const id = s.getAttribute('aria-labelledby');
      expect(id).toBeTruthy();
      expect(s.querySelector(`#${id}`)).toBeTruthy();
    });
  });
});

describe('DeviceArt', () => {
  it('uses distinct svg ids across instances', () => {
    const { container } = render(<><RingArt /><ClipArt /><RingArt /></>);
    const ids = Array.from(container.querySelectorAll('[id]')).map((e) => e.id);
    expect(ids.length).toBeGreaterThan(6);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((i) => /^[\w-]+$/.test(i))).toBe(true);
  });

  it('ClipArt draws the heartbeat line', () => {
    const { container } = render(<ClipArt />);
    const paths = Array.from(container.querySelectorAll('path')).map((p) => p.getAttribute('d') ?? '');
    expect(paths).toContain('M253 260h34l17-38 30 72 18-34h35');
    expect(container.querySelector('circle[r="34"]')).toBeNull();
  });

  it('lists heart rate under Tracks in the Clip specifications', () => {
    const { container } = render(<HardwarePage />);
    const terms = Array.from(container.querySelectorAll('dt'));
    const tracks = terms.find((dt) => dt.textContent === 'Tracks');
    expect(tracks).toBeTruthy();
    expect(tracks?.nextElementSibling?.textContent).toBe('Heart rate');
  });

  it('promises no email anywhere on the page', () => {
    render(<HardwarePage />);
    expect(document.body.textContent).not.toMatch(/email you/);
  });
});

describe('model-viewer removal', () => {
  it('nothing under src imports the old viewer and package.json drops it', () => {
    const root = path.resolve(__dirname, '../../../..');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(e.name) && full !== __filename) {
          if (/RingViewer|registerModelViewer|@google\/model-viewer/.test(fs.readFileSync(full, 'utf8'))) hits.push(full);
        }
      }
    };
    walk(path.join(root, 'src'));
    expect(hits).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).not.toContain('@google/model-viewer');
  });
});
