#!/usr/bin/env node
// Dependency-free STL decimator (vertex clustering). Pure Node, ESM.
//
// Usage: node scripts/decimate-stl.mjs <input.stl> <output.stl> [--max-triangles 40000]
//
// Positions are Float32Arrays with 9 floats per triangle (three xyz vertices).

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Parse binary or ASCII STL bytes into a Float32Array (9 floats per triangle). */
export function parseStl(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Invalid STL: expected a Uint8Array');
  if (bytes.length >= 84) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = dv.getUint32(80, true);
    if (84 + 50 * count === bytes.length) {
      const out = new Float32Array(count * 9);
      for (let t = 0; t < count; t++) {
        const base = 84 + t * 50 + 12; // skip the 12-byte normal
        for (let k = 0; k < 9; k++) out[t * 9 + k] = dv.getFloat32(base + k * 4, true);
      }
      return out;
    }
  }
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 5))).toLowerCase();
  if (head === 'solid') {
    const text = new TextDecoder().decode(bytes);
    const values = [];
    const re = /^\s*vertex\s+(\S+)\s+(\S+)\s+(\S+)/gim;
    let m;
    while ((m = re.exec(text)) !== null) {
      values.push(Number(m[1]), Number(m[2]), Number(m[3]));
    }
    if (values.length === 0 || values.length % 9 !== 0 || values.some((v) => !Number.isFinite(v))) {
      throw new Error('Invalid STL: ASCII file has no vertices or a vertex count that is not a multiple of 3');
    }
    return new Float32Array(values);
  }
  throw new Error(
    `Invalid STL: ${bytes.length} bytes is neither a binary STL (84 + 50 * count bytes) nor an ASCII STL starting with "solid"`,
  );
}

/** Serialise positions as a binary STL with computed unit face normals. */
export function writeBinaryStl(positions) {
  const n = Math.floor(positions.length / 9);
  const buf = new Uint8Array(84 + 50 * n);
  const dv = new DataView(buf.buffer);
  buf.set(new TextEncoder().encode('R3 ring, decimated by scripts/decimate-stl.mjs'), 0);
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    const p = t * 9;
    const ux = positions[p + 3] - positions[p], uy = positions[p + 4] - positions[p + 1], uz = positions[p + 5] - positions[p + 2];
    const vx = positions[p + 6] - positions[p], vy = positions[p + 7] - positions[p + 1], vz = positions[p + 8] - positions[p + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; } else { nx = ny = nz = 0; }
    const o = 84 + t * 50;
    dv.setFloat32(o, nx, true);
    dv.setFloat32(o + 4, ny, true);
    dv.setFloat32(o + 8, nz, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, positions[p + k], true);
    // attribute byte count stays 0
  }
  return buf;
}

/**
 * Vertex clustering. Cell size = max(extent) / cells. Each cell's representative
 * is the mean of its vertices; triangles whose vertices fall in fewer than three
 * distinct cells are dropped. No recentering or rescaling.
 */
export function decimate(positions, cells) {
  const nv = Math.floor(positions.length / 3);
  if (nv === 0 || !(cells >= 1)) return { positions: new Float32Array(0), triangles: 0 };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const size = extent > 0 ? extent / cells : 1;
  const dim = Math.floor(cells) + 1; // indices run 0..cells inclusive
  const cellOfVertex = new Int32Array(nv);
  const ids = new Map();
  let count = 0;
  for (let i = 0; i < nv; i++) {
    const ix = Math.floor((positions[i * 3] - min[0]) / size);
    const iy = Math.floor((positions[i * 3 + 1] - min[1]) / size);
    const iz = Math.floor((positions[i * 3 + 2] - min[2]) / size);
    const key = (ix * dim + iy) * dim + iz;
    let id = ids.get(key);
    if (id === undefined) { id = count++; ids.set(key, id); }
    cellOfVertex[i] = id;
  }
  ids.clear();
  const sum = new Float64Array(count * 3);
  const num = new Uint32Array(count);
  for (let i = 0; i < nv; i++) {
    const c = cellOfVertex[i];
    sum[c * 3] += positions[i * 3];
    sum[c * 3 + 1] += positions[i * 3 + 1];
    sum[c * 3 + 2] += positions[i * 3 + 2];
    num[c]++;
  }
  const nt = Math.floor(nv / 3);
  const out = new Float32Array(nt * 9);
  let kept = 0;
  for (let t = 0; t < nt; t++) {
    const a = cellOfVertex[t * 3], b = cellOfVertex[t * 3 + 1], c = cellOfVertex[t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    const o = kept * 9;
    const cs = [a, b, c];
    for (let v = 0; v < 3; v++) {
      const cell = cs[v];
      out[o + v * 3] = sum[cell * 3] / num[cell];
      out[o + v * 3 + 1] = sum[cell * 3 + 1] / num[cell];
      out[o + v * 3 + 2] = sum[cell * 3 + 2] / num[cell];
    }
    kept++;
  }
  return { positions: out.slice(0, kept * 9), triangles: kept };
}

/**
 * Binary-search the cell count for the largest result with <= maxTriangles
 * triangles. Does not assume strict monotonicity: the best result that satisfied
 * the bound during the search is returned.
 */
export function decimateToTarget(positions, maxTriangles) {
  let best = null; // largest result seen with triangles <= maxTriangles
  const consider = (cells) => {
    const r = decimate(positions, cells);
    if (r.triangles <= maxTriangles && (best === null || r.triangles > best.triangles)) {
      best = { positions: r.positions, cells, triangles: r.triangles };
    }
    return r.triangles;
  };
  let lo = 1;
  let hi = 8192;
  consider(lo);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (consider(mid) <= maxTriangles) lo = mid;
    else hi = mid - 1;
  }
  if (best === null || best.triangles > maxTriangles) {
    throw new Error(`Cannot decimate to <= ${maxTriangles} triangles`);
  }
  return best;
}

function cli(argv) {
  const args = argv.slice(2);
  let max = 40000;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-triangles') max = Number(args[++i]);
    else files.push(args[i]);
  }
  if (files.length !== 2 || !Number.isFinite(max) || max < 1) {
    console.error('Usage: node scripts/decimate-stl.mjs <input.stl> <output.stl> [--max-triangles 40000]');
    process.exit(1);
  }
  const t0 = Date.now();
  const input = parseStl(new Uint8Array(readFileSync(files[0])));
  const result = decimateToTarget(input, max);
  const bytes = writeBinaryStl(result.positions);
  writeFileSync(files[1], bytes);
  console.log(`input triangles:  ${input.length / 9}`);
  console.log(`output triangles: ${result.triangles}`);
  console.log(`cells:            ${result.cells}`);
  console.log(`output bytes:     ${bytes.length}`);
  console.log(`runtime ms:       ${Date.now() - t0}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli(process.argv);
