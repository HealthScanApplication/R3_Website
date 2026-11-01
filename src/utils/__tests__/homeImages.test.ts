import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_SHOTS, HERO_COVER, HERO_SIZES, type HomeImage } from '../../config/homeImages';

const root = resolve(__dirname, '../../..');
const publicFile = (url: string) => resolve(root, 'public', url.replace(/^\//, ''));
const candidates = (img: HomeImage) => img.srcSet.split(', ').map((c) => ({ url: c.split(' ')[0], w: Number(c.split(' ')[1].replace('w', '')) }));

describe('homepage images', () => {
  const all: [string, HomeImage][] = [['hero', HERO_COVER], ...Object.entries(APP_SHOTS)];

  it.each(all)('%s: every srcset candidate is a real file, and src is one of them', (_name, img) => {
    for (const c of candidates(img)) expect(existsSync(publicFile(c.url)), c.url).toBe(true);
    expect(candidates(img).map((c) => c.url)).toContain(img.src);
  });

  it.each(all)('%s: is far lighter than the PNG it replaced, and the blur placeholder is tiny', (_name, img) => {
    const biggest = Math.max(...candidates(img).map((c) => statSync(publicFile(c.url)).size));
    expect(biggest).toBeLessThan(200 * 1024);
    expect(img.lqip.startsWith('data:image/webp;base64,')).toBe(true);
    expect(img.lqip.length).toBeLessThan(600);
  });

  it('the hero preload in index.html names the same srcset and sizes the hero image uses, so the browser reuses it', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain(`'${HERO_COVER.srcSet}'`);
    expect(html).toContain(`'${HERO_SIZES}'`);
    expect(html).toContain(`'${HERO_COVER.src}'`);
  });

  it('only preloads the hero on the home page, not on every route', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toMatch(/location\.pathname\s*!==\s*'\/'/);
  });
});

describe('netlify.toml', () => {
  const toml = readFileSync(resolve(root, 'netlify.toml'), 'utf8');
  const blocks = toml.split('[[redirects]]').slice(1).map((b) => b.split('[[headers]]')[0]);
  const find = (from: string) => blocks.findIndex((b) => new RegExp(`from\\s*=\\s*"${from.replace(/[*/.]/g, '\\$&')}"`).test(b));

  it('serves the files under /images instead of letting the forced catch-all answer them with the app shell', () => {
    const images = find('/images/*');
    const catchAll = find('/*');
    expect(images).toBeGreaterThan(-1);
    expect(catchAll).toBeGreaterThan(images);
    expect(blocks[images]).toMatch(/to\s*=\s*"\/images\/:splat"/);
    expect(blocks[images]).not.toMatch(/force\s*=\s*true/);
  });

  it('serves the clips under /videos and the 3D models under /models as files too, not the app shell', () => {
    for (const dir of ['videos', 'models']) {
      const rule = find(`/${dir}/*`);
      expect(rule).toBeGreaterThan(-1);
      expect(find('/*')).toBeGreaterThan(rule);
      expect(blocks[rule]).toMatch(new RegExp(`to\\s*=\\s*"\\/${dir}\\/:splat"`));
      expect(blocks[rule]).not.toMatch(/force\s*=\s*true/);
    }
  });

  it('lets browsers keep /images for a day and refresh in the background, not revalidate every file on every visit', () => {
    expect(toml).toMatch(/for\s*=\s*"\/images\/\*"[\s\S]*?Cache-Control\s*=\s*"public, max-age=86400, stale-while-revalidate=604800"/);
  });
});
