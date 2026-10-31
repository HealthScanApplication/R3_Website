import { describe, expect, it } from 'vitest';
import { MAX_CLIP_SECONDS, buildClip, clipEmbedUrl, clipsFromLinks, clipsToLinks, formatTime, nextClipIndex, parseTime, parseYouTubeId } from '../youtubeClip';

const ID = 'c7rNVcYU_-s'; // Barbara O'Neill - #10 - Heal the Heart and High Blood Pressure

describe('parseYouTubeId', () => {
  it('reads the id from every usual link', () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${ID}`, `https://youtube.com/watch?v=${ID}&t=40s`, `www.youtube.com/watch?v=${ID}`, `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`, `https://youtu.be/${ID}?t=12`, `https://www.youtube.com/shorts/${ID}`, `https://www.youtube.com/embed/${ID}`, `https://www.youtube.com/live/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`, ID,
    ]) expect(parseYouTubeId(link), link).toBe(ID);
  });
  it('refuses anything that is not a YouTube video', () => {
    for (const link of ['', '   ', 'hello', 'https://vimeo.com/123456789', `https://example.com/watch?v=${ID}`, 'https://www.youtube.com/watch', 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/@realbarbaraoneillvideos', 'javascript:alert(1)'])
      expect(parseYouTubeId(link), link).toBeNull();
  });
});

describe('parseTime / formatTime', () => {
  it('reads seconds, minutes and hours in the ways people type them', () => {
    expect(parseTime('45')).toBe(45);
    expect(parseTime('1:05')).toBe(65);
    expect(parseTime('1:02:03')).toBe(3723);
    expect(parseTime('1m5s')).toBe(65);
    expect(parseTime('90s')).toBe(90);
    expect(parseTime(12.9)).toBe(12);
    expect(parseTime(' 0 ')).toBe(0);
  });
  it('rejects things that are not times', () => {
    for (const value of ['', 'abc', '-5', '1:2:3:4', '1:', 'm', null, undefined, -1, Number.NaN]) expect(parseTime(value as any), String(value)).toBeNull();
  });
  it('formats back the way it reads', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3723)).toBe('1:02:03');
    expect(formatTime(0)).toBe('0:00');
  });
});

describe('buildClip', () => {
  it('builds a clip from a link, a start and an end', () => {
    expect(buildClip(`https://www.youtube.com/watch?v=${ID}`, '1:00', '1:08')).toEqual({ clip: { id: ID, start: 60, end: 68 }, problem: null });
  });
  it('gives a start with no end a short default clip', () => {
    expect(buildClip(ID, '45', '').clip).toEqual({ id: ID, start: 45, end: 53 });
  });
  it('pulls a long clip in to the longest allowed, so it stays a background', () => {
    const { clip } = buildClip(ID, '0:10', '5:00');
    expect(clip).toEqual({ id: ID, start: 10, end: 10 + MAX_CLIP_SECONDS });
  });
  it('explains what is wrong instead of saving a broken clip', () => {
    expect(buildClip('not a link', '10', '20')).toEqual({ clip: null, problem: 'That is not a YouTube link.' });
    expect(buildClip('', '10', '20')).toEqual({ clip: null, problem: null }); // an empty slot is not an error
    expect(buildClip(ID, '', '20').problem).toMatch(/start time/);
    expect(buildClip(ID, 'soon', '20').problem).toMatch(/start time/);
    expect(buildClip(ID, '30', '20').problem).toMatch(/after the start/);
    expect(buildClip(ID, '30', '30').problem).toMatch(/after the start/);
    expect(buildClip(ID, '30', '31').problem).toMatch(/at least 2 seconds/);
  });
});

describe('saved clips', () => {
  const a = { id: ID, start: 60, end: 68 };
  const b = { id: 'dQw4w9WgXcQ', start: 5, end: 15 };
  it('round-trips through the profile', () => {
    expect(clipsFromLinks(clipsToLinks([a, b]))).toEqual([a, b]);
    expect(clipsFromLinks(JSON.stringify([a]))).toEqual([a]);
  });
  it('keeps at most two, and drops anything invalid or malicious', () => {
    expect(clipsFromLinks(JSON.stringify([a, b, { ...a, start: 1 }]))).toEqual([a, b]);
    const bad = [{ id: 'x', start: 1, end: 5 }, { id: ID, start: 5, end: 5 }, { id: ID, start: 0, end: 500 }, { id: ID, start: '1', end: 5 }, { id: '"><script>', start: 1, end: 5 }, null, 7];
    expect(clipsFromLinks(JSON.stringify(bad))).toEqual([]);
    expect(clipsFromLinks('not json')).toEqual([]);
    expect(clipsFromLinks(undefined)).toEqual([]);
    expect(clipsFromLinks('{"id":"x"}')).toEqual([]);
  });
});

describe('playback helpers', () => {
  it('repeats a single clip and alternates two', () => {
    expect(nextClipIndex(0, 1)).toBe(0);
    expect(nextClipIndex(0, 2)).toBe(1);
    expect(nextClipIndex(1, 2)).toBe(0);
    expect(nextClipIndex(0, 0)).toBe(0);
  });
  it('builds a muted, control-free, looping embed with the start and end', () => {
    const url = new URL(clipEmbedUrl({ id: ID, start: 60, end: 68 }));
    expect(url.origin + url.pathname).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
    const p = url.searchParams;
    expect(p.get('start')).toBe('60'); expect(p.get('end')).toBe('68');
    expect(p.get('mute')).toBe('1'); expect(p.get('controls')).toBe('0'); expect(p.get('autoplay')).toBe('1');
    expect(p.get('loop')).toBe('1'); expect(p.get('playlist')).toBe(ID); expect(p.get('rel')).toBe('0');
  });
});
