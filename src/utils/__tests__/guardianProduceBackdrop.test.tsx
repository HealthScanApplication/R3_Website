// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ProduceVideoBackdrop, shuffle } from '../../components/guides/ProduceVideoBackdrop';
import { ownBackground } from '../../components/guides/GuidePortal';

describe('the default Guardian hero background', () => {
  beforeEach(() => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [{ video_url: 'https://x/a.mp4' }, { video_url: 'https://x/b.mp4' }, { video_url: '' }] }));
  });

  it('plays the fruit and vegetable footage, one clip at a time, and keeps the next one ready', async () => {
    const { container } = render(<ProduceVideoBackdrop />);
    await waitFor(() => expect(container.querySelectorAll('video').length).toBe(2));
    const videos = Array.from(container.querySelectorAll('video'));
    expect(videos.filter((video) => video.style.opacity === '1')).toHaveLength(1);
    expect(videos.every((video) => video.muted)).toBe(true);
  });

  it('does not treat the theme sample picture as a chosen background', () => {
    expect(ownBackground('/images/guides/templates/editorial-path.jpg')).toBeNull();
    expect(ownBackground(null)).toBeNull();
    expect(ownBackground('https://cdn.example/mine.jpg')).toBe('https://cdn.example/mine.jpg');
  });

  it('shuffles without losing clips', () => {
    expect(shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('the Guardians public header', () => {
  it('boxes the logo as R³ | Guardian', async () => {
    const { RoutineMark } = await import('../../components/Header');
    const { container } = render(<RoutineMark wordmark="R³" suffix="Guardian" />);
    expect(container.textContent).toBe('R³Guardian');
  });
});
