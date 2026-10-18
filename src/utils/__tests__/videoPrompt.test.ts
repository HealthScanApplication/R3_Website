import { describe, expect, it } from 'vitest';
import { buildVideoPrompt } from '../videoPrompt';
import { imagePrompt } from '../brandBrief';
import { defaultBrandKit } from '../brandKit';
import { draftVideoScript, looksLikeGoal, parseScript, scriptPrompt, scriptText } from '../videoScript';
import { coverRect, OVERLAY_FORMATS, pickRecorderType } from '../videoOverlay';

describe('buildVideoPrompt', () => {
  it('turns the brand brief image prompt into a video prompt for the brief', () => {
    const p = buildVideoPrompt({ audience: 'Women 45–64 · Menopause', problem: 'Sleep problems', offer: '7-day menopause sleep challenge', brandName: 'John Ferreira', aspect: '9:16' });
    expect(p.split('\n')[0]).toBe('A short 9:16 social video for John Ferreira promoting "7-day menopause sleep challenge".');
    expect(p).toMatch(/Scene: Women 45–64 · Menopause in a calm, real moment/);
    expect(p).toMatch(/Moment: an evening wind-down/);
    expect(p).toMatch(/Motion: realistic, slow and gentle/);
    expect(p).toMatch(/Framing: vertical 9:16/);
    expect(p).not.toMatch(/Leave clean space/);
    expect(p.split('\n').at(-1)).toBe('No on-screen text, logos or watermarks.');
  });
  it('shares the scene and brand lines with imagePrompt, so posts and videos stay on-brand together', () => {
    const kit = { ...defaultBrandKit(), ctaMode: 'colour' as const, primary: '#2F4A3A', secondary: '#EFE6DB', visual: 'film grain, 35mm, muted greens', voice: 'witty and plain' };
    const ctx = { audience: 'Everyone', problem: 'Stress', aspect: '1:1' as const, brandName: 'Calm Co', kit };
    const image = imagePrompt({ brandName: 'Calm Co', kit, audience: 'Everyone', focus: 'Stress', format: '1:1' });
    const video = buildVideoPrompt(ctx);
    for (const line of image.split('\n').filter((l) => /^(Scene|Visual language|Palette)/.test(l))) expect(video).toContain(line);
    expect(video).toMatch(/Visual language: film grain, 35mm, muted greens/);
    expect(video).toMatch(/#2F4A3A and #EFE6DB/);
    expect(video).not.toMatch(/witty/); // brand voice is for words; videos carry no on-screen text
    expect(video).toMatch(/slow breathing by a window/);
  });
  it('works without a brand and falls back to a general scene', () => {
    const p = buildVideoPrompt({ audience: 'Everyone', problem: 'Wellbeing', aspect: '16:9' });
    expect(p).toMatch(/a wellness guide/);
    expect(p).toMatch(/calm daily routine/);
    expect(p).toMatch(/wide 16:9/);
  });
});

describe('video script', () => {
  it('drafts a hook, lines and CTA for a problem', () => {
    const s = draftVideoScript({ audience: 'Women 45–64 · Menopause', focus: 'Sleep problems', offer: '7-day menopause sleep challenge', free: true, creator: 'John Ferreira' });
    expect(s.hook).toBe('Sleep problems? It might be your routine.');
    expect(s.lines[0]).toMatch(/for women 45–64/);
    expect(s.lines[1]).toBe('7-day menopause sleep challenge by John Ferreira walks you through them, one day at a time.');
    expect(s.cta).toBe('Get the free routine at the link in bio.');
  });
  it('writes goals as an invitation and paid offers as the Protocol', () => {
    expect(looksLikeGoal('Sleep better')).toBe(true);
    expect(looksLikeGoal('Sleep problems')).toBe(false);
    const s = draftVideoScript({ audience: 'Everyone', focus: 'More energy', offer: 'Energy reset', free: false });
    expect(s.hook).toBe('Want to have more energy? Start here.');
    expect(s.cta).toMatch(/Start the Protocol/);
    expect(draftVideoScript({ audience: 'Men', focus: 'Less stress', focusKind: 'goal' }).hook).toBe('Want to feel less stress? Start here.');
  });
  it('uses the brand brief: a brand word, and drops lines with words to avoid', () => {
    const kit = { ...defaultBrandKit(), words: 'routine, gentle, simple', avoid: 'overwhelm, perfection' };
    const s = draftVideoScript({ audience: 'Everyone', focus: 'Stress', kit });
    expect(s.lines.join(' ')).toMatch(/Keep it gentle/);
    expect(s.lines.join(' ')).not.toMatch(/overwhelm/i);
  });
  it('round-trips through the editor text', () => {
    const s = draftVideoScript({ audience: 'Everyone', focus: 'Stress', offer: 'Calm in 7' });
    expect(parseScript(scriptText(s))).toEqual(s);
    expect(parseScript('Just a hook')).toEqual({ hook: 'Just a hook', lines: [], cta: '' });
    expect(parseScript('')).toEqual({ hook: '', lines: [], cta: '' });
  });
  it('builds the AI script prompt on the brand brief copyPrompt, in the brand voice', () => {
    const kit = { ...defaultBrandKit(), voice: 'warm and witty', avoid: 'cure' };
    const p = scriptPrompt({ audience: 'Everyone', focus: 'Stress', offer: 'Calm in 7', brandName: 'Calm Co', kit, format: '9:16 video' });
    expect(p.split('\n')[0]).toBe('Write a 15–20 second 9:16 video script for "Calm in 7" by Calm Co.');
    expect(p).toMatch(/Brand voice: warm and witty/);
    expect(p).toMatch(/Avoid: cure/);
    expect(p).toMatch(/one hook line, two or three short spoken lines/);
  });
});

describe('video text overlay', () => {
  it('sizes the text layer like the post formats', () => {
    expect(OVERLAY_FORMATS['9:16']).toEqual({ id: 'story', w: 1080, h: 1920 });
    expect(OVERLAY_FORMATS['4:5']).toEqual({ id: 'post', w: 1080, h: 1350 });
  });
  it('covers the frame with a centre crop (a 9:16 render shown at 4:5)', () => {
    const r = coverRect(1080, 1920, 1080, 1350);
    expect(r.w).toBe(1080); expect(r.h).toBe(1920); expect(r.y).toBe(-285); expect(r.x).toBe(0);
    expect(coverRect(0, 0, 100, 50)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });
  it('records MP4 where the browser can, otherwise WebM', () => {
    expect(pickRecorderType((t) => t === 'video/mp4')).toEqual({ mime: 'video/mp4', ext: 'mp4' });
    expect(pickRecorderType((t) => t.startsWith('video/webm'))).toEqual({ mime: 'video/webm;codecs=vp9', ext: 'webm' });
    expect(pickRecorderType(() => false)).toBeNull();
  });
});
