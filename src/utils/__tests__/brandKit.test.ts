import { describe, expect, it } from 'vitest';
import { brandKitLinks, brandKitOf, ctaColours, defaultBrandKit, googleFontHref, readableOn } from '../brandKit';

describe('brand kit storage', () => {
  it('round-trips through social_links keys', () => {
    const kit = { font: 'Fraunces', background: 'https://cdn.example/bg.mp4', backgroundType: 'video' as const, ctaMode: 'colour' as const, primary: '#2F5D50', secondary: '#F2E8D5', mono: 'black_on_white' as const };
    expect(brandKitOf({ instagram: 'x', ...brandKitLinks(kit) })).toEqual({ ...kit, primary: '#2F5D50', secondary: '#F2E8D5' });
  });
  it('falls back to safe defaults for missing or invalid values', () => {
    expect(brandKitOf(undefined)).toEqual(defaultBrandKit());
    const k = brandKitOf({ brand_font: 'Comic Sans', brand_primary: 'red', brand_bg: 'javascript:alert(1)', brand_bg_type: 'video', brand_cta_mode: 'neon', brand_mono: 'x' });
    expect(k).toEqual(defaultBrandKit());
  });
  it('drops the background type when there is no background', () => {
    expect(brandKitLinks({ ...defaultBrandKit(), backgroundType: 'image' }).brand_bg_type).toBe('');
  });
});

describe('CTA colours', () => {
  it('monochrome: black on white, or the inverse', () => {
    expect(ctaColours(defaultBrandKit())).toEqual({ primary: { background: '#111111', color: '#FFFFFF', border: '#111111' }, secondary: { background: '#FFFFFF', color: '#111111', border: '#111111' } });
    expect(ctaColours({ ...defaultBrandKit(), mono: 'white_on_black' }).primary).toEqual({ background: '#FFFFFF', color: '#111111', border: '#FFFFFF' });
  });
  it('brand colours get readable text', () => {
    const c = ctaColours({ ...defaultBrandKit(), ctaMode: 'colour', primary: '#1E3A8A', secondary: '#FDE68A' });
    expect(c.primary).toEqual({ background: '#1E3A8A', color: '#FFFFFF', border: '#1E3A8A' });
    expect(c.secondary).toEqual({ background: '#FDE68A', color: '#111111', border: '#1E3A8A' });
  });
  it('picks black or white text by contrast', () => {
    expect(readableOn('#FFFFFF')).toBe('#111111');
    expect(readableOn('#000000')).toBe('#FFFFFF');
    expect(readableOn('#C7D8A3')).toBe('#111111');
    expect(readableOn('#D45B0A')).toBe('#111111'); // mid orange: dark text has more contrast
    expect(readableOn('#2F5D50')).toBe('#FFFFFF');
  });
});

it('builds a Google Fonts stylesheet URL', () => {
  expect(googleFontHref('DM Serif Display')).toBe('https://fonts.googleapis.com/css2?family=DM+Serif+Display:wght@400;600;700&display=swap');
});
