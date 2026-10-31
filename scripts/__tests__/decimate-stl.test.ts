// @ts-expect-error - plain .mjs script without type declarations
import { parseStl, decimate, writeBinaryStl, decimateToTarget } from '../decimate-stl.mjs';
import { describe, expect, it } from 'vitest';

type Bounds = { min: number[]; max: number[] };

function uvSphere(radius: number, stacks: number, slices: number): Float32Array {
  const pt = (i: number, j: number): number[] => {
    const phi = (Math.PI * i) / stacks;
    const theta = (2 * Math.PI * j) / slices;
    return [
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    ];
  };
  const out: number[] = [];
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = pt(i, j);
      const b = pt(i + 1, j);
      const c = pt(i + 1, j + 1);
      const d = pt(i, j + 1);
      if (i !== 0) out.push(...a, ...b, ...d);
      if (i !== stacks - 1) out.push(...d, ...b, ...c);
    }
  }
  return new Float32Array(out);
}

function bounds(p: Float32Array): Bounds {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
  }
  return { min, max };
}

// 100 stacks x 100 slices -> 2 * 100 * 100 - 2 * 100 = 19,800; use 110 x 100 for >= 20k
const sphere = uvSphere(10, 110, 100);

describe('decimate-stl', () => {
  it('builds a dense synthetic sphere', () => {
    expect(sphere.length / 9).toBeGreaterThanOrEqual(20000);
  });

  it('round-trips a single triangle through binary STL', () => {
    const tri = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const bytes = writeBinaryStl(tri);
    expect(bytes.length).toBe(84 + 50);
    const back = parseStl(bytes);
    expect(back.length).toBe(9);
    for (let i = 0; i < 9; i++) expect(back[i]).toBeCloseTo(tri[i], 6);
  });

  it('writes a computed unit face normal', () => {
    const bytes = writeBinaryStl(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(dv.getFloat32(84, true)).toBeCloseTo(0, 6);
    expect(dv.getFloat32(88, true)).toBeCloseTo(0, 6);
    expect(dv.getFloat32(92, true)).toBeCloseTo(1, 6);
  });

  it('round-trips the sphere and sizes the file as 84 + 50 * triangles', () => {
    const n = sphere.length / 9;
    const bytes = writeBinaryStl(sphere);
    expect(bytes.length).toBe(84 + 50 * n);
    const back = parseStl(bytes);
    expect(back.length / 9).toBe(n);
    for (let i = 0; i < sphere.length; i++) expect(Math.abs(back[i] - sphere[i])).toBeLessThan(1e-5);
  });

  it('decimate(sphere, 24) keeps far fewer, non-degenerate triangles within one cell of the bounds', () => {
    const n = sphere.length / 9;
    const cells = 24;
    const r = decimate(sphere, cells);
    expect(r.triangles).toBeGreaterThan(0);
    expect(r.triangles).toBeLessThan(n / 4);
    expect(r.positions.length).toBe(r.triangles * 9);
    const p = r.positions;
    for (let t = 0; t < r.triangles; t++) {
      const o = t * 9;
      const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
      const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      expect(Math.hypot(cx, cy, cz)).toBeGreaterThan(0);
    }
    const cell = 20 / cells;
    const bi = bounds(sphere);
    const bo = bounds(p);
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(bo.min[k] - bi.min[k])).toBeLessThanOrEqual(cell);
      expect(Math.abs(bo.max[k] - bi.max[k])).toBeLessThanOrEqual(cell);
    }
  });

  it('drops degenerate triangles', () => {
    // One real triangle plus one with two coincident vertices.
    const p = new Float32Array([
      0, 0, 0, 10, 0, 0, 0, 10, 0,
      0, 0, 0, 0.001, 0, 0, 10, 10, 0,
    ]);
    const r = decimate(p, 2);
    expect(r.triangles).toBe(1);
  });

  it('decimateToTarget(sphere, 3000) lands in [1500, 3000]', () => {
    const r = decimateToTarget(sphere, 3000);
    expect(r.triangles).toBeLessThanOrEqual(3000);
    expect(r.triangles).toBeGreaterThanOrEqual(1500);
    expect(r.positions.length).toBe(r.triangles * 9);
    expect(r.cells).toBeGreaterThan(0);
  });

  it('parses a 2-triangle ASCII STL to 18 floats', () => {
    const ascii = `solid test
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 1 0 0
      vertex 1 1 0
      vertex 0 1 0
    endloop
  endfacet
endsolid test
`;
    const f = parseStl(new TextEncoder().encode(ascii));
    expect(f.length).toBe(18);
    expect(f[3]).toBe(1);
    expect(f[16]).toBe(1);
  });

  it('throws clear errors on garbage input', () => {
    expect(() => parseStl(new Uint8Array(10))).toThrow(/STL/);
    const bad = new Uint8Array(84 + 50);
    new DataView(bad.buffer).setUint32(80, 5, true); // claims 5 triangles, has 1
    expect(() => parseStl(bad)).toThrow(/STL/);
  });
});
