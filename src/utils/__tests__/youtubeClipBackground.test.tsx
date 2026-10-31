// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { YouTubeClipBackground } from '../../components/guides/YouTubeClipBackground';

const A = { id: 'c7rNVcYU_-s', start: 60, end: 68 };
const B = { id: 'dQw4w9WgXcQ', start: 5, end: 15 };

type Made = { target: HTMLElement; options: any; instance: { mute: any; playVideo: any; loadVideoById: any; destroy: any } };
let made: Made[] = [];

function installYouTube() {
  made = [];
  (window as any).YT = {
    PlayerState: { ENDED: 0, PLAYING: 1 },
    Player: function (this: any, target: HTMLElement, options: any) {
      const instance = { mute: vi.fn(), playVideo: vi.fn(), loadVideoById: vi.fn(), destroy: vi.fn() };
      made.push({ target, options, instance });
      Object.assign(this, instance);
    },
  };
}
const event = (record: Made, data?: number) => ({ target: record.instance, data });
const setReducedMotion = (on: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: on && /reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {} }));

beforeEach(() => { installYouTube(); setReducedMotion(false); });
afterEach(() => { cleanup(); delete (window as any).YT; vi.unstubAllGlobals(); });

describe('YouTubeClipBackground', () => {
  it('plays the first clip muted, without controls, between its start and end, under a poster', async () => {
    const { container } = render(<div style={{ position: 'relative' }}><YouTubeClipBackground clips={[A]} /></div>);
    await waitFor(() => expect(made.length).toBe(1));
    const { options } = made[0];
    expect(options.videoId).toBe(A.id);
    expect(options.playerVars).toMatchObject({ autoplay: 1, mute: 1, controls: 0, start: 60, end: 68, rel: 0, playsinline: 1, disablekb: 1, cc_load_policy: 0 });
    // Drawn 20% larger than its clipped box, so the player's title bar and burned-in captions are cropped off the edges.
    expect((container.querySelector('.g-yt-cover') as HTMLElement).style.transform).toContain('scale(1.2)');
    const root = container.querySelector('[data-youtube-clip]') as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true'); // decorative
    expect(root.style.pointerEvents).toBe('none');
    expect((root.querySelector('img') as HTMLImageElement).getAttribute('src')).toBe(`https://i.ytimg.com/vi/${A.id}/hqdefault.jpg`);
    options.events.onReady(event(made[0]));
    expect(made[0].instance.mute).toHaveBeenCalled();
    expect(made[0].instance.playVideo).toHaveBeenCalled();
  });

  it('repeats a single clip when it ends', async () => {
    render(<YouTubeClipBackground clips={[A]} />);
    await waitFor(() => expect(made.length).toBe(1));
    made[0].options.events.onStateChange(event(made[0], 1)); // playing: nothing
    expect(made[0].instance.loadVideoById).not.toHaveBeenCalled();
    made[0].options.events.onStateChange(event(made[0], 0));
    expect(made[0].instance.loadVideoById).toHaveBeenLastCalledWith({ videoId: A.id, startSeconds: 60, endSeconds: 68 });
  });

  it('plays two clips one after the other and goes back to the first', async () => {
    render(<YouTubeClipBackground clips={[A, B]} />);
    await waitFor(() => expect(made.length).toBe(1));
    const { onStateChange } = made[0].options.events;
    onStateChange(event(made[0], 0));
    expect(made[0].instance.loadVideoById).toHaveBeenLastCalledWith({ videoId: B.id, startSeconds: 5, endSeconds: 15 });
    onStateChange(event(made[0], 0));
    expect(made[0].instance.loadVideoById).toHaveBeenLastCalledWith({ videoId: A.id, startSeconds: 60, endSeconds: 68 });
    expect(made[0].instance.loadVideoById).toHaveBeenCalledTimes(2);
  });

  it('zooms each clip by its own amount, so a 4:3 video can fill the frame, and changes as the clips alternate', async () => {
    const wide = { ...A, zoom: 1.4 };
    const { container } = render(<YouTubeClipBackground clips={[wide, B]} />);
    await waitFor(() => expect(made.length).toBe(1));
    const scale = () => (container.querySelector('.g-yt-cover') as HTMLElement).style.transform;
    expect(scale()).toContain('scale(1.4)');
    act(() => made[0].options.events.onStateChange(event(made[0], 0)));
    await waitFor(() => expect(scale()).toContain('scale(1.2)')); // the second clip has no zoom of its own: the default
    act(() => made[0].options.events.onStateChange(event(made[0], 0)));
    await waitFor(() => expect(scale()).toContain('scale(1.4)'));
  });

  it('cleans up the player when it goes away, and starts over when the clips change', async () => {
    const view = render(<YouTubeClipBackground clips={[A]} />);
    await waitFor(() => expect(made.length).toBe(1));
    view.rerender(<YouTubeClipBackground clips={[A, B]} />);
    await waitFor(() => expect(made.length).toBe(2));
    expect(made[0].instance.destroy).toHaveBeenCalled();
    view.unmount();
    expect(made[1].instance.destroy).toHaveBeenCalled();
  });

  it('shows only the poster, with no player, for people who ask for reduced motion', async () => {
    setReducedMotion(true);
    const { container } = render(<YouTubeClipBackground clips={[A]} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(made.length).toBe(0);
    expect(container.querySelector('[data-youtube-clip] img')).toBeTruthy();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('falls back to a plain muted embed of the first clip if the player reports an error', async () => {
    const { container } = render(<YouTubeClipBackground clips={[A, B]} />);
    await waitFor(() => expect(made.length).toBe(1));
    made[0].options.events.onError();
    await waitFor(() => expect(container.querySelector('iframe')).toBeTruthy());
    const src = new URL((container.querySelector('iframe') as HTMLIFrameElement).src);
    expect(src.hostname).toBe('www.youtube-nocookie.com');
    expect(src.pathname).toBe(`/embed/${A.id}`);
    expect(src.searchParams.get('mute')).toBe('1');
    expect(src.searchParams.get('start')).toBe('60');
  });

  it('renders nothing without clips', () => {
    const { container } = render(<YouTubeClipBackground clips={[]} />);
    expect(container.querySelector('[data-youtube-clip]')).toBeNull();
    expect(made.length).toBe(0);
  });
});
