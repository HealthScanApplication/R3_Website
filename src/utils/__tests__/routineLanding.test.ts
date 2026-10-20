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
const CLICK = '3f9a1c7e-5b2d-4a60-8c1e-9b7d2f4a6c80';

type El = { id: string; hidden: boolean; textContent: string; href: string };
type Call = { url: string; fn: string; base: string; init: any; body: any };

function run(pathname: string, fetchImpl: (call: Call) => Promise<unknown>, search = '') {
  const els: Record<string, El> = {};
  const mk = (id: string, hidden = false, textContent = '', href = '') => (els[id] = { id, hidden, textContent, href });
  mk('eyebrow', false, 'A routine for you'); mk('title', false, 'Open this routine in R³'); mk('about', false, 'Open it in the R³ app to add your own copy.');
  mk('store', false, '', 'https://apps.apple.com/app/id6740406583'); mk('open', true, '', 'healthscan://'); mk('note', false, 'R³ is on iPhone.');
  const calls: Call[] = [];
  const document = { title: 'A routine for you · Routine³', getElementById: (id: string) => els[id] };
  const ctx = {
    location: { pathname, search }, document, JSON, Promise, encodeURIComponent, URLSearchParams, String,
    fetch: (url: string, init: any) => {
      const call: Call = { url, fn: url.split('/rpc/')[1], base: url.split('/rest')[0], init, body: JSON.parse(init.body) };
      calls.push(call);
      return fetchImpl(call);
    },
  };
  vm.runInNewContext(code, ctx);
  return { els, calls, document };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const answer = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });
/** A project that knows the token: the preview, then the recorded open. */
const knows = (name = 'Sleep reset', click: unknown = { ref: 'D1A1ABB4', click_id: CLICK, counted: true }) => (call: Call) => (call.fn === 'routine_share_preview' ? answer({ name, description: 'x', creator: 'y' }) : answer(click));

