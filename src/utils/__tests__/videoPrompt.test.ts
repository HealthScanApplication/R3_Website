import { describe, expect, it } from 'vitest';
import { buildVideoPrompt } from '../videoPrompt';
import { imagePrompt } from '../brandBrief';
import { defaultBrandKit } from '../brandKit';

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
