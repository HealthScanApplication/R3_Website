import { describe, expect, it } from 'vitest';
import {
  buildSrcSet,
  lqipUrl,
  parseSupabasePublicUrl,
  resizeShopifyUrl,
  resolveImageSources,
  supabaseRenderUrl,
} from '../imageLoading';

const OBJECT = 'https://mofhvoudjxinvpplsytd.supabase.co/storage/v1/object/public/catalog-media/activities/activity_plank.png';
const RENDER = 'https://mofhvoudjxinvpplsytd.supabase.co/storage/v1/render/image/public/catalog-media/activities/activity_plank.png';

describe('parseSupabasePublicUrl', () => {
  it('splits a public Storage URL into origin, bucket and object path', () => {
    expect(parseSupabasePublicUrl(OBJECT)).toEqual({
      origin: 'https://mofhvoudjxinvpplsytd.supabase.co',
      bucket: 'catalog-media',
      path: 'activities/activity_plank.png',
    });
  });
  it('leaves an already transformed URL, another host and a relative path alone', () => {
    expect(parseSupabasePublicUrl(RENDER)).toBeNull();
    expect(parseSupabasePublicUrl('https://example.com/storage/v1/object/public/a/b.png')).toBeNull();
    expect(parseSupabasePublicUrl('/images/content/03-energy.webp')).toBeNull();
    expect(parseSupabasePublicUrl('')).toBeNull();
    expect(parseSupabasePublicUrl('not a url')).toBeNull();
  });
});

describe('supabaseRenderUrl', () => {
  it('asks for the render endpoint with a width AND a height (a width alone crops this project\'s images to a strip)', () => {
    const url = new URL(supabaseRenderUrl(OBJECT, { width: 96, height: 96 })!);
    expect(url.pathname).toBe('/storage/v1/render/image/public/catalog-media/activities/activity_plank.png');
    expect(url.searchParams.get('width')).toBe('96');
    expect(url.searchParams.get('height')).toBe('96');
    expect(url.searchParams.get('resize')).toBe('cover');
    expect(url.searchParams.get('quality')).toBe('75');
  });
  it('maps fit and quality onto the Storage parameters', () => {
    const url = new URL(supabaseRenderUrl(OBJECT, { width: 400, height: 300, fit: 'contain', quality: 60 })!);
    expect(url.searchParams.get('resize')).toBe('contain');
    expect(url.searchParams.get('quality')).toBe('60');
  });
  it('keeps an object path that is already percent-encoded, without encoding it twice', () => {
    const src = 'https://mofhvoudjxinvpplsytd.supabase.co/storage/v1/object/public/assets/images/a%20b/0_2.jpg?t=123';
    const out = supabaseRenderUrl(src, { width: 40, height: 40 })!;
    expect(out).toContain('/assets/images/a%20b/0_2.jpg?');
    expect(out).not.toContain('%2520');
    expect(out).not.toContain('t=123');
  });
  it('declines formats a resize would damage, other hosts, and bad sizes', () => {
    expect(supabaseRenderUrl(OBJECT.replace('.png', '.svg'), { width: 96, height: 96 })).toBeNull();
    expect(supabaseRenderUrl(OBJECT.replace('.png', '.gif'), { width: 96, height: 96 })).toBeNull();
    expect(supabaseRenderUrl('https://example.com/a.png', { width: 96, height: 96 })).toBeNull();
    expect(supabaseRenderUrl(OBJECT, { width: 0, height: 96 })).toBeNull();
    expect(supabaseRenderUrl(OBJECT, { width: 96, height: Number.NaN })).toBeNull();
  });
  it('can be switched off in one place', () => {
    expect(supabaseRenderUrl(OBJECT, { width: 96, height: 96 }, { transforms: false })).toBeNull();
  });
});

