import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SHARE_ROUTES, shareRouteFor, pathMatches, shareImageUrl, SHARE_ORIGIN } from '../../config/shareRoutes';
import { applyShareMeta } from '../../hooks/useDocumentSetup';
// @ts-expect-error plain .mjs build script
import { renderSharePage, generatedRoutes } from '../../../scripts/gen-share-pages.mjs';
// @ts-expect-error plain .mjs card script
import { cardHtml } from '../../../scripts/gen-share-cards.mjs';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('which route a URL belongs to', () => {
  it.each([
    ['/', '', 'home'],
    ['/admin', '', 'home'],
    ['/some-referral-code', '', 'home'],
    ['/guardians', '', 'guardians'],
    ['/guardians/workspace', '?step=5', 'guardians'],
    ['/guardians/workspace/', '', 'guardians'],
    ['/guides', '', 'guardians'],
    ['/guide', '', 'guardians'],
    ['/g/ABC123', '', 'guardians'],
    ['/@sam', '', 'guardians'],
    ['/', '?page=blog', 'blog'],
    ['/', '?page=blog&ref=x', 'blog'],
    ['/', '?page=other', 'home'],
    ['/join/0123456789abcdef', '', 'join'],
    ['/routine/0123456789abcdef0123456789abcdef', '', 'routine'],
    ['/protocol/0b46960a-1d2c-4f3b-9a4e-5c6d7e8f9a0b', '', 'routine'],
  ])('%s%s → %s', (path, search, id) => expect(shareRouteFor(path, search).id).toBe(id));

  it('"/guardians/*" is the route and everything under it, never a longer word', () => {
    expect(pathMatches('/guardians/*', '/guardians')).toBe(true);
    expect(pathMatches('/guardians/*', '/guardians/x/y')).toBe(true);
    expect(pathMatches('/guardians/*', '/guardianship')).toBe(false);
    expect(pathMatches('/@*', '/@sam')).toBe(true);
    expect(pathMatches('/@*', '/sam')).toBe(false);
  });
});

describe('every route has a card and tags', () => {
  it.each(SHARE_ROUTES.map((r) => [r.id, r] as const))('%s: committed card is 1200x630 JPEG under 300 KB', (id) => {
    const file = join(ROOT, 'public/share', `${id}.jpg`);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThanOrEqual(300 * 1024);
    const buf = readFileSync(file);
    expect([buf[0], buf[1]]).toEqual([0xff, 0xd8]);
  });
  it('names are unique and the home route is first (the fallback)', () => {
    expect(new Set(SHARE_ROUTES.map((r) => r.id)).size).toBe(SHARE_ROUTES.length);
    expect(SHARE_ROUTES[0].id).toBe('home');
  });
});

describe('the page a crawler is served', () => {
  const html = read('index.html');
  it('carries the route\'s title, description, canonical URL and card', () => {
    const guardians = generatedRoutes().find((r: { id: string }) => r.id === 'guardians');
    const page = renderSharePage(html, guardians);
    expect(page).toContain(`<title>${guardians.title}</title>`);
    expect(page).toContain(`<meta property="og:image" content="${shareImageUrl(guardians)}" />`);
    expect(page).toContain(`<meta name="twitter:image" content="${shareImageUrl(guardians)}" />`);
    expect(page).toContain(`<link rel="canonical" href="${SHARE_ORIGIN}/guardians" />`);
    expect(page).toContain('og:image:alt" content="R³ Guardians on ROUTINE³"');
    expect(page).not.toContain('share/home.jpg');
  });
  it('has every preview tag exactly once', () => {
    for (const route of generatedRoutes()) {
      const page = renderSharePage(html, route);
      for (const key of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:type', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt', 'description']) {
        expect(page.match(new RegExp(`<meta\\s+(?:property|name)="${key}"`, 'g'))?.length, `${route.id} ${key}`).toBe(1);
      }
      expect(page.match(/<title>/g)?.length).toBe(1);
      expect(page.match(/rel="canonical"/g)?.length).toBe(1);
    }
  });
  it('is index.html otherwise: the app and its scripts are untouched', () => {
    const blog = generatedRoutes().find((r: { id: string }) => r.id === 'blog');
    const page = renderSharePage(html, blog);
    expect(page).toContain('application/ld+json');
    expect(page.replace(/<title>[\s\S]*?<\/title>/, '').length).toBeGreaterThan(html.length - 1200);
    expect(page).toContain('<link rel="canonical" href="https://routine3.com/?page=blog" />');
  });
  it('escapes quotes and ampersands in a route\'s words', () => {
    const page = renderSharePage(html, { id: 'x', name: 'A "B" & C', url: '/x', title: 'T & "Q"', description: 'D & "E" <b>' });
    expect(page).toContain('og:description" content="D &amp; &quot;E&quot; &lt;b>"');
    expect(page).toContain('<title>T &amp; "Q"</title>');
  });
  it('fails loudly when index.html loses a tag it must rewrite', () => {
    expect(() => renderSharePage(html.replace(/<meta property="og:title"[^>]*>/, ''), SHARE_ROUTES[1])).toThrow(/og:title/);
  });
  it('every generated route has a page that nothing else claims', () => {
    expect(generatedRoutes().map((r: { id: string }) => r.id).sort()).toEqual(['blog', 'guardians']);
  });
});

