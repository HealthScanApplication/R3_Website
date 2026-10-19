import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// Runs the inline script of public/routine/index.html against a stub DOM and a stub fetch. No network, no browser.
const html = readFileSync(join(__dirname, '..', '..', '..', 'public', 'routine', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)![1];

const STAGING = 'https://mofhvoudjxinvpplsytd.supabase.co';
const PRODUCTION = 'https://ermbkttsyvpenjjxaxcf.supabase.co';
const TOKEN = '0123456789abcdef0123456789abcdef';

type El = { id: string; hidden: boolean; textContent: string; href: string };
type Call = { url: string; init: any };

function run(pathname: string, fetchImpl: (url: string, init: any) => Promise<unknown>) {
  const els: Record<string, El> = {};
  const mk = (id: string, hidden = false, textContent = '', href = '') => (els[id] = { id, hidden, textContent, href });
  mk('eyebrow', false, 'A routine for you'); mk('title', false, 'Open this routine in R³'); mk('about', false, 'Open it in the R³ app to add your own copy.');
  mk('store', false, '', 'https://apps.apple.com/app/id6740406583'); mk('open', true, '', 'healthscan://'); mk('note', false, 'R³ is on iPhone.');
  const calls: Call[] = [];
  const document = { title: 'A routine for you · Routine³', getElementById: (id: string) => els[id] };
  const ctx = { location: { pathname }, document, fetch: (url: string, init: any) => { calls.push({ url, init }); return fetchImpl(url, init); }, JSON, Promise, encodeURIComponent };
  vm.runInNewContext(code, ctx);
  return { els, calls, document };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const answer = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });

describe('public/routine/index.html', () => {
  it('shows the routine name, read through the preview function, once a token is valid', async () => {
    const r = run(`/routine/${TOKEN}`, () => answer({ name: 'Sleep reset', description: 'x', creator: 'y' }));
    await tick();
    expect(r.els.title.textContent).toBe('Sleep reset');
    expect(r.document.title).toBe('Sleep reset · Routine³');
    expect(r.els.eyebrow.textContent).toBe('A routine shared with you');
    // name only: nothing else from the answer reaches the page
    expect(Object.values(r.els).map((e) => e.textContent).join(' ')).not.toMatch(/\bx\b|\by\b/);
  });

  it('offers the app-scheme link for the token and keeps the App Store button', () => {
    const r = run(`/routine/${TOKEN}`, () => answer(null));
    expect(r.els.open.hidden).toBe(false);
    expect(r.els.open.href).toBe(`healthscan://routine/${TOKEN}`);
    expect(r.els.store.href).toBe('https://apps.apple.com/app/id6740406583');
  });

  it('asks the staging project first with only the token in the body, and sends no referrer or cookies', async () => {
    const r = run(`/routine/${TOKEN}`, () => answer({ name: 'Sleep reset' }));
    await tick();
    expect(r.calls).toHaveLength(1);
    const { url, init } = r.calls[0];
    expect(url).toBe(`${STAGING}/rest/v1/rpc/routine_share_preview`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ p_token: TOKEN });
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(init.credentials).toBe('omit');
    expect(init.headers.apikey).toBeTruthy();
    expect(init.headers.Authorization).toBe(`Bearer ${init.headers.apikey}`);
  });

  it('falls through to production when staging has no such token, errors, or is unreachable', async () => {
    for (const first of [() => answer(null), () => answer({ message: 'nope' }, false), () => Promise.reject(new TypeError('Failed to fetch')), () => answer({ name: '' })]) {
      let n = 0;
      const r = run(`/routine/${TOKEN}`, () => (n++ === 0 ? first() : answer({ name: 'From production' })));
      await tick();
      expect(r.calls.map((c) => c.url.split('/rest')[0])).toEqual([STAGING, PRODUCTION]);
      expect(r.els.title.textContent).toBe('From production');
    }
  });

  it('stays generic, with the app buttons, when no project knows the token', async () => {
    const r = run(`/routine/${TOKEN}`, () => answer(null));
    await tick();
    expect(r.calls).toHaveLength(2);
    expect(r.els.title.textContent).toBe('Open this routine in R³');
    expect(r.els.open.hidden).toBe(false);
  });

  it('accepts an upper-cased token and a trailing slash, sending the lower-case token', async () => {
    const r = run(`/routine/${TOKEN.toUpperCase()}/`, () => answer({ name: 'Sleep reset' }));
    await tick();
    expect(JSON.parse(r.calls[0].init.body).p_token).toBe(TOKEN);
    expect(r.els.open.href).toBe(`healthscan://routine/${TOKEN}`);
  });

  it('makes no request and offers no app link for a path that is not a routine token', async () => {
    for (const path of ['/routine/', '/routine', '/routine/short', `/routine/${TOKEN}0`, `/routine/${TOKEN}/extra`, '/routine/<script>alert(1)</script>00000000000', `/protocol/${TOKEN}`]) {
      const r = run(path, () => { throw new Error('must not fetch'); });
      await tick();
      expect(r.calls).toHaveLength(0);
      expect(r.els.open.hidden).toBe(true);
      expect(r.els.title.textContent).toBe('This link does not point at a routine');
    }
  });

  it('prints the routine name as text, never as markup, and the URL never reaches the page', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    const r = run(`/routine/${TOKEN}`, () => answer({ name: evil }));
    await tick();
    expect(r.els.title.textContent).toBe(evil); // assigned through textContent, so the browser shows it literally
    expect(code).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write|eval\(/);
    expect(Object.values(r.els).some((e) => e.textContent.includes(TOKEN))).toBe(false);
  });

  it('only ever talks to the two Supabase projects and stores nothing', () => {
    const live = code.replace(/\/\*[\s\S]*?\*\//g, ''); // the header comment names the page's own URL
    const urls = [...live.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]);
    expect(new Set(urls)).toEqual(new Set([STAGING, PRODUCTION]));
    expect(code).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    expect(html).not.toMatch(/fonts\.googleapis|<img\b|<script[^>]*\ssrc=/i);
  });

  it('is a noindex, no-referrer page that is not cached', () => {
    expect(html).toMatch(/<meta name="robots" content="noindex, nofollow">/);
    expect(html).toMatch(/<meta name="referrer" content="no-referrer">/);
    const toml = readFileSync(join(__dirname, '..', '..', '..', 'netlify.toml'), 'utf8');
    const block = toml.slice(toml.indexOf('for = "/routine/*"'));
    expect(block).toMatch(/Referrer-Policy = "no-referrer"/);
    expect(block).toMatch(/Cache-Control = "no-store"/);
    expect(block).toMatch(/X-Robots-Tag = "noindex, nofollow"/);
  });
});
