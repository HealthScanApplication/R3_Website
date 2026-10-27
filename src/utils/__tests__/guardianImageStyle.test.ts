import { describe, expect, it } from 'vitest';
import * as gi from '../../../supabase/functions/guardian-images/lib';
import { HOUSE_IMAGE_STYLE, IMAGE_PROMPT_MAX, buildImagePrompt, resolveImageStyle, visualLanguageOf } from '../guardianImageStyle';
import { defaultBrandKit, brandKitLinks } from '../brandKit';

describe('house image style (the pencil portrait look)', () => {
  it('describes the portrait: graphite pencil, white page, hatching, greyscale, bust with a rounded lower edge, warm, not photographic', () => {
    const style = HOUSE_IMAGE_STYLE.toLowerCase();
    for (const word of ['graphite pencil', 'white background', 'hatching', 'soft shading', 'greyscale', 'bust', 'rounded lower edge', 'warm', 'not photographic', 'cartoon']) {
      expect(style, word).toContain(word.replace('not photographic', 'never photographic'));
    }
  });
  it('fits the brand kit\'s Visual language field (600 characters) so a Guardian can save it as their own', () => {
    expect(HOUSE_IMAGE_STYLE.length).toBeLessThanOrEqual(600);
  });
});

describe('resolveImageStyle', () => {
  it('uses the brand kit\'s visual language when it has one', () => {
    expect(resolveImageStyle('  Soft morning light, linen and herbs.  ')).toEqual({ text: 'Soft morning light, linen and herbs.', source: 'brand' });
  });
  it.each([undefined, null, '', '   \n '])('falls back to the house pencil style for %j', (visual) => {
    expect(resolveImageStyle(visual)).toEqual({ text: HOUSE_IMAGE_STYLE, source: 'house' });
  });
});

describe('visualLanguageOf', () => {
  const brand = (over: Record<string, unknown>) => ({ guide_id: 'g', name: 'B', kind: 'business', logo_url: null, contact_email: '', whatsapp_phone: '', website_url: '', social_links: {}, language: 'en', pricing_region: '', currency: 'EUR', ...over }) as any;
  const kit = (visual: string) => brandKitLinks({ ...defaultBrandKit(), visual });
  it('reads the primary brand\'s Visual language, else the personal brand\'s, else the first brand\'s', () => {
    expect(visualLanguageOf([brand({ social_links: kit('shop look') }), brand({ is_primary: true, social_links: kit('primary look') })])).toBe('primary look');
    expect(visualLanguageOf([brand({ social_links: kit('shop look') }), brand({ kind: 'personal', social_links: kit('personal look') })])).toBe('personal look');
    expect(visualLanguageOf([brand({ social_links: kit('only look') })])).toBe('only look');
  });
  it('is empty with no brands or an empty field, so the house style applies', () => {
    expect(visualLanguageOf([])).toBe('');
    expect(visualLanguageOf([brand({ kind: 'personal', social_links: kit('') })])).toBe('');
    expect(visualLanguageOf(undefined)).toBe('');
  });
});

describe('buildImagePrompt', () => {
  const house = HOUSE_IMAGE_STYLE;
  it('builds from the offer\'s title and description plus the style', () => {
    const prompt = buildImagePrompt({ title: '7-day menopause routine', description: 'A gentle week of food, movement and sleep.', style: 'Soft morning light, linen and herbs.' });
    expect(prompt).toContain('"7-day menopause routine"');
    expect(prompt).toContain('A gentle week of food, movement and sleep.');
    expect(prompt).toContain('Style: Soft morning light, linen and herbs.');
    expect(prompt).not.toContain('pencil'); // a brand's own language replaces the house style, it is not added to it
  });
  it('uses the house pencil style when no style is given', () => {
    const prompt = buildImagePrompt({ title: 'Sleep Magnesium', description: '', style: '' });
    expect(prompt).toContain(`Style: ${house}`);
    expect(buildImagePrompt({ title: 'Sleep Magnesium', style: undefined })).toContain(house);
  });
  it('always keeps writing, logos and watermarks out of the picture (the model garbles them)', () => {
    expect(buildImagePrompt({ title: 'Sleep Magnesium', style: 'Soft light.' })).toMatch(/No text, lettering, logos, labels or watermarks/);
  });
  it('drops the delivery note an offer description ends with, strips markup and collapses spacing', () => {
    const prompt = buildImagePrompt({ title: 'Gut reset', description: '<p>Five   simple   days.</p>\n Delivery: PDF by email, instant.' });
    expect(prompt).toContain('About it: Five simple days.');
    expect(prompt).not.toMatch(/Delivery|<p>|PDF by email/);
  });
  it('names what the offer is, so a routine is not drawn as a book', () => {
    expect(buildImagePrompt({ title: 'Deep sleep', kind: 'routine' })).toMatch(/"Deep sleep", a daily routine/);
    expect(buildImagePrompt({ title: 'Deep sleep', kind: 'ebook' })).toMatch(/"Deep sleep", a guide book/);
    expect(buildImagePrompt({ title: 'Magnesium', kind: 'product' })).toMatch(/"Magnesium", a wellness product/);
    expect(buildImagePrompt({ title: 'Mystery', kind: 'something-new' })).toMatch(/"Mystery"\./);
  });
  it('copes with a missing title and with quotes in a title', () => {
    expect(buildImagePrompt({ title: '   ' })).toContain('"this offer"');
    expect(buildImagePrompt({ title: 'Barbara\'s "Gut" reset' })).toContain('"Barbara\'s Gut reset"');
  });
  it('trims very long input and always stays inside what the Edge Function accepts', () => {
    const prompt = buildImagePrompt({ title: 'T'.repeat(500), description: 'word '.repeat(2000), style: 'S'.repeat(9000) });
    expect(prompt.length).toBeLessThan(IMAGE_PROMPT_MAX);
    const shaped = gi.shapeImageRequest({ prompt, aspect_ratio: '1:1', quality: 'medium', source: 'own' });
    expect(shaped.ok).toBe(true);
  });
  it('the limit mirrors the Edge Function\'s, so a prompt that passes here is never refused there', () => {
    expect(IMAGE_PROMPT_MAX).toBe(gi.PROMPT_MAX);
  });
  it('a typical prompt is accepted by the Edge Function\'s own validation', () => {
    const prompt = buildImagePrompt({ title: 'Deep sleep', description: 'Seven evenings to wind down.', kind: 'routine', style: house });
    expect(gi.shapeImageRequest({ prompt, aspect_ratio: '1:1', quality: 'medium', source: 'house' })).toMatchObject({ ok: true });
  });
});
