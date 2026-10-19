#!/usr/bin/env node
/**
 * Guards routine3.com's routing. Zero dependencies (it runs as `prebuild`, before
 * anything is guaranteed to be installed): it parses netlify.toml and asserts
 *
 *   - the forced SPA catch-all is the LAST redirect, so every specific rule
 *     precedes it (a rule below it is dead: the catch-all answers first);
 *   - the paths that must not move still resolve as before: the apple association
 *     file (200, same path, application/json, no redirect), /protocol/*, /join/*;
 *   - /routine/<token> (a Guardian's shared routine) is a forced rewrite to a static page that keeps the token out of
 *     referrers and caches, talks only to the two Supabase projects, and is claimed by the association file;
 *   - the legal redirects are 302 to the Notion pages the app uses;
 *   - /unsubscribe is a rewrite to a static page whose CSP hash, API host and
 *     public key agree with the rest of the repo, and which embeds no secret;
 *   - the home page text no longer points at the old domain.
 *
 *   node scripts/check-routes.mjs      exits 1 on the first group of failures
 *
 * The matcher below is first-match-wins in file order, which is how Netlify reads
 * the redirect list. It models `*` and `:splat`; it does not model the
 * "a file exists so a non-forced rule is skipped" nuance, so every rule that
 * guards a real file is `force = true` and is asserted to be.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const abs = (p) => join(ROOT, p);
const read = (p) => readFileSync(abs(p), 'utf8');

// ── minimal netlify.toml reader: [[redirects]], [[headers]], [headers.values] ──
function parseToml(text) {
  const redirects = [];
  const headers = [];
  let cur = null;
  let inValues = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line === '[[redirects]]') { cur = {}; redirects.push(cur); inValues = false; continue; }
    if (line === '[[headers]]') { cur = { values: {} }; headers.push(cur); inValues = false; continue; }
    if (line === '[headers.values]') { inValues = true; continue; }
    if (line.startsWith('[')) { cur = null; inValues = false; continue; }
    const m = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!m || !cur) continue;
    let v = m[2].trim();
    if (v.startsWith('"')) v = v.slice(1, v.lastIndexOf('"'));
    else if (/^\d+$/.test(v)) v = Number(v);
    else if (v === 'true' || v === 'false') v = v === 'true';
    (inValues ? cur.values : cur)[m[1]] = v;
  }
  return { redirects, headers };
}

const toml = parseToml(read('netlify.toml'));
const rules = toml.redirects;

function matchRule(rule, path) {
  const from = rule.from;
  if (/^https?:\/\//.test(from)) return null; // host-scoped rules never match a bare path
  const norm = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
  if (from.endsWith('/*')) {
    const base = from.slice(0, -2);
    if (path === base || path.startsWith(base + '/')) return { splat: path.slice(base.length + 1) };
    return null;
  }
  return norm(from) === norm(path) ? { splat: '' } : null;
}

/** First matching rule, as Netlify would answer `path`. */
function resolve(path) {
  for (let i = 0; i < rules.length; i++) {
    const m = matchRule(rules[i], path);
    if (m) {
      const r = rules[i];
      return { index: i, status: r.status, to: String(r.to).replace(':splat', m.splat), force: r.force === true, rule: r };
    }
  }
  return null;
}

function headersFor(path) {
  const out = {};
  for (const h of toml.headers) {
    const f = h.for;
    const hit = f === '/*' || f === path || (f.endsWith('/*') && (path === f.slice(0, -2) || path.startsWith(f.slice(0, -1))));
    if (hit) Object.assign(out, h.values);
  }
  return out;
}

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// ── 1. ordering: the catch-all is last, nothing specific is below it ──
const last = rules[rules.length - 1];
check(last && last.from === '/*' && last.to === '/index.html' && last.status === 200, 'the SPA catch-all (/* -> /index.html 200) must be the last redirect');
check(last && last.force === true, 'the SPA catch-all is expected to be forced; if that changed, re-read the force notes in this file');
const catchAllAt = rules.findIndex((r) => r.from === '/*');
check(catchAllAt === rules.length - 1, 'a redirect sits below the /* catch-all and can never fire');

