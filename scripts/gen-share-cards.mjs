#!/usr/bin/env node
/**
 * Draws public/share/<id>.jpg for every route in src/config/shareRoutes.json: the header's ROUTINE³ lockup and the route's name on the
 * home page's look (sand, terracotta glow, the header's ROUTINE³ lockup). The cards are committed; run this when a route or its name changes.
 *
 *   node scripts/gen-share-cards.mjs [id ...]
 *
 * Needs Google Chrome (headless screenshot; CHROME=/path overrides) and macOS `sips` (PNG -> JPEG). Fraunces and Archivo
 * load from Google Fonts, the same faces the site uses. Each card stays under 300 KB: WhatsApp drops larger previews.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const table = JSON.parse(readFileSync(join(ROOT, 'src/config/shareRoutes.json'), 'utf8'));
const { width, height } = table.image;
const MAX_BYTES = 300 * 1024;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const escHtml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** A ³ carries the brand's terracotta wherever it sits. */
const withThree = (text) => escHtml(text).replace(/³/g, '<span class="three">³</span>');

/**
 * The card is the home hero in miniature: sand paper, the terracotta glow from the bottom-left corner, the ROUTINE³ · BETA
 * lockup from the site header (Header.tsx RoutineMark, drawn at twice the size so it still reads in a small preview) and a
 * Fraunces headline with the lead in white and the emphasis in italic ink (HeroSection.tsx).
 */
export function cardHtml(route) {
  const { lead, emphasis } = route.card;
  const lines = lead.split('\n');
  const long = lines.length === 1 && `${lead} ${emphasis}`.length > 13;
  const headline = lines.map((l, i) => i < lines.length - 1 ? `<span class="lead">${withThree(l)}</span><br>` : `<span class="lead">${withThree(l)}</span> <em>${withThree(emphasis)}</em>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Fraunces:ital,opsz,wght@0,9..144,380;1,9..144,380&display=block" rel="stylesheet">
<style>
  html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
  body{position:relative;background:#F1EBDD;color:#16140F}
  .layer{position:absolute;inset:0}
  .wash{background:linear-gradient(158deg,rgba(250,245,236,.55) 0%,rgba(250,245,236,.35) 45%,rgba(241,235,221,.2) 100%)}
  .glow{background:radial-gradient(92% 112% at 0% 100%,rgba(176,90,54,.86) 0%,rgba(176,90,54,.55) 38%,rgba(176,90,54,.16) 70%,rgba(176,90,54,0) 92%)}
  .grain{opacity:.05;mix-blend-mode:multiply;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
  .lockup{position:absolute;left:64px;top:56px;display:inline-flex;align-items:stretch;height:56px;border:2px solid #16140F;border-radius:4px;overflow:hidden;font-family:Archivo,Arial,sans-serif;text-transform:uppercase;color:#16140F;white-space:nowrap}
  .lockup .name{display:flex;align-items:center;padding:0 24px;font-weight:700;font-size:24px;letter-spacing:.13em}
  .lockup .tag{display:flex;align-items:center;padding:0 20px;border-left:2px solid #16140F;font-weight:600;font-size:20px;letter-spacing:.08em}
  h1{position:absolute;left:60px;bottom:58px;margin:0;font-family:Fraunces,Georgia,serif;font-weight:380;font-size:${lines.length > 1 ? 132 : long ? 142 : 168}px;line-height:.94;letter-spacing:-.04em;font-variation-settings:"opsz" 144;white-space:nowrap}
  h1 .lead{color:#fff;text-shadow:0 2px 30px rgba(96,44,22,.38)}
  h1 em{font-style:italic;color:#16140F}
  .three{color:#B05A36}
  h1 .lead .three{color:#fff}
</style></head><body>
<div class="layer wash"></div><div class="layer glow"></div><div class="layer grain"></div>
<div class="lockup"><span class="name">ROUTINE³</span><span class="tag">Beta</span></div>
<h1>${headline}</h1>
</body></html>`;
}

function render(route, out, work) {
  const html = join(work, `${route.id}.html`);
  const png = join(work, `${route.id}.png`);
  writeFileSync(html, cardHtml(route));
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${width},${height}`, '--virtual-time-budget=8000', `--screenshot=${png}`, pathToFileURL(html).href], { stdio: 'ignore' });
  for (const quality of [88, 80, 70, 60]) {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), png, '--out', out], { stdio: 'ignore' });
    if (statSync(out).size <= MAX_BYTES) return quality;
  }
  throw new Error(`${out} is over ${MAX_BYTES} bytes even at quality 60`);
}

function main() {
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}; set CHROME=/path/to/chrome`);
  const only = new Set(process.argv.slice(2));
  const work = mkdtempSync(join(tmpdir(), 'share-cards-'));
  mkdirSync(join(ROOT, 'public/share'), { recursive: true });
  try {
    for (const route of table.routes.filter((r) => !only.size || only.has(r.id))) {
      const out = join(ROOT, 'public/share', `${route.id}.jpg`);
      const q = render(route, out, work);
      console.log(`${route.id}: ${route.name} -> public/share/${route.id}.jpg (${Math.round(statSync(out).size / 1024)} KB, q${q})`);
    }
  } finally { rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
