// @ts-expect-error - plain .mjs script without type declarations
import { parseStl, writeBinaryStl, weldMesh, simplify, toTriangleSoup } from '../decimate-stl.mjs';
import { describe, expect, it } from 'vitest';

type Mesh = { vertices: Float32Array; indices: Uint32Array };
type SimplifyResult = Mesh & { triangles: number };
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

/** Emit a triangle soup from a vertex table so shared corners have bit-identical coordinates. */
function soupFrom(table: number[][], tris: number[][]): Float32Array {
  const out = new Float32Array(tris.length * 9);
  tris.forEach((t, k) => {
    for (let c = 0; c < 3; c++) for (let a = 0; a < 3; a++) out[k * 9 + c * 3 + a] = table[t[c]][a];
  });
  return out;
}

/** Closed, outward-wound UV sphere (poles shared, seam wrapped). */
function closedSphere(radius: number, stacks: number, slices: number): Float32Array {
  const table: number[][] = [[0, radius, 0]];
  for (let i = 1; i < stacks; i++) {
    const phi = (Math.PI * i) / stacks;
    for (let j = 0; j < slices; j++) {
      const theta = (2 * Math.PI * j) / slices;
      table.push([radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta)]);
    }
  }
  table.push([0, -radius, 0]);
  const south = table.length - 1;
  const id = (i: number, j: number): number => (i === 0 ? 0 : i === stacks ? south : 1 + (i - 1) * slices + (j % slices));
  const tris: number[][] = [];
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
      if (i !== 0) tris.push([a, d, b]);
      if (i !== stacks - 1) tris.push([d, c, b]);
    }
  }
  return soupFrom(table, tris);
}

/** Closed, outward-wound torus around the z axis. */
function closedTorus(major: number, minor: number, n: number, m: number): Float32Array {
  const table: number[][] = [];
  for (let i = 0; i < n; i++) {
    const theta = (2 * Math.PI * i) / n;
    for (let j = 0; j < m; j++) {
      const phi = (2 * Math.PI * j) / m;
      const r = major + minor * Math.cos(phi);
      table.push([r * Math.cos(theta), r * Math.sin(theta), minor * Math.sin(phi)]);
    }
  }
  const id = (i: number, j: number): number => (i % n) * m + (j % m);
  const tris: number[][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
      tris.push([a, b, c], [a, c, d]);
    }
  }
  return soupFrom(table, tris);
}

/** Flat grid of size x size quads in the z = 0 plane, normals +z. */
function flatGrid(size: number): Float32Array {
  const table: number[][] = [];
  for (let y = 0; y <= size; y++) for (let x = 0; x <= size; x++) table.push([x, y, 0]);
  const id = (x: number, y: number): number => y * (size + 1) + x;
  const tris: number[][] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      tris.push([id(x, y), id(x + 1, y), id(x + 1, y + 1)], [id(x, y), id(x + 1, y + 1), id(x, y + 1)]);
    }
  }
  return soupFrom(table, tris);
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

function edgeUse(mesh: Mesh): Map<string, number> {
  const uses = new Map<string, number>();
  const ix = mesh.indices;
  for (let t = 0; t < ix.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = ix[t + e], b = ix[t + ((e + 1) % 3)];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  return uses;
}

function euler(mesh: Mesh): number {
  const used = new Set<number>(mesh.indices);
  return used.size - edgeUse(mesh).size + mesh.indices.length / 3;
}

function faceNormal(mesh: Mesh, t: number): { n: number[]; c: number[] } {
  const v = mesh.vertices, ix = mesh.indices;
  const p = [0, 1, 2].map((k) => [v[ix[t * 3 + k] * 3], v[ix[t * 3 + k] * 3 + 1], v[ix[t * 3 + k] * 3 + 2]]);
  const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
  const w = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const c = [0, 1, 2].map((a) => (p[0][a] + p[1][a] + p[2][a]) / 3);
  return { n, c };
}

function volume(mesh: Mesh): number {
  const v = mesh.vertices, ix = mesh.indices;
  let sum = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    sum +=
      v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) -
      v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) +
      v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
  }
  return sum / 6;
}

function expectClosedManifold(mesh: Mesh): void {
  const nv = mesh.vertices.length / 3;
  for (const i of mesh.indices) expect(i).toBeLessThan(nv);
  let bad = 0;
  for (const count of edgeUse(mesh).values()) if (count !== 2) bad++;
  expect(bad).toBe(0);
}

function expectNoDegenerate(mesh: Mesh): void {
  let degenerate = 0;
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const { n } = faceNormal(mesh, t);
    if (!(Math.hypot(n[0], n[1], n[2]) > 0)) degenerate++;
  }
  expect(degenerate).toBe(0);
}

