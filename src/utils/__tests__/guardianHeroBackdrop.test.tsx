// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const bg = { reduceMotion: false, allowVideo: false, backgroundVideos: [] as string[] };
const hookArgs: unknown[] = [];
vi.mock('../../hooks/useHeroBackground', () => ({ useHeroBackground: (arg: unknown) => { hookArgs.push(arg); return bg; } }));
vi.mock('../../components/FlutedGlassBackground', () => ({
  FlutedGlassBackground: ({ videos, poster }: { videos: string[]; poster: string }) => <div data-testid="fluted" data-videos={videos.join(',')} data-poster={poster} />,
}));
import { GUARDIAN_CLIPS, GUARDIAN_POSTER, GuardianHeroBackdrop } from '../../components/guides/GuardianHeroBackdrop';

beforeEach(() => { bg.reduceMotion = false; bg.allowVideo = false; hookArgs.length = 0; });
afterEach(cleanup);

describe('GuardianHeroBackdrop', () => {
  it('the clips are the six Guardians, in order', () => {
    expect(GUARDIAN_CLIPS).toEqual(['trainer', 'dietitian', 'herbalist', 'breathwork', 'yoga', 'sleep'].map(id => `/videos/guardians/${id}.mp4`));
  });

  it('shows the hidden poster and never asks the hook for produce clips', () => {
    const { container } = render(<GuardianHeroBackdrop />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(GUARDIAN_POSTER);
    expect(img.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(hookArgs[0]).toEqual({ produce: false });
    expect(screen.queryByTestId('fluted')).toBeNull();
  });

  it('plays the Guardian clips behind the fluted glass once video is allowed, never under reduced motion', () => {
    bg.allowVideo = true;
    const r = render(<GuardianHeroBackdrop />);
    const glass = screen.getByTestId('fluted');
    expect(glass.getAttribute('data-videos')).toBe(GUARDIAN_CLIPS.join(','));
    expect(glass.getAttribute('data-poster')).toBe(GUARDIAN_POSTER);
    r.unmount();
    bg.reduceMotion = true;
    render(<GuardianHeroBackdrop />);
    expect(screen.queryByTestId('fluted')).toBeNull();
  });
});
