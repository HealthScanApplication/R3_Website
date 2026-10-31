#!/usr/bin/env node
// Dependency-free STL simplifier. Pure Node, ESM, typed arrays only.
//
// Usage: node scripts/decimate-stl.mjs <input.stl> <output.stl> [--max-triangles 50000]
//
// Pipeline: parseStl -> weldMesh -> simplify (Garland-Heckbert quadric error
// metrics, iterative edge collapse) -> toTriangleSoup -> writeBinaryStl.
// Triangle soups are Float32Arrays with 9 floats per triangle (three xyz vertices).

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
 * Weld corners with bit-identical float32 coordinates (-0 is treated as +0) into an
 * indexed mesh. Triangles that end up with a repeated index are dropped.
 */
export function weldMesh(positions) {
  const nt = Math.floor(positions.length / 9);
  const corners = nt * 3;
  let cap = 16;
  while (cap < corners * 2) cap *= 2;
  const mask = cap - 1;
  const table = new Int32Array(cap).fill(-1);
  const verts = new Float32Array(corners * 3);
  const bits = new Uint32Array(verts.buffer);
  const scratch = new Float32Array(3);
  const sbits = new Uint32Array(scratch.buffer);
  const cornerId = new Uint32Array(corners);
  let nv = 0;
  for (let c = 0; c < corners; c++) {
    scratch[0] = positions[c * 3] + 0; // + 0 turns -0 into +0
    scratch[1] = positions[c * 3 + 1] + 0;
    scratch[2] = positions[c * 3 + 2] + 0;
    const x = sbits[0], y = sbits[1], z = sbits[2];
    let h = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d)) >>> 0;
    h = (h ^ (h >>> 15)) & mask;
    for (;;) {
      const id = table[h];
      if (id < 0) {
        table[h] = nv;
        bits[nv * 3] = x; bits[nv * 3 + 1] = y; bits[nv * 3 + 2] = z;
        cornerId[c] = nv++;
        break;
      }
      if (bits[id * 3] === x && bits[id * 3 + 1] === y && bits[id * 3 + 2] === z) {
        cornerId[c] = id;
        break;
      }
      h = (h + 1) & mask;
    }
  }
  const indices = new Uint32Array(corners);
  let k = 0;
  for (let t = 0; t < nt; t++) {
    const a = cornerId[t * 3], b = cornerId[t * 3 + 1], c = cornerId[t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    indices[k++] = a; indices[k++] = b; indices[k++] = c;
  }
  return { vertices: verts.slice(0, nv * 3), indices: indices.slice(0, k) };
}

/** Indexed mesh back to a triangle soup (9 floats per triangle). */
export function toTriangleSoup(mesh) {
  const { vertices, indices } = mesh;
  const out = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i] * 3;
    out[i * 3] = vertices[v];
    out[i * 3 + 1] = vertices[v + 1];
    out[i * 3 + 2] = vertices[v + 2];
  }
  return out;
}

/** V - E + F of an indexed mesh (V counts referenced vertices only). */
function eulerCharacteristic(mesh) {
  const { indices } = mesh;
  const nv = mesh.vertices.length / 3;
  const used = new Uint8Array(nv);
  let v = 0;
  for (let i = 0; i < indices.length; i++) if (!used[indices[i]]) { used[indices[i]] = 1; v++; }
  const keys = new Float64Array(indices.length);
  for (let t = 0; t < indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t + e], b = indices[t + (e === 2 ? 0 : e + 1)];
      keys[t + e] = a < b ? a * nv + b : b * nv + a;
    }
  }
  keys.sort();
  let edges = 0;
  for (let i = 0; i < keys.length; i++) if (i === 0 || keys[i] !== keys[i - 1]) edges++;
  return v - edges + indices.length / 3;
}

const BOUNDARY = 1;
const LOCKED = 2;
const BOUNDARY_WEIGHT = 1000; // penalty plane weight, times the boundary edge length squared
const MIN_NORMAL_DOT = 0.2; // reject a collapse that turns a face by more than ~78 degrees
const MIN_AREA_FRACTION = 1e-12; // of scale^2
const MIN_QUALITY = 0.05; // 4*sqrt(3)*area / sum of squared edges: 1 = equilateral
const SQRT3 = Math.sqrt(3);

