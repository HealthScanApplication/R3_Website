// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { YouTubeClipFields } from '../../components/guides/YouTubeClipFields';
import type { YtClip } from '../youtubeClip';

afterEach(cleanup);

const LINK = 'https://www.youtube.com/watch?v=c7rNVcYU_-s';
let latest: YtClip[] = [];
function Harness({ initial = [] as YtClip[] }) {
  const [clips, setClips] = useState<YtClip[]>(initial);
  latest = clips;
  return <YouTubeClipFields clips={clips} onChange={setClips} />;
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('YouTubeClipFields', () => {
  it('has two slots, Video 1 and Video 2, and warns to use only videos they may use', () => {
    render(<Harness />);
    expect(screen.getByText('Video 1')).toBeTruthy();
    expect(screen.getByText('Video 2')).toBeTruthy();
    expect(screen.getByText(/permission to use/i)).toBeTruthy();
    expect(latest).toEqual([]);
  });

  it('turns a link and times into a clip, and shows what will play', () => {
    render(<Harness />);
    type('Video 1 YouTube link', LINK);
    expect(latest).toEqual([]); // not a clip until it has a start
    expect(screen.getByRole('alert').textContent).toMatch(/start time/);
    type('Video 1 start', '1:00');
    type('Video 1 end', '1:08');
    expect(latest).toEqual([{ id: 'c7rNVcYU_-s', start: 60, end: 68 }]);
    expect(screen.getByRole('status').textContent).toBe('Plays 1:00 to 1:08 (8 seconds)');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps clips in slot order and lets the second be used on its own', () => {
    render(<Harness />);
    type('Video 2 YouTube link', 'https://youtu.be/dQw4w9WgXcQ');
    type('Video 2 start', '5');
    type('Video 2 end', '15');
    expect(latest).toEqual([{ id: 'dQw4w9WgXcQ', start: 5, end: 15 }]);
    type('Video 1 YouTube link', LINK);
    type('Video 1 start', '60');
    type('Video 1 end', '68');
    expect(latest.map((clip) => clip.id)).toEqual(['c7rNVcYU_-s', 'dQw4w9WgXcQ']);
  });

  it('explains a bad link or a backwards time and does not save a broken clip', () => {
    render(<Harness />);
    type('Video 1 YouTube link', 'https://vimeo.com/123');
    expect(screen.getByRole('alert').textContent).toBe('That is not a YouTube link.');
    type('Video 1 YouTube link', LINK);
    type('Video 1 start', '30');
    type('Video 1 end', '20');
    expect(screen.getByRole('alert').textContent).toMatch(/after the start/);
    expect(latest).toEqual([]);
  });

  it('shows saved clips when they arrive, and Clear empties just that slot', () => {
    const view = render(<Harness />);
    view.rerender(<Harness initial={[{ id: 'c7rNVcYU_-s', start: 60, end: 68 }]} />);
    expect(latest.length).toBe(0); // the harness owns the state; the fields show what they are given
    cleanup();
    render(<Harness initial={[{ id: 'c7rNVcYU_-s', start: 60, end: 68 }, { id: 'dQw4w9WgXcQ', start: 5, end: 15 }]} />);
    expect((screen.getByLabelText('Video 1 YouTube link') as HTMLInputElement).value).toBe(LINK);
    expect((screen.getByLabelText('Video 1 start') as HTMLInputElement).value).toBe('1:00');
    expect((screen.getByLabelText('Video 2 end') as HTMLInputElement).value).toBe('0:15');
    fireEvent.click(screen.getByRole('button', { name: 'Clear video 1' }));
    expect(latest).toEqual([{ id: 'dQw4w9WgXcQ', start: 5, end: 15 }]);
    expect((screen.getByLabelText('Video 1 YouTube link') as HTMLInputElement).value).toBe('');
  });

  it('caps a long clip at 30 seconds', () => {
    render(<Harness />);
    type('Video 1 YouTube link', LINK);
    type('Video 1 start', '0:10');
    type('Video 1 end', '5:00');
    expect(latest).toEqual([{ id: 'c7rNVcYU_-s', start: 10, end: 40 }]);
  });
});