describe('the card', () => {
  it('draws the header lockup and the route name, with the ³ in the brand colour', () => {
    const guardians = SHARE_ROUTES.find((r) => r.id === 'guardians')!;
    const html = cardHtml(guardians);
    expect(html).toContain('<span class="name">ROUTINE³</span><span class="tag">Beta</span>');
    expect(html).toContain('<span class="lead">R<span class="three">³</span></span> <em>Guardians</em>');
  });
  it('sets the home headline on two lines like the hero', () => {
    const home = cardHtml(SHARE_ROUTES[0]);
    expect(home).toContain('Build a routine</span><br>');
    expect(home).toContain('<em>any goal</em>');
  });
});

/** Just enough of a document for applyShareMeta: meta tags by selector, a head, a title. */
function fakeDoc(title = '') {
  const tags: Record<string, Record<string, string>> = {};
  const make = () => { const attrs: Record<string, string> = {}; return { attrs, setAttribute: (k: string, v: string) => { attrs[k] = v; }, getAttribute: (k: string) => attrs[k] }; };
  const doc = {
    title, tags,
    head: { appendChild: (el: { attrs: Record<string, string> }) => { const key = el.attrs.property ?? el.attrs.name; tags[key] = el.attrs; } },
    createElement: () => make(),
    querySelector: (selector: string) => { const m = selector.match(/meta\[(?:property|name)="([^"]+)"\]/); const found = m && tags[m[1]]; return found ? { setAttribute: (k: string, v: string) => { found[k] = v; }, getAttribute: (k: string) => found[k] } : null; },
  };
  return doc;
}

describe('the app keeps the tab and preview tags in step with the route', () => {
  it('sets the Guardians title and card on /guardians', () => {
    const doc = fakeDoc();
    applyShareMeta('/guardians/workspace', '?step=5', doc as never);
    expect(doc.title).toContain('R³ Guardians');
    expect(doc.tags['og:image'].content).toBe(`${SHARE_ORIGIN}/share/guardians.jpg`);
    expect(doc.tags['og:url'].content).toBe(`${SHARE_ORIGIN}/guardians`);
    expect(doc.tags['twitter:image'].content).toBe(`${SHARE_ORIGIN}/share/guardians.jpg`);
  });
  it('updates a tag that index.html already shipped instead of adding a second one', () => {
    const doc = fakeDoc();
    doc.tags['og:title'] = { property: 'og:title', content: 'old' };
    applyShareMeta('/', '?page=blog', doc as never);
    expect(doc.tags['og:title'].content).toContain('R³ Blog');
  });
  it('leaves the title index.html ships on the home route and never writes the old tagline', () => {
    const doc = fakeDoc('ROUTINE³ - Build a Routine for Any Goal | Health, Beauty & Fitness App');
    applyShareMeta('/', '', doc as never);
    expect(doc.title).toContain('Build a Routine for Any Goal');
    expect(doc.tags['og:title'].content).not.toMatch(/Know What You Eat/);
    expect(doc.tags['og:image'].content).toBe(`${SHARE_ORIGIN}/share/home.jpg`);
  });
});

describe('what ships agrees with the table', () => {
  it('index.html and the static share pages carry their route\'s card', () => {
    for (const [page, id] of [['index.html', 'home'], ['public/join/index.html', 'join'], ['public/routine/index.html', 'routine'], ['public/protocol/index.html', 'routine']] as const) {
      const src = read(page);
      expect(src, page).toContain(`content="${SHARE_ORIGIN}/share/${id}.jpg"`);
    }
  });
  it('the static pages that carry a token in their URL do not repeat it in og:url', () => {
    for (const page of ['public/join/index.html', 'public/routine/index.html', 'public/protocol/index.html']) expect(read(page)).not.toMatch(/<meta[^>]*og:url/);
  });
  it('postbuild writes the route pages', () => {
    expect(JSON.parse(read('package.json')).scripts.postbuild).toContain('gen-share-pages.mjs');
  });
});
