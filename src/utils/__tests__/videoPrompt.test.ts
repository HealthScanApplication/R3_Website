import { describe, expect, it } from 'vitest';
import { brandStyleOf, buildVideoPrompt } from '../videoPrompt';
import { defaultBrandKit } from '../brandKit';

describe('buildVideoPrompt', () => {
  it('builds the scene from the problem, audience and offer', () => {
    const p = buildVideoPrompt({ audience: 'Women 45–64 · Menopause', problem: 'Sleep problems', offer: '7-day menopause sleep challenge', creator: 'John Ferreira', aspect: '9:16' });
    expect(p).toMatch(/for women 45–64 · menopause/);
    expect(p).toMatch(/evening wind-down/);
    expect(p).toMatch(/"7-day menopause sleep challenge" by John Ferreira/);
    expect(p).toMatch(/vertical 9:16/);
    expect(p).toMatch(/No on-screen text/);
  });
  it('leaves out "for everyone" and falls back to a general scene', () => {
    const p = buildVideoPrompt({ audience: 'Everyone', problem: 'Wellbeing', aspect: '16:9' });
    expect(p).not.toMatch(/for everyone/);
    expect(p).toMatch(/calm daily routine/);
    expect(p).toMatch(/wide 16:9/);
  });
  it('uses the brand voice, visual language and colours when the brand has them', () => {
    const kit = { ...defaultBrandKit(), ctaMode: 'colour' as const, primary: '#2F4A3A', secondary: '#EFE6DB' };
    const brand = brandStyleOf('Calm Co', { brand_voice: 'gentle, witty, plain English', brand_visual: 'film grain, 35mm, muted greens' }, kit);
    const p = buildVideoPrompt({ audience: 'Everyone', problem: 'Stress', aspect: '1:1', brand });
    expect(p).toMatch(/Tone: gentle, witty, plain English\./);
    expect(p).toMatch(/Visual style: film grain, 35mm, muted greens\./);
    expect(p).toMatch(/#2F4A3A, #EFE6DB/);
    expect(p).not.toMatch(/never clinical/);
  });
  it('defaults the tone and look when the brand has no voice yet', () => {
    const brand = brandStyleOf('Plain', {}, defaultBrandKit());
    expect(brand.voice).toBe('');
    const p = buildVideoPrompt({ audience: 'Men', problem: 'Low energy', aspect: '4:5', brand });
    expect(p).toMatch(/never clinical/);
    expect(p).toMatch(/black and white/);
    expect(p).toMatch(/portrait 4:5/);
  });
});
