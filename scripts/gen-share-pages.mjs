#!/usr/bin/env node
/**
 * Link crawlers (iMessage, WhatsApp, Slack, X, LinkedIn) do not run the app, so every shareable route needs its own
 * <head>. After `vite build` this writes build/share/<id>.html for each route marked "generated" in
 * src/config/shareRoutes.json: the built index.html with that route's title, description, canonical URL and card image.
 * netlify.toml rewrites the route's paths to that file; the app boots from it exactly as from index.html.
 *
 *   node scripts/gen-share-pages.mjs [buildDir]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const table = JSON.parse(readFileSync(join(ROOT, 'src/config/shareRoutes.json'), 'utf8'));

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const abs = (path) => `${table.origin}${path}`;

/** Replace the content of the one tag a selector names; throws if the page does not have it (a silent miss ships the wrong card). */
function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta\\s+${attr}="${key.replace(/[:.]/g, '\\$&')}"\\s+content=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`index.html has no <meta ${attr}="${key}">`);
  return html.replace(re, (_, a, b) => `${a}${esc(value)}${b}`);
}

/** index.html's head for one route. Pure: the same html and route always give the same page. */
export function renderSharePage(html, route) {
  const url = abs(route.url);
  const image = abs(`/share/${route.id}.jpg`);
  let out = html;
  if (!/<title>[^<]*<\/title>/.test(out)) throw new Error('index.html has no <title>');
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(route.title).replace(/&quot;/g, '"')}</title>`);
  const pairs = [
    ['name', 'description', route.description],
    ['property', 'og:url', url], ['property', 'og:title', route.title], ['property', 'og:description', route.description],
    ['property', 'og:image', image], ['property', 'og:image:width', table.image.width], ['property', 'og:image:height', table.image.height],
    ['property', 'og:image:alt', `${route.name} on ROUTINE³`], ['name', 'twitter:image:alt', `${route.name} on ROUTINE³`],
    ['name', 'twitter:url', url], ['name', 'twitter:title', route.title], ['name', 'twitter:description', route.description], ['name', 'twitter:image', image],
  ];
  for (const [attr, key, value] of pairs) out = setMeta(out, attr, key, value);
  if (!/<link rel="canonical" href="[^"]*"/.test(out)) throw new Error('index.html has no canonical link');
  out = out.replace(/(<link rel="canonical" href=")[^"]*(")/, (_, a, b) => `${a}${esc(url)}${b}`);
  return out;
}

export const generatedRoutes = () => table.routes.filter((r) => r.page === 'generated');

function main() {
  const buildDir = join(ROOT, process.argv[2] || 'build');
  const source = join(buildDir, 'index.html');
  if (!existsSync(source)) throw new Error(`${source} not found: run vite build first`);
  const html = readFileSync(source, 'utf8');
  mkdirSync(join(buildDir, 'share'), { recursive: true });
  for (const route of generatedRoutes()) {
    writeFileSync(join(buildDir, 'share', `${route.id}.html`), renderSharePage(html, route));
    console.log(`share page: ${route.url} -> share/${route.id}.html`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
