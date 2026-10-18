import { describe, expect, it } from 'vitest';
import { copyPrompt, draftBrandBrief, imagePrompt } from '../brandBrief';
import { brandKitLinks, brandKitOf, defaultBrandKit } from '../brandKit';

const facts = { name: 'Calm Co', about: 'Sleep coach', tags: ['Sleep', 'Menopause'], audience: 'Women 45–64 · Menopause' };

describe('brand brief storage', () => {
  it('round-trips voice, visual, words and avoid in social_links', () => {
    const kit = { ...defaultBrandKit(), voice: 'Warm and plain', visual: 'Soft morning light', words: 'routine, calm', avoid: 'cure' };
    expect(brandKitOf(brandKitLinks(kit))).toMatchObject({ voice: 'Warm and plain', visual: 'Soft morning light', words: 'routine, calm', avoid: 'cure' });
    expect(brandKitOf({ brand_voice: 'x'.repeat(900) }).voice).toHaveLength(600);
  });
});

describe('offline draft', () => {
  it('describes the voice from the typeface, topics and audience', () => {
    const serif = draftBrandBrief(facts, { ...defaultBrandKit(), font: 'Fraunces' });
    expect(serif.voice).toMatch(/^Calm Co sounds warm, considered and editorial/);
    expect(serif.voice).toContain('sleep and menopause');
    expect(serif.voice).toContain('women 45–64 · menopause');
    expect(draftBrandBrief(facts, { ...defaultBrandKit(), font: 'Bebas Neue' }).voice).toContain('confident, bold');
    expect(serif.words).toContain('menopause');
    expect(serif.avoid).toContain('miracle');
  });
  it('names the palette: monochrome or brand colours', () => {
    expect(draftBrandBrief(facts, defaultBrandKit()).visual).toContain('monochrome: black type');
    const colour = draftBrandBrief(facts, { ...defaultBrandKit(), ctaMode: 'colour', primary: '#2F5D50', secondary: '#F2E8D5' }).visual;
    expect(colour).toMatch(/deep (green|teal) as the lead colour with soft amber accents/);
  });
});

describe('prompts for content tools', () => {
  const kit = { ...defaultBrandKit(), voice: 'Warm and plain', visual: 'Soft morning light, linen', words: 'routine, calm', avoid: 'cure, miracle' };
  const ctx = { brandName: 'Calm Co', kit, audience: 'Women 45–64 · Menopause', focus: 'Sleep better', offer: '7-day sleep reset', format: '9:16', headline: 'Build a routine for sleep', cta: 'Unlock the free routine' };
  it('image prompt carries the scene, the visual language and no on-image text', () => {
    const p = imagePrompt(ctx);
    expect(p).toContain('A 9:16 social image for Calm Co promoting "7-day sleep reset"');
    expect(p).toContain('Women 45–64 · Menopause');
    expect(p).toContain('Visual language: Soft morning light, linen');
    expect(p).not.toContain('Brand voice');
    expect(p).toContain('No text, logos or watermarks');
  });
  it('copy prompt carries the voice, words and claims guard, not the visuals', () => {
    const p = copyPrompt(ctx);
    expect(p).toContain('Brand voice: Warm and plain');
    expect(p).toContain('Avoid: cure, miracle');
    expect(p).toContain('Call to action: "Unlock the free routine"');
    expect(p).not.toContain('Visual language');
    expect(p).toContain('No medical claims');
  });
  it('works without a brand', () => {
    expect(imagePrompt({ ...ctx, kit: null, brandName: undefined })).toContain('a wellness guide');
    expect(copyPrompt({ ...ctx, kit: null })).not.toContain('Brand voice');
  });
});