// ── 2. paths that must not move ──
const UUID = '0b46960a-1d2c-4f3b-9a4e-5c6d7e8f9a0b';
const aasa = resolve('/.well-known/apple-app-site-association');
check(aasa && aasa.status === 200 && aasa.to === '/.well-known/apple-app-site-association' && aasa.force, 'AASA: must be a forced 200 pass-through at the same path (no redirect, no rewrite)');
check(headersFor('/.well-known/apple-app-site-association')['Content-Type'] === 'application/json', 'AASA: Content-Type must be application/json');
const aasaAlias = resolve('/apple-app-site-association');
check(aasaAlias && aasaAlias.status === 200 && aasaAlias.to === '/.well-known/apple-app-site-association', '/apple-app-site-association must still rewrite to the .well-known file');
const prot = resolve(`/protocol/${UUID}`);
check(prot && prot.status === 200 && prot.to === '/protocol/index.html' && prot.force, '/protocol/<uuid> must rewrite to /protocol/index.html (forced)');
const joinRule = resolve('/join/abcdefghijklmnop');
check(joinRule && joinRule.status === 200 && joinRule.to === '/join/index.html' && joinRule.force, '/join/<token> must rewrite to /join/index.html (forced)');
check(headersFor('/join/x')['Referrer-Policy'] === 'no-referrer', '/join/* must keep Referrer-Policy: no-referrer');
for (const must of ['public/.well-known/apple-app-site-association', 'public/protocol/index.html', 'public/join/index.html', 'public/routine/index.html']) {
  check(existsSync(abs(must)), `${must} must exist`);
}

const aasaJson = JSON.parse(read('public/.well-known/apple-app-site-association'));
const aasaPaths = (aasaJson.applinks?.details ?? []).flatMap((d) => (d.components ?? []).map((c) => c['/']));
check(aasaPaths.includes('/join/*') && aasaPaths.some((p) => p.startsWith('/protocol/')), 'AASA components must still claim /join/* and /protocol/<uuid>');
check(aasaPaths.includes('/routine/*'), 'AASA components must claim /routine/* (a Guardian\'s shared routine opens in the app)');
check(!aasaPaths.some((p) => /privacy|terms|unsubscribe|email/.test(p)), 'AASA must not claim the web-only routes: they would open the app instead of the page');

// the SPA still answers its own routes
for (const spa of ['/', '/blog', '/admin', '/whatever-the-app-adds']) {
  const r = resolve(spa);
  check(r && r.status === 200 && r.to === '/index.html', `${spa} must still reach the SPA shell`);
}

