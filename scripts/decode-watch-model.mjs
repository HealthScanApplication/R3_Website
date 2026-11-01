#!/usr/bin/env node
/**
 * Turns the Pod Plan artifact's `watch-b64.txt` (the R³ Retro watch, base64) into public/models/r3-clip-watch.bin,
 * the model the /ring hero loads: the WHOLE watch, case plus its closed link bracelet, welded and then simplified
 * with the ring's quadric-error decimator (scripts/decimate-stl.mjs) to 120,000 triangles, so it fits Uint16 indices
 * and ~1.1 MB.
 *
 * Format (same as the source, little-endian): uint32 header length, JSON header {min, max, n, ni}, n × 3 Int16
 * quantised positions (value = min + (q + 32768) / 65535 × (max - min)), zero padding to a 4-byte boundary,
 * ni indices: Uint32, or Uint16 when the header says `iw: 2` (written whenever n <= 65535; the artifact's own file has
 * no `iw` and so stays Uint32).
 *
 * Before decimating, the watch is welded on a 0.001-model-unit grid (0.038 mm at the artifact's S = 38 mm per unit,
 * far below a pixel), and triangles that collapse are dropped.
 *
 * Usage: node scripts/decode-watch-model.mjs <watch-b64.txt> [out.bin]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { simplify } from './decimate-stl.mjs';

export const FULL_TRIANGLES = 120000;

export function decodeModel(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const hl = dv.getUint32(0, true);
  const h = JSON.parse(new TextDecoder().decode(u.subarray(4, 4 + hl)));
  const positions = new Float32Array(h.n * 3);
  const po = 4 + hl;
  for (let i = 0; i < positions.length; i++) {
    const k = i % 3, q = dv.getInt16(po + i * 2, true);
    positions[i] = h.min[k] + ((q + 32768) / 65535) * (h.max[k] - h.min[k]);
  }
  const end = po + h.n * 6, io = end + ((4 - (end % 4)) % 4);
  const indices = new Uint32Array(h.ni), w = h.iw === 2 ? 2 : 4;
  for (let i = 0; i < h.ni; i++) indices[i] = w === 2 ? dv.getUint16(io + i * 2, true) : dv.getUint32(io + i * 4, true);
  return { positions, indices };
}

export function encodeModel({ positions, indices }) {
  const n = positions.length / 3, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) { const k = i % 3; min[k] = Math.min(min[k], positions[i]); max[k] = Math.max(max[k], positions[i]); }
  const iw = n <= 65535 ? 2 : 4;
  const header = new TextEncoder().encode(JSON.stringify(iw === 2 ? { min, max, n, ni: indices.length, iw } : { min, max, n, ni: indices.length }));
  const end = 4 + header.length + n * 6, io = end + ((4 - (end % 4)) % 4);
  const out = new Uint8Array(io + indices.length * iw), dv = new DataView(out.buffer);
  dv.setUint32(0, header.length, true);
  out.set(header, 4);
  for (let i = 0; i < positions.length; i++) {
    const k = i % 3, span = max[k] - min[k] || 1;
    dv.setInt16(4 + header.length + i * 2, Math.round(((positions[i] - min[k]) / span) * 65535) - 32768, true);
  }
  for (let i = 0; i < indices.length; i++) if (iw === 2) dv.setUint16(io + i * 2, indices[i], true); else dv.setUint32(io + i * 4, indices[i], true);
  return out;
}

/** Merge vertices that fall in the same `eps` grid cell (keeping the first one's position); drop collapsed triangles. */
export function weld({ positions, indices }, eps) {
  const cell = new Map(), remap = new Uint32Array(positions.length / 3), pos = [];
  for (let v = 0; v < remap.length; v++) {
    const key = `${Math.round(positions[v * 3] / eps)},${Math.round(positions[v * 3 + 1] / eps)},${Math.round(positions[v * 3 + 2] / eps)}`;
    let id = cell.get(key);
    if (id === undefined) { id = cell.size; cell.set(key, id); pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); }
    remap[v] = id;
  }
  const idx = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]], b = remap[indices[t + 1]], c = remap[indices[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/** The whole watch (case + bracelet): welded on the same 0.001 grid, then decimated to at most `targetTriangles`. */
export function keepFull(model, targetTriangles = FULL_TRIANGLES) {
  const w = weld(model, 0.001);
  const s = simplify({ vertices: w.positions, indices: w.indices }, targetTriangles);
  return { positions: Float32Array.from(s.vertices), indices: Uint32Array.from(s.indices) };
}

function cli(argv) {
  const [src, out = 'public/models/r3-clip-watch.bin'] = argv.slice(2);
  if (!src) { console.error('Usage: node scripts/decode-watch-model.mjs <watch-b64.txt> [out.bin]'); process.exit(1); }
  const model = decodeModel(Buffer.from(readFileSync(src, 'utf8').trim(), 'base64'));
  const watch = keepFull(model);
  const bytes = encodeModel(watch);
  writeFileSync(out, bytes);
  console.log(`${model.indices.length / 3} -> ${watch.indices.length / 3} triangles, ${watch.positions.length / 3} vertices, ${bytes.length} bytes -> ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli(process.argv);
