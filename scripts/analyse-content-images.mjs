#!/usr/bin/env node
// "Deconstructs" the Content builder's library photos (public/images/content/*.webp) into safe-zone metadata:
// where the subject sits and which parts of the frame are empty enough for text. Writes
// src/data/contentImageZones.json, which src/utils/postLayout.ts uses to pick and place backgrounds.
//
// Two layers. The subject box (`subject`) comes from a vision read of each photo (Claude, looking at the image), kept
// in VISION below: a pixel pass alone can't tell a person from busy foliage. Everything else is a plain saliency
// pass, no AI and no cost: each photo is downscaled with macOS `sips` to a 54×96 BMP, then every
// pixel is scored by how far it sits from the library's cream paper tone and by local contrast (edges). The
// `photo` box is the bounding box of the busy cells (the photo above its fade to cream); `grid` is the busy share of each third (row-major 3×3) and
// `luma` their mean brightness (0–1), so text colour can follow later.
//
//   node scripts/analyse-content-images.mjs        (macOS only: needs `sips`)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const DIR = 'public/images/content', OUT = 'src/data/contentImageZones.json';
const GW = 54, GH = 96; // 1080×1920 / 20
const CREAM = [239, 230, 219];
// x, y, w, h as fractions of the full 1080×1920 frame. Re-read a photo and update its row when it changes.
const VISION = {
  '03-energy': [0.42, 0.03, 0.36, 0.67, 'woman walking out of a sunlit garden door'],
  '04-stress-and-calm': [0.24, 0.03, 0.76, 0.58, 'woman journaling at a window table'],
  '05-womens-wellbeing': [0.2, 0.03, 0.69, 0.51, 'woman arranging flowers in a kitchen'],
  '06-menopause-wellbeing': [0.13, 0.04, 0.87, 0.59, 'woman potting herbs in a greenhouse'],
  '07-healthy-weight-habits': [0, 0, 1, 0.59, 'overhead table of salad bowls and hands'],
  '08-daily-movement': [0.38, 0.11, 0.36, 0.52, 'woman walking a coastal pine path'],
  '09-hydration': [0.36, 0.04, 0.53, 0.45, 'hand lifting a jug of lemon water'],
  '10-healthy-eating': [0.13, 0.12, 0.76, 0.37, 'two women chopping vegetables'],
  '11-morning-routine': [0.18, 0.01, 0.73, 0.56, 'woman stretching at a bright window'],
  '12-evening-reset': [0.13, 0.05, 0.82, 0.56, 'woman by a glowing lamp at dusk'],
  '13-focus': [0.13, 0.01, 0.73, 0.5, 'woman laying out cards at a desk'],
  '14-teen-wellbeing': [0.27, 0.04, 0.73, 0.55, 'teen sitting on the floor with cards'],
  '15-mens-wellbeing': [0.13, 0.07, 0.53, 0.55, 'man in a garden, family planting behind'],
  '16-pregnancy-wellbeing': [0.13, 0.03, 0.76, 0.53, 'pregnant woman on a sofa, partner cooking'],
  '17-new-mother-care': [0.11, 0, 0.78, 0.5, 'mother with baby, partner bringing food'],
  '18-young-child-meals': [0.13, 0.06, 0.87, 0.5, 'mother and child washing vegetables'],
  '19-family-health': [0, 0.06, 1, 0.48, 'three generations gardening'],
  '20-body-mind-soul': [0.29, 0.18, 0.24, 0.45, 'woman standing in a meadow at sunset'],
};

function readBmp(buf) {
  const off = buf.readUInt32LE(10), w = buf.readInt32LE(18), hRaw = buf.readInt32LE(22), bpp = buf.readUInt16LE(28);
  const h = Math.abs(hRaw), bottomUp = hRaw > 0, step = bpp / 8, row = Math.ceil((w * step) / 4) * 4;
  const px = new Array(h);
  for (let y = 0; y < h; y++) {
    const src = bottomUp ? h - 1 - y : y;
    px[y] = [];
    for (let x = 0; x < w; x++) { const i = off + src * row + x * step; px[y].push([buf[i + 2], buf[i + 1], buf[i]]); }
  }
  return { w, h, px };
}

const tmp = mkdtempSync(join(tmpdir(), 'content-zones-'));
const out = {};
try {
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.webp')).sort()) {
    const bmp = join(tmp, `${basename(file, '.webp')}.bmp`);
    const size = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', join(DIR, file)]).toString().match(/\d+/g).slice(-2).map(Number);
    execFileSync('sips', ['-s', 'format', 'bmp', '-z', String(GH), String(GW), join(DIR, file), '--out', bmp], { stdio: 'ignore' });
    const { w, h, px } = readBmp(readFileSync(bmp));
    const lum = (p) => (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
    const busy = [];
    for (let y = 0; y < h; y++) {
      busy.push([]);
      for (let x = 0; x < w; x++) {
        const p = px[y][x];
        const dist = Math.hypot(p[0] - CREAM[0], p[1] - CREAM[1], p[2] - CREAM[2]) / 441;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => px[Math.min(h - 1, Math.max(0, y + dy))][Math.min(w - 1, Math.max(0, x + dx))]);
        const edge = Math.max(...nb.map((q) => Math.abs(lum(q) - lum(p))));
        busy[y].push(dist > 0.12 || edge > 0.08 ? 1 : 0);
      }
    }
    // Subject box: rows / columns where at least 25% of cells are busy.
    const rowShare = busy.map((r) => r.reduce((a, b) => a + b, 0) / w);
    const colShare = Array.from({ length: w }, (_, x) => busy.reduce((a, r) => a + r[x], 0) / h);
    const span = (arr) => { const idx = arr.map((v, i) => (v >= 0.25 ? i : -1)).filter((i) => i >= 0); return idx.length ? [idx[0], idx.at(-1) + 1] : [0, arr.length]; };
    const [y0, y1] = span(rowShare), [x0, x1] = span(colShare);
    const grid = [], luma = [];
    for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
      let n = 0, b = 0, l = 0;
      for (let y = Math.floor((gy * h) / 3); y < Math.floor(((gy + 1) * h) / 3); y++) for (let x = Math.floor((gx * w) / 3); x < Math.floor(((gx + 1) * w) / 3); x++) { n++; b += busy[y][x]; l += lum(px[y][x]); }
      grid.push(Math.round((b / n) * 100) / 100); luma.push(Math.round((l / n) * 100) / 100);
    }
    const r = (v) => Math.round(v * 1000) / 1000;
    const id = basename(file, '.webp'), v = VISION[id];
    if (!v) throw new Error(`No VISION row for ${id}: look at the photo and add its subject box.`);
    out[id] = { w: size[0], h: size[1], label: v[4], subject: { x: v[0], y: v[1], w: v[2], h: v[3] }, photo: { x: r(x0 / w), y: r(y0 / h), w: r((x1 - x0) / w), h: r((y1 - y0) / h) }, grid, luma };
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${Object.keys(out).length} images to ${OUT}`);