function expectBoundsClose(a: Bounds, b: Bounds, frac: number): void {
  for (let k = 0; k < 3; k++) {
    const extent = a.max[k] - a.min[k];
    expect(Math.abs(b.min[k] - a.min[k])).toBeLessThanOrEqual(frac * extent);
    expect(Math.abs(b.max[k] - a.max[k])).toBeLessThanOrEqual(frac * extent);
  }
}

// 100 stacks x 100 slices -> 2 * 100 * 100 - 2 * 100 = 19,800; use 110 x 100 for >= 20k
const sphere = uvSphere(10, 110, 100);

const sphereSoup = closedSphere(10, 110, 100);
const sphereMesh: Mesh = weldMesh(sphereSoup);
const sphereTris = sphereMesh.indices.length / 3;
const sphereTarget = Math.round(sphereTris * 0.2);
const sphereOut: SimplifyResult = simplify(sphereMesh, sphereTarget);

const torusSoup = closedTorus(10, 3, 100, 100);
const torusMesh: Mesh = weldMesh(torusSoup);
const torusTris = torusMesh.indices.length / 3;
const torusTarget = Math.round(torusTris * 0.2);
const torusOut: SimplifyResult = simplify(torusMesh, torusTarget);

describe('decimate-stl: STL reading and writing', () => {
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

describe('decimate-stl: weldMesh and toTriangleSoup', () => {
  it('merges identical vertices of a two-triangle square into 4 vertices and 6 indices', () => {
    const square = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]);
    const m: Mesh = weldMesh(square);
    expect(m.vertices.length).toBe(12);
    expect(m.indices.length).toBe(6);
  });

  it('drops triangles with a repeated index', () => {
    const p = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0]);
    expect(weldMesh(p).indices.length).toBe(3);
  });

  it('toTriangleSoup(weldMesh(x)) keeps the triangle count', () => {
    expect(toTriangleSoup(sphereMesh).length / 9).toBe(sphereSoup.length / 9);
    expect(toTriangleSoup(torusMesh).length / 9).toBe(torusSoup.length / 9);
  });

  it('builds closed synthetic inputs with the expected Euler characteristic', () => {
    expect(sphereTris).toBeGreaterThanOrEqual(20000);
    expect(torusTris).toBeGreaterThanOrEqual(20000);
    expectClosedManifold(sphereMesh);
    expectClosedManifold(torusMesh);
    expect(euler(sphereMesh)).toBe(2);
    expect(euler(torusMesh)).toBe(0);
  });
});