describe('lqipUrl', () => {
  it('is a 24px-wide, low-quality render at the same aspect ratio', () => {
    const url = new URL(lqipUrl(OBJECT, 3 / 2)!);
    expect(url.searchParams.get('width')).toBe('24');
    expect(url.searchParams.get('height')).toBe('16');
    expect(url.searchParams.get('quality')).toBe('20');
  });
  it('is null when the source cannot be resized', () => {
    expect(lqipUrl('/images/content/03-energy.webp', 1)).toBeNull();
  });
});

describe('buildSrcSet', () => {
  it('lists each width with the height that keeps the aspect ratio, smallest first, once each', () => {
    const set = buildSrcSet(OBJECT, [640, 320, 320], 2)!;
    const parts = set.split(', ');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/width=320&height=160.* 320w$/);
    expect(parts[1]).toMatch(/width=640&height=320.* 640w$/);
  });
  it('is undefined for a source that cannot be resized', () => {
    expect(buildSrcSet('/images/x.webp', [320], 1)).toBeUndefined();
  });
});

describe('resizeShopifyUrl', () => {
  it('sets the width on a Shopify CDN URL (it scales proportionally)', () => {
    const out = resizeShopifyUrl('https://www.trelune.com.au/cdn/shop/files/tincture_Front.jpg?width=1024', 160)!;
    expect(new URL(out).searchParams.get('width')).toBe('160');
  });
  it('declines anything that is not a Shopify files URL', () => {
    expect(resizeShopifyUrl('https://example.com/a.jpg', 160)).toBeNull();
  });
});

describe('resolveImageSources', () => {
  it('gives a Supabase image a srcset, a src at the largest width, and a blur placeholder for big images', () => {
    const r = resolveImageSources(OBJECT, { aspectRatio: 1, widths: [320, 640] });
    expect(r.transformed).toBe(true);
    expect(r.srcSet).toMatch(/320w, .* 640w$/);
    expect(r.src).toContain('width=640&height=640');
    expect(r.lqip).toContain('width=24');
  });
  it('skips the blur placeholder for thumbnails, where the real image is as small as a placeholder', () => {
    const r = resolveImageSources(OBJECT, { aspectRatio: 1, widths: [96, 160] });
    expect(r.transformed).toBe(true);
    expect(r.lqip).toBeUndefined();
  });
  it('without an aspect ratio there is nothing safe to ask for, so the original is used', () => {
    const r = resolveImageSources(OBJECT, { widths: [320] });
    expect(r).toEqual({ src: OBJECT, srcSet: undefined, lqip: undefined, transformed: false });
  });
  it('can scale to a width without knowing the aspect ratio: contain inside a tall box, so nothing is cropped', () => {
    const r = resolveImageSources(OBJECT, { proportional: true, widths: [160, 320] });
    expect(r.transformed).toBe(true);
    const first = new URL(r.srcSet!.split(', ')[0].split(' ')[0]);
    expect(first.searchParams.get('width')).toBe('160');
    expect(first.searchParams.get('height')).toBe('640');
    expect(first.searchParams.get('resize')).toBe('contain');
  });
  it('passes a local or unknown source through untouched', () => {
    const r = resolveImageSources('/images/content/03-energy.webp', { aspectRatio: 1, widths: [320] });
    expect(r).toEqual({ src: '/images/content/03-energy.webp', srcSet: undefined, lqip: undefined, transformed: false });
  });
  it('resizes a Shopify image by width', () => {
    const r = resolveImageSources('https://www.trelune.com.au/cdn/shop/files/a.jpg?width=1024', { aspectRatio: 1, widths: [160, 320] });
    expect(r.transformed).toBe(true);
    expect(r.srcSet).toMatch(/width=160.* 160w, .*width=320.* 320w$/);
  });
  it('uses the original when transforms are off', () => {
    const r = resolveImageSources(OBJECT, { aspectRatio: 1, widths: [320] }, { transforms: false });
    expect(r.transformed).toBe(false);
    expect(r.src).toBe(OBJECT);
  });
});