/**
 * Garland-Heckbert quadric error simplification by iterative edge collapse, until
 * the triangle count is <= targetTriangles or no valid collapse remains.
 * Returns a compacted indexed mesh (only referenced vertices) plus its triangle count.
 */
export function simplify(mesh, targetTriangles) {
  const nv = mesh.vertices.length / 3;
  const nt = mesh.indices.length / 3;
  const pos = Float64Array.from(mesh.vertices);
  const tri = Int32Array.from(mesh.indices);
  const triDead = new Uint8Array(nt);
  const vDead = new Uint8Array(nv);
  const vFlags = new Uint8Array(nv);
  const ver = new Int32Array(nv);
  let live = nt;

  // Scale for the degenerate-area threshold.
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < nv; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const scale = nv > 0 ? Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1 : 1;
  const minCross = 2 * MIN_AREA_FRACTION * scale * scale; // |cross| = 2 * area

  // 1. Quadrics: area-weighted fundamental quadrics, 10 floats per vertex.
  const Q = new Float64Array(nv * 10);
  const addPlane = (v, a, b, c, d, w) => {
    const o = v * 10;
    Q[o] += w * a * a; Q[o + 1] += w * a * b; Q[o + 2] += w * a * c; Q[o + 3] += w * a * d;
    Q[o + 4] += w * b * b; Q[o + 5] += w * b * c; Q[o + 6] += w * b * d;
    Q[o + 7] += w * c * c; Q[o + 8] += w * c * d;
    Q[o + 9] += w * d * d;
  };
  for (let t = 0; t < nt; t++) {
    const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (!(len > 0)) continue;
    nx /= len; ny /= len; nz /= len;
    const d = -(nx * pos[a] + ny * pos[a + 1] + nz * pos[a + 2]);
    const area = len / 2;
    for (let k = 0; k < 3; k++) addPlane(tri[t * 3 + k], nx, ny, nz, d, area);
  }

  // Vertex -> triangle lists (CSR, appended to when a survivor gets a new list).
  const vStart = new Int32Array(nv);
  const vCount = new Int32Array(nv);
  for (let i = 0; i < nt * 3; i++) vCount[tri[i]]++;
  let refsLen = 0;
  for (let v = 0; v < nv; v++) { vStart[v] = refsLen; refsLen += vCount[v]; }
  let refs = new Int32Array(Math.max(16, refsLen * 2));
  {
    const fill = new Int32Array(nv);
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) {
        const v = tri[t * 3 + k];
        refs[vStart[v] + fill[v]++] = t;
      }
    }
  }
  const ensureRefs = (extra) => {
    if (refsLen + extra <= refs.length) return;
    let cap = refs.length * 2;
    while (cap < refsLen + extra) cap *= 2;
    const next = new Int32Array(cap);
    next.set(refs.subarray(0, refsLen));
    refs = next;
  };

  // Unique edges, boundary edges (used once) and non-manifold edges (used > 2 times).
  const keys = new Float64Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    for (let e = 0; e < 3; e++) {
      const a = tri[t * 3 + e], b = tri[t * 3 + (e === 2 ? 0 : e + 1)];
      keys[t * 3 + e] = a < b ? a * nv + b : b * nv + a;
    }
  }
  keys.sort();
  const boundaryKeys = new Set();
  let edgeCount = 0;
  for (let i = 0; i < keys.length;) {
    let j = i + 1;
    while (j < keys.length && keys[j] === keys[i]) j++;
    const a = Math.floor(keys[i] / nv), b = keys[i] - a * nv;
    if (j - i === 1) { boundaryKeys.add(keys[i]); vFlags[a] |= BOUNDARY; vFlags[b] |= BOUNDARY; }
    else if (j - i > 2) { vFlags[a] |= LOCKED; vFlags[b] |= LOCKED; }
    keys[edgeCount++] = keys[i];
    i = j;
  }

  // 4. Boundary penalty quadrics: plane through the edge, perpendicular to its triangle.
  if (boundaryKeys.size > 0) {
    for (let t = 0; t < nt; t++) {
      const i0 = tri[t * 3] * 3, i1 = tri[t * 3 + 1] * 3, i2 = tri[t * 3 + 2] * 3;
      const ux = pos[i1] - pos[i0], uy = pos[i1 + 1] - pos[i0 + 1], uz = pos[i1 + 2] - pos[i0 + 2];
      const vx = pos[i2] - pos[i0], vy = pos[i2 + 1] - pos[i0 + 1], vz = pos[i2 + 2] - pos[i0 + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nlen = Math.hypot(nx, ny, nz);
      if (!(nlen > 0)) continue;
      nx /= nlen; ny /= nlen; nz /= nlen;
      for (let e = 0; e < 3; e++) {
        const a = tri[t * 3 + e], b = tri[t * 3 + (e === 2 ? 0 : e + 1)];
        if (!boundaryKeys.has(a < b ? a * nv + b : b * nv + a)) continue;
        const ex = pos[b * 3] - pos[a * 3], ey = pos[b * 3 + 1] - pos[a * 3 + 1], ez = pos[b * 3 + 2] - pos[a * 3 + 2];
        let mx = ey * nz - ez * ny, my = ez * nx - ex * nz, mz = ex * ny - ey * nx;
        const mlen = Math.hypot(mx, my, mz);
        if (!(mlen > 0)) continue;
        mx /= mlen; my /= mlen; mz /= mlen;
        const d = -(mx * pos[a * 3] + my * pos[a * 3 + 1] + mz * pos[a * 3 + 2]);
        const w = BOUNDARY_WEIGHT * (ex * ex + ey * ey + ez * ez);
        addPlane(a, mx, my, mz, d, w);
        addPlane(b, mx, my, mz, d, w);
      }
    }
  }

  // 2. Collapse cost and optimal position for an edge; result in px, py, pz.
  let px = 0, py = 0, pz = 0;
  const S = new Float64Array(10);
  const evalS = (x, y, z) =>
    S[0] * x * x + 2 * S[1] * x * y + 2 * S[2] * x * z + 2 * S[3] * x +
    S[4] * y * y + 2 * S[5] * y * z + 2 * S[6] * y +
    S[7] * z * z + 2 * S[8] * z + S[9];
  const collapseCost = (a, b) => {
    const oa = a * 10, ob = b * 10;
    for (let k = 0; k < 10; k++) S[k] = Q[oa + k] + Q[ob + k];
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
    const elen = Math.hypot(bx - ax, by - ay, bz - az);
    const c00 = S[4] * S[7] - S[5] * S[5];
    const c01 = S[2] * S[5] - S[1] * S[7];
    const c02 = S[1] * S[5] - S[2] * S[4];
    const det = S[0] * c00 + S[1] * c01 + S[2] * c02;
    const tr = S[0] + S[4] + S[7];
    if (tr > 0 && Math.abs(det) > 1e-12 * tr * tr * tr) {
      const c11 = S[0] * S[7] - S[2] * S[2];
      const c12 = S[1] * S[2] - S[0] * S[5];
      const c22 = S[0] * S[4] - S[1] * S[1];
      const r0 = -S[3], r1 = -S[6], r2 = -S[8];
      const x = Math.fround((c00 * r0 + c01 * r1 + c02 * r2) / det);
      const y = Math.fround((c01 * r0 + c11 * r1 + c12 * r2) / det);
      const z = Math.fround((c02 * r0 + c12 * r1 + c22 * r2) / det);
      // Accept the solve only when it stays near the edge (an ill-conditioned
      // system on near-flat or cylindrical patches can throw it far away).
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) &&
          Math.hypot(x - mx, y - my, z - mz) <= elen) {
        px = x; py = y; pz = z;
        return Math.max(0, evalS(x, y, z));
      }
    }
    // Near-singular: best of midpoint, a, b (midpoint wins ties).
    const fmx = Math.fround(mx), fmy = Math.fround(my), fmz = Math.fround(mz);
    let best = evalS(fmx, fmy, fmz);
    px = fmx; py = fmy; pz = fmz;
    const ca = evalS(ax, ay, az);
    if (ca < best) { best = ca; px = ax; py = ay; pz = az; }
    const cb = evalS(bx, by, bz);
    if (cb < best) { best = cb; px = bx; py = by; pz = bz; }
    return Math.max(0, best);
  };

  // Binary min-heap of edge candidates in parallel typed arrays, lazily invalidated
  // by per-vertex version counters.
  let hCap = Math.max(16, edgeCount + 1024);
  let hCost = new Float64Array(hCap), hA = new Int32Array(hCap), hB = new Int32Array(hCap);
  let hVa = new Int32Array(hCap), hVb = new Int32Array(hCap);
  let hN = 0;
  const hGrow = () => {
    hCap *= 2;
    const grow = (arr, Ctor) => { const n = new Ctor(hCap); n.set(arr); return n; };
    hCost = grow(hCost, Float64Array); hA = grow(hA, Int32Array); hB = grow(hB, Int32Array);
    hVa = grow(hVa, Int32Array); hVb = grow(hVb, Int32Array);
  };
  const hSet = (i, cost, a, b, va, vb) => { hCost[i] = cost; hA[i] = a; hB[i] = b; hVa[i] = va; hVb[i] = vb; };
  const hMove = (to, from) => { hCost[to] = hCost[from]; hA[to] = hA[from]; hB[to] = hB[from]; hVa[to] = hVa[from]; hVb[to] = hVb[from]; };
  const siftDown = (start, cost, a, b, va, vb) => {
    let i = start;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= hN) break;
      if (child + 1 < hN && hCost[child + 1] < hCost[child]) child++;
      if (hCost[child] >= cost) break;
      hMove(i, child);
      i = child;
    }
    hSet(i, cost, a, b, va, vb);
  };
  const hPush = (cost, a, b) => {
    if (hN === hCap) hGrow();
    let i = hN++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hCost[p] <= cost) break;
      hMove(i, p);
      i = p;
    }
    hSet(i, cost, a, b, ver[a], ver[b]);
  };

  // Initial candidates: fill then heapify (O(E)).
  for (let i = 0; i < edgeCount; i++) {
    const a = Math.floor(keys[i] / nv), b = keys[i] - a * nv;
    hSet(i, collapseCost(a, b), a, b, 0, 0);
  }
  hN = edgeCount;
  for (let i = (hN >> 1) - 1; i >= 0; i--) siftDown(i, hCost[i], hA[i], hB[i], hVa[i], hVb[i]);

  // Scratch for neighbourhood queries.
  const markA = new Int32Array(nv);
  const markB = new Int32Array(nv);
  let stamp = 0;

  const liveTriCount = (v) => {
    let n = 0;
    const s = vStart[v], e = s + vCount[v];
    for (let i = s; i < e; i++) if (!triDead[refs[i]]) n++;
    return n;
  };

  // Moving vertex `v` to (px,py,pz): no triangle around it (excluding those that also
  // contain `other`, which disappear) may flip or become degenerate.
  const facesStayValid = (v, other) => {
    const s = vStart[v], e = s + vCount[v];
    for (let i = s; i < e; i++) {
      const t = refs[i];
      if (triDead[t]) continue;
      const t0 = tri[t * 3], t1 = tri[t * 3 + 1], t2 = tri[t * 3 + 2];
      if (t0 === other || t1 === other || t2 === other) continue;
      // Rotate so the moving vertex is first.
      let p1, p2;
      if (t0 === v) { p1 = t1; p2 = t2; } else if (t1 === v) { p1 = t2; p2 = t0; } else { p1 = t0; p2 = t1; }
      const x1 = pos[p1 * 3], y1 = pos[p1 * 3 + 1], z1 = pos[p1 * 3 + 2];
      const x2 = pos[p2 * 3], y2 = pos[p2 * 3 + 1], z2 = pos[p2 * 3 + 2];
      const ox = pos[v * 3], oy = pos[v * 3 + 1], oz = pos[v * 3 + 2];
      // old normal: (p1 - o) x (p2 - o)
      let ux = x1 - ox, uy = y1 - oy, uz = z1 - oz, wx = x2 - ox, wy = y2 - oy, wz = z2 - oz;
      const n0x = uy * wz - uz * wy, n0y = uz * wx - ux * wz, n0z = ux * wy - uy * wx;
      ux = x1 - px; uy = y1 - py; uz = z1 - pz; wx = x2 - px; wy = y2 - py; wz = z2 - pz;
      const n1x = uy * wz - uz * wy, n1y = uz * wx - ux * wz, n1z = ux * wy - uy * wx;
      const l1 = Math.hypot(n1x, n1y, n1z);
      if (!(l1 > minCross)) return false;
      const l0 = Math.hypot(n0x, n0y, n0z);
      if (l0 > 0 && n0x * n1x + n0y * n1y + n0z * n1z <= MIN_NORMAL_DOT * l0 * l1) return false;
      // Do not create a new sliver: its normal is ill-defined and drifts on later steps.
      const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
      const base = dx * dx + dy * dy + dz * dz;
      const q1 = (2 * SQRT3 * l1) / (base + ux * ux + uy * uy + uz * uz + wx * wx + wy * wy + wz * wz);
      if (q1 < MIN_QUALITY) {
        const ax = x1 - ox, ay = y1 - oy, az = z1 - oz, bx = x2 - ox, by = y2 - oy, bz = z2 - oz;
        const q0 = (2 * SQRT3 * l0) / (base + ax * ax + ay * ay + az * az + bx * bx + by * by + bz * bz);
        if (q1 < q0) return false;
      }
    }
    return true;
  };

  // 3. Validity of collapsing edge (a, b) to (px, py, pz).
  const canCollapse = (a, b) => {
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return false;
    if ((vFlags[a] | vFlags[b]) & LOCKED) return false;
    // Neighbours of a; count triangles shared with b.
    stamp++;
    let edgeTris = 0;
    let degA = 0;
    {
      const s = vStart[a], e = s + vCount[a];
      for (let i = s; i < e; i++) {
        const t = refs[i];
        if (triDead[t]) continue;
        let hasB = false;
        for (let k = 0; k < 3; k++) {
          const w = tri[t * 3 + k];
          if (w === a) continue;
          if (w === b) hasB = true;
          if (markA[w] !== stamp) { markA[w] = stamp; degA++; }
        }
        if (hasB) edgeTris++;
      }
    }
    if (edgeTris === 0) return false;
    // Link condition: common neighbours of a and b == triangles on the edge (2 closed, 1 boundary).
    let common = 0;
    let degB = 0;
    {
      const s = vStart[b], e = s + vCount[b];
      for (let i = s; i < e; i++) {
        const t = refs[i];
        if (triDead[t]) continue;
        for (let k = 0; k < 3; k++) {
          const w = tri[t * 3 + k];
          if (w === b || markB[w] === stamp) continue;
          markB[w] = stamp;
          degB++;
          if (w !== a && markA[w] === stamp) {
            common++;
            if (common > edgeTris) return false;
            // A common neighbour loses one edge: it must keep a valid fan.
            const n = liveTriCount(w);
            if (vFlags[w] & BOUNDARY ? n <= 1 : n <= 3) return false;
          }
        }
      }
    }
    if (common !== edgeTris) return false;
    // An interior edge joining two boundary vertices would pinch the surface.
    if (edgeTris === 2 && vFlags[a] & BOUNDARY && vFlags[b] & BOUNDARY) return false;
    // The survivor needs at least three neighbours.
    if (degA + degB - common - 2 < 3) return false;
    // No fold-overs and no degenerate faces.
    return facesStayValid(a, b) && facesStayValid(b, a);
  };

  const pushEdgesOf = (v) => {
    stamp++;
    const s = vStart[v], e = s + vCount[v];
    for (let i = s; i < e; i++) {
      const t = refs[i];
      for (let k = 0; k < 3; k++) {
        const w = tri[t * 3 + k];
        if (w === v || markA[w] === stamp) continue;
        markA[w] = stamp;
        const cost = collapseCost(v, w);
        hPush(cost, v, w);
      }
    }
  };

  // Survivor a takes position (px,py,pz) and Qa + Qb; b dies.
  const collapse = (a, b) => {
    pos[a * 3] = px; pos[a * 3 + 1] = py; pos[a * 3 + 2] = pz;
    for (let k = 0; k < 10; k++) Q[a * 10 + k] += Q[b * 10 + k];
    vFlags[a] |= vFlags[b] & BOUNDARY;
    vDead[b] = 1;
    ensureRefs(vCount[a] + vCount[b]);
    const start = refsLen;
    {
      const s = vStart[a], e = s + vCount[a];
      for (let i = s; i < e; i++) {
        const t = refs[i];
        if (triDead[t]) continue;
        if (tri[t * 3] === b || tri[t * 3 + 1] === b || tri[t * 3 + 2] === b) { triDead[t] = 1; live--; continue; }
        refs[refsLen++] = t;
      }
    }
    {
      const s = vStart[b], e = s + vCount[b];
      for (let i = s; i < e; i++) {
        const t = refs[i];
        if (triDead[t]) continue;
        for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === b) tri[t * 3 + k] = a;
        refs[refsLen++] = t;
      }
    }
    vStart[a] = start;
    vCount[a] = refsLen - start;
    vCount[b] = 0;
    ver[a]++;
    ver[b]++;
    pushEdgesOf(a);
  };

  const target = Math.max(0, Math.floor(targetTriangles));
  while (live > target && hN > 0) {
    const a = hA[0], b = hB[0], va = hVa[0], vb = hVb[0];
    hN--;
    if (hN > 0) siftDown(0, hCost[hN], hA[hN], hB[hN], hVa[hN], hVb[hN]);
    if (vDead[a] || vDead[b] || ver[a] !== va || ver[b] !== vb) continue; // stale
    collapseCost(a, b);
    if (!canCollapse(a, b)) continue;
    collapse(a, b);
  }

  // 7. Compaction: keep referenced vertices only, in original vertex order.
  const remap = new Int32Array(nv).fill(-1);
  for (let t = 0; t < nt; t++) {
    if (triDead[t]) continue;
    for (let k = 0; k < 3; k++) remap[tri[t * 3 + k]] = 0;
  }
  let outV = 0;
  for (let v = 0; v < nv; v++) if (remap[v] === 0) remap[v] = outV++;
  const vertices = new Float32Array(outV * 3);
  for (let v = 0; v < nv; v++) {
    const r = remap[v];
    if (r < 0) continue;
    vertices[r * 3] = pos[v * 3]; vertices[r * 3 + 1] = pos[v * 3 + 1]; vertices[r * 3 + 2] = pos[v * 3 + 2];
  }
  const indices = new Uint32Array(live * 3);
  let k = 0;
  for (let t = 0; t < nt; t++) {
    if (triDead[t]) continue;
    indices[k++] = remap[tri[t * 3]]; indices[k++] = remap[tri[t * 3 + 1]]; indices[k++] = remap[tri[t * 3 + 2]];
  }
  return { vertices, indices, triangles: live };
}