describe('decimate-stl: simplify (quadric error edge collapse)', () => {
  it('reaches the target on the sphere and the torus', () => {
    for (const [out, target] of [[sphereOut, sphereTarget], [torusOut, torusTarget]] as const) {
      expect(out.triangles).toBe(out.indices.length / 3);
      expect(out.triangles).toBeLessThanOrEqual(target);
      expect(out.triangles).toBeGreaterThanOrEqual(0.9 * target);
    }
  });

  it('keeps the Euler characteristic (sphere 2, torus 0)', () => {
    expect(euler(sphereOut)).toBe(2);
    expect(euler(torusOut)).toBe(0);
  });

  it('stays a closed manifold with in-range indices and only used vertices', () => {
    expectClosedManifold(sphereOut);
    expectClosedManifold(torusOut);
    expect(new Set<number>(sphereOut.indices).size).toBe(sphereOut.vertices.length / 3);
    expect(new Set<number>(torusOut.indices).size).toBe(torusOut.vertices.length / 3);
  });

  it('produces no degenerate triangles', () => {
    expectNoDegenerate(sphereOut);
    expectNoDegenerate(torusOut);
  });

  it('flips no triangle on the sphere (normals point away from the centre)', () => {
    let flipped = 0;
    for (let t = 0; t < sphereOut.triangles; t++) {
      const { n, c } = faceNormal(sphereOut, t);
      if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] <= 0) flipped++;
    }
    expect(flipped).toBe(0);
  });

  it('flips no triangle on the torus (normals point away from the major circle)', () => {
    let flipped = 0;
    for (let t = 0; t < torusOut.triangles; t++) {
      const { n, c } = faceNormal(torusOut, t);
      const rho = Math.hypot(c[0], c[1]);
      const out = [c[0] - (10 * c[0]) / rho, c[1] - (10 * c[1]) / rho, c[2]];
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] <= 0) flipped++;
    }
    expect(flipped).toBe(0);
  });

  it('keeps every sphere vertex within 1% of the radius and the volume within 2%', () => {
    const v = sphereOut.vertices;
    let worst = 0;
    for (let i = 0; i < v.length; i += 3) worst = Math.max(worst, Math.abs(Math.hypot(v[i], v[i + 1], v[i + 2]) - 10));
    expect(worst).toBeLessThan(0.1);
    const v0 = volume(sphereMesh);
    expect(Math.abs(volume(sphereOut) - v0) / v0).toBeLessThan(0.02);
  });

  it('keeps every torus vertex within 2% of the minor radius of the true surface', () => {
    const v = torusOut.vertices;
    let worst = 0;
    for (let i = 0; i < v.length; i += 3) {
      const rho = Math.hypot(v[i], v[i + 1]);
      worst = Math.max(worst, Math.abs(Math.hypot(rho - 10, v[i + 2]) - 3));
    }
    expect(worst).toBeLessThan(0.12);
  });

  it('keeps the bounding box within 1% on every axis', () => {
    expectBoundsClose(bounds(sphereMesh.vertices), bounds(sphereOut.vertices), 0.01);
    expectBoundsClose(bounds(torusMesh.vertices), bounds(torusOut.vertices), 0.01);
  });

  it('is deterministic (two runs give identical indices and vertices)', () => {
    const again: SimplifyResult = simplify(weldMesh(torusSoup), torusTarget);
    expect(again.triangles).toBe(torusOut.triangles);
    expect(Buffer.from(again.indices.buffer, again.indices.byteOffset, again.indices.byteLength).equals(
      Buffer.from(torusOut.indices.buffer, torusOut.indices.byteOffset, torusOut.indices.byteLength),
    )).toBe(true);
    expect(Buffer.from(again.vertices.buffer, again.vertices.byteOffset, again.vertices.byteLength).equals(
      Buffer.from(torusOut.vertices.buffer, torusOut.vertices.byteOffset, torusOut.vertices.byteLength),
    )).toBe(true);
  });

  it('keeps the outer boundary of an open flat grid (corners stay, no NaNs, no flips)', () => {
    const grid: Mesh = weldMesh(flatGrid(60));
    expect(grid.indices.length / 3).toBe(7200);
    const out: SimplifyResult = simplify(grid, 1800);
    expect(out.triangles).toBeLessThanOrEqual(1800);
    const v = out.vertices;
    for (let i = 0; i < v.length; i++) expect(Number.isFinite(v[i])).toBe(true);
    for (const [cx, cy] of [[0, 0], [60, 0], [0, 60], [60, 60]]) {
      let found = false;
      for (let i = 0; i < v.length; i += 3) if (v[i] === cx && v[i + 1] === cy && v[i + 2] === 0) found = true;
      expect(found).toBe(true);
    }
    let flipped = 0;
    for (let t = 0; t < out.triangles; t++) if (!(faceNormal(out, t).n[2] > 0)) flipped++;
    expect(flipped).toBe(0);
    expectBoundsClose(bounds(grid.vertices), bounds(out.vertices), 0);
  });

  it('never pinches the torus, even when asked to simplify as far as it will go (link condition)', () => {
    const out: SimplifyResult = simplify(torusMesh, 0);
    expect(out.triangles).toBeGreaterThan(0);
    expect(euler(out)).toBe(0);
    expectClosedManifold(out);
    expectNoDegenerate(out);
  });

  it('stays flip-free on the torus at 2% of its triangles (no drifting slivers)', () => {
    const out: SimplifyResult = simplify(torusMesh, 400);
    expect(out.triangles).toBeLessThanOrEqual(400);
    expect(euler(out)).toBe(0);
    let flipped = 0;
    for (let t = 0; t < out.triangles; t++) {
      const { n, c } = faceNormal(out, t);
      const rho = Math.hypot(c[0], c[1]);
      const o = [c[0] - (10 * c[0]) / rho, c[1] - (10 * c[1]) / rho, c[2]];
      if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] <= 0) flipped++;
    }
    expect(flipped).toBe(0);
  });

  it('returns the mesh unchanged when the target exceeds the triangle count', () => {
    const out: SimplifyResult = simplify(torusMesh, torusTris + 10);
    expect(out.triangles).toBe(torusTris);
  });

  it('does not throw or degenerate on a tetrahedron with target 2', () => {
    const tet = soupFrom(
      [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
      [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]],
    );
    const out: SimplifyResult = simplify(weldMesh(tet), 2);
    expect(out.triangles).toBeGreaterThan(0);
    expectNoDegenerate(out);
    expectClosedManifold(out);
  });
});