describe('public/routine/index.html', () => {
  it('shows the routine name, read through the preview function, once a token is valid', async () => {
    const r = run(`/routine/${TOKEN}`, knows());
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

  it('asks the staging project first with only the token, then records the open there; no referrer, no cookies', async () => {
    const r = run(`/routine/${TOKEN}`, knows());
    await tick();
    expect(r.calls.map((c) => [c.base, c.fn])).toEqual([[STAGING, 'routine_share_preview'], [STAGING, 'record_routine_share_click']]);
    expect(r.calls[0].body).toEqual({ p_token: TOKEN });
    expect(r.calls[1].body).toEqual({ p_token: TOKEN, p_utm_source: null, p_utm_medium: null, p_utm_campaign: null, p_utm_content: null });
    for (const { init } of r.calls) {
      expect(init.method).toBe('POST');
      expect(init.referrerPolicy).toBe('no-referrer');
      expect(init.credentials).toBe('omit');
      expect(init.headers.apikey).toBeTruthy();
      expect(init.headers.Authorization).toBe(`Bearer ${init.headers.apikey}`);
    }
  });

  it('puts the Guardian\'s referral code and the recorded open into the app link', async () => {
    const r = run(`/routine/${TOKEN}`, knows());
    await tick();
    expect(r.els.open.href).toBe(`healthscan://routine/${TOKEN}?ref=D1A1ABB4&click=${CLICK}`);
  });

  it('carries the utm values the link arrived with: to the database, and on to the app', async () => {
    const r = run(`/routine/${TOKEN}`, knows(), '?utm_source=Guardian-John&utm_medium=QR&utm_campaign=spring-sleep&utm_content=story_1');
    expect(r.els.open.href).toBe(`healthscan://routine/${TOKEN}?utm_source=guardian-john&utm_medium=qr&utm_campaign=spring-sleep&utm_content=story_1`);
    await tick();
    expect(r.calls[1].body).toEqual({ p_token: TOKEN, p_utm_source: 'guardian-john', p_utm_medium: 'qr', p_utm_campaign: 'spring-sleep', p_utm_content: 'story_1' });
    expect(r.els.open.href).toBe(`healthscan://routine/${TOKEN}?ref=D1A1ABB4&click=${CLICK}&utm_source=guardian-john&utm_medium=qr&utm_campaign=spring-sleep&utm_content=story_1`);
  });

  it('drops a utm value the database would refuse, and never uses a ref taken from the address bar', async () => {
    const search = '?utm_source=a%40b.com&utm_medium=%3Cscript%3E&utm_campaign=has%20space&utm_content=' + 'x'.repeat(65) + '&utm_term=keep-out&ref=EVIL1234&click=' + CLICK;
    const r = run(`/routine/${TOKEN}`, knows(), search);
    await tick();
    expect(r.calls[1].body).toEqual({ p_token: TOKEN, p_utm_source: null, p_utm_medium: null, p_utm_campaign: null, p_utm_content: null });
    expect(r.els.open.href).toBe(`healthscan://routine/${TOKEN}?ref=D1A1ABB4&click=${CLICK}`);
    expect(r.els.open.href).not.toMatch(/@|EVIL|script/);
  });

  it('refuses a malformed answer from the server rather than pass it to the app', async () => {
    const r = run(`/routine/${TOKEN}`, knows('Sleep reset', { ref: 'evil<script>', click_id: 'not-a-uuid', counted: true }));
    await tick();
    expect(r.els.title.textContent).toBe('Sleep reset');
    expect(r.els.open.href).toBe(`healthscan://routine/${TOKEN}`);
  });

  it('still works, with the plain link, when recording the open fails', async () => {
    for (const failing of [() => answer(null), () => answer({ message: 'boom' }, false), () => Promise.reject(new TypeError('Failed to fetch'))]) {
      const r = run(`/routine/${TOKEN}`, (call) => (call.fn === 'routine_share_preview' ? answer({ name: 'Sleep reset' }) : failing()), '?utm_medium=qr');
      await tick();
      expect(r.els.title.textContent).toBe('Sleep reset');
      expect(r.els.open.hidden).toBe(false);
      expect(r.els.open.href).toBe(`healthscan://routine/${TOKEN}?utm_medium=qr`);
    }
  });

  it('falls through to production when staging has no such token, errors, or is unreachable, and records the open there only', async () => {
    for (const first of [() => answer(null), () => answer({ message: 'nope' }, false), () => Promise.reject(new TypeError('Failed to fetch')), () => answer({ name: '' })]) {
      const r = run(`/routine/${TOKEN}`, (call) => (call.base === STAGING ? first() : knows('From production')(call)));
      await tick();
      expect(r.calls.map((c) => [c.base, c.fn])).toEqual([[STAGING, 'routine_share_preview'], [PRODUCTION, 'routine_share_preview'], [PRODUCTION, 'record_routine_share_click']]);
      expect(r.els.title.textContent).toBe('From production');
    }
  });

  it('stays generic, with the app buttons, and records no open when no project knows the token', async () => {
    const r = run(`/routine/${TOKEN}`, () => answer(null));
    await tick();
    expect(r.calls.map((c) => c.fn)).toEqual(['routine_share_preview', 'routine_share_preview']);
    expect(r.els.title.textContent).toBe('Open this routine in R³');
    expect(r.els.open.hidden).toBe(false);
  });

  it('accepts an upper-cased token and a trailing slash, sending the lower-case token', async () => {
    const r = run(`/routine/${TOKEN.toUpperCase()}/`, knows());
    await tick();
    expect(r.calls.every((c) => c.body.p_token === TOKEN)).toBe(true);
    expect(r.els.open.href).toBe(`healthscan://routine/${TOKEN}?ref=D1A1ABB4&click=${CLICK}`);
  });

  it('makes no request and offers no app link for a path that is not a routine token', async () => {
    for (const path of ['/routine/', '/routine', '/routine/short', `/routine/${TOKEN}0`, `/routine/${TOKEN}/extra`, '/routine/<script>alert(1)</script>00000000000', `/protocol/${TOKEN}`]) {
      const r = run(path, () => { throw new Error('must not fetch'); }, '?utm_medium=qr');
      await tick();
      expect(r.calls).toHaveLength(0);
      expect(r.els.open.hidden).toBe(true);
      expect(r.els.title.textContent).toBe('This link does not point at a routine');
    }
  });

  it('prints the routine name as text, never as markup, and the token never reaches the page', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    const r = run(`/routine/${TOKEN}`, knows(evil));
    await tick();
    expect(r.els.title.textContent).toBe(evil); // assigned through textContent, so the browser shows it literally
    expect(code).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write|eval\(/);
    expect(Object.values(r.els).some((e) => e.textContent.includes(TOKEN))).toBe(false);
  });

  it('sends nothing personal: the body holds only the token and the checked utm values', async () => {
    const r = run(`/routine/${TOKEN}`, knows(), '?utm_medium=qr&email=jane%40example.com&name=Jane');
    await tick();
    for (const { body } of r.calls) expect(Object.keys(body).every((key) => ['p_token', 'p_utm_source', 'p_utm_medium', 'p_utm_campaign', 'p_utm_content'].includes(key))).toBe(true);
    expect(JSON.stringify(r.calls.map((c) => c.body))).not.toMatch(/jane|@/i);
  });

  it('calls exactly two functions, only on the two Supabase projects, and stores nothing', () => {
    const live = code.replace(/\/\*[\s\S]*?\*\//g, ''); // the header comment names the page's own URL
    const urls = [...live.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]);
    expect(new Set(urls)).toEqual(new Set([STAGING, PRODUCTION]));
    expect([...live.matchAll(/call\(source, '([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual(['record_routine_share_click', 'routine_share_preview']);
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