// ── 2b. /routine/<token>: a Guardian's shared routine ──
const TOKEN = '0123456789abcdef0123456789abcdef';
const routineRule = resolve(`/routine/${TOKEN}`);
check(routineRule && routineRule.status === 200 && routineRule.to === '/routine/index.html' && routineRule.force, '/routine/<token> must rewrite to /routine/index.html (forced)');
check(routineRule && routineRule.index < catchAllAt, '/routine/*: must sit above the catch-all');
const rh = headersFor(`/routine/${TOKEN}`);
check(rh['Referrer-Policy'] === 'no-referrer', '/routine/*: Referrer-Policy must be no-referrer (the token is in the URL)');
check(/noindex/.test(rh['X-Robots-Tag'] || ''), '/routine/*: must be noindex');
check(rh['Cache-Control'] === 'no-store', '/routine/*: must be no-store');
if (existsSync(abs('public/routine/index.html'))) {
  const page = read('public/routine/index.html');
  const csp = rh['Content-Security-Policy'] || '';
  const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  check(scripts.length === 1 && !/<script[^>]*\ssrc=/i.test(page), '/routine: exactly one inline <script> and no external script (the CSP hash covers one)');
  const hash = scripts.length ? createHash('sha256').update(scripts[0][1]).digest('base64') : '';
  check(csp.includes(`'sha256-${hash}'`), `/routine: CSP script-src hash does not match the inline script (any edit to the script, comments included, changes it). Set netlify.toml to 'sha256-${hash}' (a stale hash blocks the script silently)`);
  check(/default-src 'none'/.test(csp) && /form-action 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp) && /base-uri 'none'/.test(csp), '/routine: CSP must keep default-src/base-uri/form-action/frame-ancestors locked');
  // Only the two projects that can mint a token; keys must be the anon keys already in the repo.
  const envText = read('src/utils/supabase/environments.ts');
  const envKeys = ['staging', 'production'].map((name) => envText.match(new RegExp(`${name}:\\s*\\{\\s*projectId:\\s*'([a-z0-9]+)',\\s*publicAnonKey:\\s*'([^']+)'`)));
  check(envKeys.every(Boolean), 'could not read the staging and production entries of src/utils/supabase/environments.ts');
  if (envKeys.every(Boolean)) {
    const hosts = envKeys.map((m) => `https://${m[1]}.supabase.co`);
    check(csp.includes(`connect-src ${hosts.join(' ')};`), `/routine: CSP connect-src must be exactly ${hosts.join(' ')}`);
    for (const [ref, anon] of envKeys.map((m) => [m[1], m[2]])) {
      check(page.includes(`'${anon}'`), `/routine: key for ${ref} differs from the anon key in environments.ts`);
      check(page.includes(`https://${ref}.supabase.co`), `/routine: must read from ${ref}`);
      const role = JSON.parse(Buffer.from(anon.split('.')[1], 'base64url').toString()).role;
      check(role === 'anon', `/routine: embedded key for ${ref} has role "${role}", only the anon key may ever be in a public page`);
    }
  }
  const jwts = page.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || [];
  check(jwts.length === 2, `/routine: expected exactly two JWTs (the two anon keys), found ${jwts.length}`);
  check(!/service_role|sb_secret|RESEND_API/i.test(page), '/routine: names a secret');
  check(page.includes('/rest/v1/rpc/routine_share_preview'), '/routine: must read the routine through routine_share_preview, never a table');
  check(!/\/rest\/v1\/(?!rpc\/)/.test(page), '/routine: must not query a table directly');
  check(!/innerHTML|document\.write|eval\(|insertAdjacentHTML/.test(page), '/routine: must not write markup (the routine name is untrusted input)');
  check(!/localStorage|sessionStorage|document\.cookie/.test(page), '/routine: must not store the token');
  check(!/fonts\.googleapis|fonts\.gstatic|<img\b|<link\b[^>]*rel=["']?stylesheet/i.test(page), '/routine: no third-party or image requests (the token is in the URL)');
  check(page.includes('healthscan://routine/') && page.includes('https://apps.apple.com/app/id6740406583'), '/routine: needs the app-scheme button and the App Store button');
}

// ── 3. legal redirects ──
const PRIVACY = 'https://privacy-healthscan.notion.site/Privacy-Policy-AI-Health-Scan-265d6c957aa080f5aeccdaacf419968b';
const TERMS = 'https://terms-healthscan.notion.site/Terms-of-Use-AI-Health-Scan-265d6c957aa080bc92f0e5b77d63b5d2';
for (const [p, dest] of [['/privacy', PRIVACY], ['/terms', TERMS], ['/privacy/', PRIVACY]]) {
  const r = resolve(p);
  check(r && r.status === 302 && r.to === dest && r.force, `${p}: must be a forced 302 to ${dest}`);
  check(r && r.index < catchAllAt, `${p}: must sit above the catch-all`);
}

// ── 4. /unsubscribe ──
const unsub = resolve('/unsubscribe');
check(unsub && unsub.status === 200 && unsub.to === '/unsubscribe/index.html' && unsub.force, '/unsubscribe: must be a forced 200 rewrite to /unsubscribe/index.html');
const uh = headersFor('/unsubscribe');
check(uh['Referrer-Policy'] === 'no-referrer', '/unsubscribe: Referrer-Policy must be no-referrer (the token is in the URL)');
check(/noindex/.test(uh['X-Robots-Tag'] || ''), '/unsubscribe: must be noindex');
check(uh['Cache-Control'] === 'no-store', '/unsubscribe: must be no-store');

if (existsSync(abs('public/unsubscribe/index.html'))) {
  const page = read('public/unsubscribe/index.html');
  const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  check(scripts.length === 1, '/unsubscribe: exactly one inline <script> (the CSP hash covers one)');
  check(!/<script[^>]*\ssrc=/i.test(page), '/unsubscribe: no external script');
  const csp = uh['Content-Security-Policy'] || '';
  const hash = scripts.length ? createHash('sha256').update(scripts[0][1]).digest('base64') : '';
  check(csp.includes(`'sha256-${hash}'`), `/unsubscribe: CSP script-src hash does not match the inline script (any edit to the script, comments included, changes it). Set netlify.toml to 'sha256-${hash}' (a stale hash blocks the script silently)`);
  // regression guards for the review fixes
  check(!/never an address/i.test(page), '/unsubscribe: do not claim the RPC "never returns an address"; its ok branch returns the subscriber uuid');
  check(/<noscript>[\s\S]*?JavaScript[\s\S]*?<\/noscript>/.test(page), '/unsubscribe: needs a <noscript> message (without JS the button stays hidden)');
  check(!/mailto:|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/i.test(page), '/unsubscribe: must not hardcode a mailbox (the reply address is whatever the email was sent with; the routine3.com mailbox is unconfirmed)');
  check(/production/i.test(page.slice(0, page.indexOf('<script>') + 1500)), '/unsubscribe: the page must say which project it targets and why');
  check(/default-src 'none'/.test(csp) && /form-action 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp), '/unsubscribe: CSP must keep default-src/form-action/frame-ancestors locked');

  // Only the production API host, and the key must be the production anon key already in the repo.
  const env = read('src/utils/supabase/environments.ts');
  const prod = env.match(/production:\s*\{\s*projectId:\s*'([a-z0-9]+)',\s*publicAnonKey:\s*'([^']+)'/);
  check(!!prod, 'could not read the production entry of src/utils/supabase/environments.ts');
  if (prod) {
    const [, ref, anon] = prod;
    check(page.includes(`https://${ref}.supabase.co/rest/v1/rpc/unsubscribe_email`), '/unsubscribe: must call unsubscribe_email on the production project');
    check(csp.includes(`connect-src https://${ref}.supabase.co;`), '/unsubscribe: CSP connect-src must be exactly the production API host');
    check(page.includes(`'${anon}'`), '/unsubscribe: key differs from the production anon key in environments.ts');
    const role = JSON.parse(Buffer.from(anon.split('.')[1], 'base64url').toString()).role;
    check(role === 'anon', `/unsubscribe: embedded key has role "${role}", only the anon key may ever be in a public page`);
  }
  const jwts = page.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || [];
  check(jwts.length === 1, `/unsubscribe: expected exactly one JWT (the anon key), found ${jwts.length}`);
  check(!/service_role|sb_secret|RESEND_API/i.test(page), '/unsubscribe: names a secret');
  const hosts = new Set([...page.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()));
  check([...hosts].every((h) => h === 'routine3.com' || (prod ? h === `${prod[1]}.supabase.co` : false)), `/unsubscribe: unexpected host(s) in the page: ${[...hosts].join(', ')}`);
  check(!/innerHTML|document\.write|eval\(/.test(page), '/unsubscribe: must not write markup (the token is untrusted input)');
  check(!/localStorage|sessionStorage|document\.cookie/.test(page), '/unsubscribe: must not store the token');
} else {
  check(false, 'public/unsubscribe/index.html is missing');
}

// ── 5. og.jpg ──
const og = resolve('/og.jpg');
check(og && og.status === 200 && og.to === '/og.jpg' && og.force, '/og.jpg: must be a forced pass-through to the real file');
check(headersFor('/og.jpg')['Content-Type'] === 'image/jpeg', '/og.jpg: Content-Type must be image/jpeg');
if (existsSync(abs('public/og.jpg'))) {
  const b = readFileSync(abs('public/og.jpg'));
  check(b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, 'public/og.jpg is not a JPEG');
} else {
  check(false, 'public/og.jpg is missing');
}

// og.jpg: declared size must be the real size (a wrong size makes some scrapers crop or reject)
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

// ── 6. home page text ──
const home = read('index.html');
if (existsSync(abs('public/og.jpg'))) {
  const dim = jpegSize(readFileSync(abs('public/og.jpg')));
  const w = home.match(/og:image:width" content="(\d+)"/), h = home.match(/og:image:height" content="(\d+)"/);
  check(dim && w && h && Number(w[1]) === dim.w && Number(h[1]) === dim.h, `index.html: og:image:width/height (${w && w[1]}x${h && h[1]}) must match public/og.jpg (${dim ? dim.w + 'x' + dim.h : 'unreadable'})`);
}
check(/check-unsubscribe-page\.mjs/.test(JSON.parse(read('package.json')).scripts.prebuild || ''), 'package.json: prebuild must run scripts/check-unsubscribe-page.mjs (the page behaviour is otherwise unguarded)');
check(home.includes('<link rel="canonical" href="https://routine3.com/" />'), 'index.html: canonical must be https://routine3.com/');
check(home.includes('<meta property="og:image" content="https://routine3.com/og.jpg" />'), 'index.html: og:image must be https://routine3.com/og.jpg');
check(home.includes('<meta name="twitter:image" content="https://routine3.com/og.jpg" />'), 'index.html: twitter:image must be https://routine3.com/og.jpg');
const OLD = /healthscan\.live/g;
// social handles on other platforms are accounts, not our domain
const stripHandles = (t) => t.replace(/instagram\.com\/healthscan\.live\/?/g, '').replace(/tiktok\.com\/@healthscan\.live/g, '');
for (const f of ['index.html', 'public/robots.txt', 'public/sitemap.xml', 'src/components/Footer.tsx', 'src/components/FAQSection.tsx', 'src/components/FAQContactCTA.tsx']) {
  const left = stripHandles(read(f)).match(OLD);
  check(!left, `${f}: still names healthscan.live (${left ? left.length : 0}x)`);
}
check(read('public/robots.txt').includes('Sitemap: https://routine3.com/sitemap.xml'), 'robots.txt: Sitemap must be on routine3.com');

if (failures.length) {
  console.error(`check-routes: ${failures.length} problem(s)`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`check-routes: ok (${rules.length} redirects, ${toml.headers.length} header blocks)`);