function fail(message) {
  console.error(`decimate-stl: ${message}`);
  process.exit(1);
}

function cli(argv) {
  const args = argv.slice(2);
  let max = 50000;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-triangles') max = Number(args[++i]);
    else files.push(args[i]);
  }
  if (files.length !== 2 || !Number.isFinite(max) || max < 1) {
    console.error('Usage: node scripts/decimate-stl.mjs <input.stl> <output.stl> [--max-triangles 50000]');
    process.exit(1);
  }
  const [inPath, outPath] = files.map((f) => resolve(f));
  if (!existsSync(inPath) || !statSync(inPath).isFile()) fail(`input file not found: ${files[0]}`);
  if (inPath === outPath) fail('output path must differ from the input path');
  if (!existsSync(dirname(outPath)) || !statSync(dirname(outPath)).isDirectory()) {
    fail(`output directory does not exist: ${dirname(outPath)}`);
  }
  const t0 = Date.now();
  let soup;
  try {
    soup = parseStl(new Uint8Array(readFileSync(inPath)));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  const welded = weldMesh(soup);
  const result = simplify(welded, max);
  const outSoup = toTriangleSoup(result);
  const bytes = writeBinaryStl(outSoup);
  writeFileSync(outPath, bytes);
  const outWelded = weldMesh(outSoup);
  console.log(`input triangles:         ${soup.length / 9}`);
  console.log(`input welded vertices:   ${welded.vertices.length / 3}`);
  console.log(`output triangles:        ${result.triangles}`);
  console.log(`output welded vertices:  ${outWelded.vertices.length / 3}`);
  console.log(`euler before:            ${eulerCharacteristic(welded)}`);
  console.log(`euler after:             ${eulerCharacteristic(outWelded)}`);
  console.log(`output bytes:            ${bytes.length}`);
  console.log(`runtime ms:              ${Date.now() - t0}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli(process.argv);
