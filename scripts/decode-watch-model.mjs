#!/usr/bin/env node
/**
 * Turns the Pod Plan artifact's `watch-b64.txt` (the R³ Retro watch, base64) into public/models/r3-clip-retro.bin:
 * the watch HEAD only (bracelet and lugs dropped, same filter as the artifact: z > 0.3 and |y| < 0.47), compacted
 * to the vertices those triangles use.
 *
 * Format (same as the source, little-endian): uint32 header length, JSON header {min, max, n, ni}, n × 3 Int16
 * quantised positions (value = min + (q + 32768) / 65535 × (max - min)), zero padding to a 4-byte boundary,
 * ni indices: Uint32, or Uint16 when the header says `iw: 2` (written whenever n <= 65535; the artifact's own file has
 * no `iw` and so stays Uint32).
 *
 * To fit Uint16 indices (and the < 1.5 MB budget) the head is welded on a 0.001-model-unit grid (0.038 mm at the
 * artifact's S = 38 mm per unit, far below a pixel), and triangles that collapse are dropped.
 *
 * Usage: node scripts/decode-watch-model.mjs <watch-b64.txt> [out.bin]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

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

/** The artifact's head filter, then compaction to used vertices (in first-use order). */
export function keepHead({ positions, indices }) {
  const ok = i => positions[i * 3 + 2] > 0.3 && Math.abs(positions[i * 3 + 1]) < 0.47;
  const remap = new Map(), idx = [], pos = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    if (!(ok(a) && ok(b) && ok(c))) continue;
    for (const v of [a, b, c]) {
      if (!remap.has(v)) { remap.set(v, remap.size); pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); }
      idx.push(remap.get(v));
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
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

function cli(argv) {
  const [src, out = 'public/models/r3-clip-retro.bin'] = argv.slice(2);
  if (!src) { console.error('Usage: node scripts/decode-watch-model.mjs <watch-b64.txt> [out.bin]'); process.exit(1); }
  const full = decodeModel(Buffer.from(readFileSync(src, 'utf8').trim(), 'base64'));
  const head = weld(keepHead(full), 0.001);
  const bytes = encodeModel(head);
  writeFileSync(out, bytes);
  console.log(`${full.indices.length / 3} -> ${head.indices.length / 3} triangles, ${head.positions.length / 3} vertices, ${bytes.length} bytes -> ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli(process.argv);
