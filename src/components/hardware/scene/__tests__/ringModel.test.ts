// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyRingFinish, buildRingGeometry, loadRing } from '../ringModel';
import { FINISH_SPECS } from '../finishes';

/** A binary STL of an axis-aligned box (12 triangles), sized sx × sy × sz and offset away from the origin. */
function boxStl(sx: number, sy: number, sz: number, offset: [number, number, number] = [10, -4, 25]): ArrayBuffer {
  const box = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  box.translate(...offset);
  const pos = box.getAttribute('position');
  const tris = pos.count / 3;
  const buf = new ArrayBuffer(84 + tris * 50);
  const view = new DataView(buf);
  view.setUint32(80, tris, true);
  for (let t = 0; t < tris; t++) {
    const o = 84 + t * 50;
    // Normal left as zero (loaders recompute); three vertices follow.
    for (let v = 0; v < 3; v++) {
      const i = t * 3 + v;
      view.setFloat32(o + 12 + v * 12, pos.getX(i), true);
      view.setFloat32(o + 16 + v * 12, pos.getY(i), true);
      view.setFloat32(o + 20 + v * 12, pos.getZ(i), true);
    }
  }
  box.dispose();
  return buf;
}

const fetchReturning = (res: Partial<Response>) =>
  vi.stubGlobal('fetch', vi.fn(async () => res as Response));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buildRingGeometry', () => {
  it('merges vertices, smooths normals, centres at the origin and scales the longest side to 1', () => {
    const geo = buildRingGeometry(boxStl(2, 4, 6));
    expect(geo.getAttribute('normal')).toBeTruthy();
    // 12 triangles = 36 corners unmerged; a welded box has 8 corners.
    expect(geo.getAttribute('position').count).toBeLessThan(36);
    expect(geo.getAttribute('position').count).toBe(8);
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    expect(centre.length()).toBeLessThan(1e-6);
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(1, 6);
    // Proportions kept (2 : 4 : 6).
    expect(size.x).toBeCloseTo(1 / 3, 5);
    expect(size.y).toBeCloseTo(2 / 3, 5);
    // Smooth (shared) normals are unit length.
    const n = geo.getAttribute('normal');
    for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
  });

  it('throws on bytes that hold no triangles', () => {
    const empty = new ArrayBuffer(84);
    expect(() => buildRingGeometry(empty)).toThrow(/no triangles/i);
  });
});

describe('loadRing', () => {
  it('fetches the STL and returns a dark metal Mesh', async () => {
    const bytes = boxStl(3, 1, 3);
    fetchReturning({ ok: true, status: 200, arrayBuffer: async () => bytes });
    const mesh = await loadRing('/models/r3-ring.stl');
    expect(fetch).toHaveBeenCalledWith('/models/r3-ring.stl');
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    const mat = mesh.material as THREE.MeshPhysicalMaterial;
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(mat.metalness).toBeGreaterThan(0.5);
    expect(mat.roughness).toBeGreaterThan(0.2);
    expect(mat.roughness).toBeLessThan(0.5);
    expect(mat.clearcoat).toBeGreaterThan(0.2);
    expect(mat.color.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.2);
    expect(mesh.geometry.getAttribute('normal')).toBeTruthy();
  });

  it('rejects with the status when the response is not ok', async () => {
    fetchReturning({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    await expect(loadRing('/missing.stl')).rejects.toThrow(/404/);
  });

  it('rejects with the status when the body is empty', async () => {
    fetchReturning({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) });
    await expect(loadRing('/empty.stl')).rejects.toThrow(/empty.*200|200.*empty/i);
  });
});

describe('ring finishes', () => {
  it('loads black by default (today\'s values) and in a given finish; applyRingFinish re-colours in place', async () => {
    const bytes = boxStl(3, 1, 3);
    fetchReturning({ ok: true, status: 200, arrayBuffer: async () => bytes });
    const black = (await loadRing('/r.stl')).material as THREE.MeshPhysicalMaterial;
    expect(black.color.getHex()).toBe(0x1b1c1a);
    expect([black.metalness, black.roughness]).toEqual([0.9, 0.35]);
    const mesh = await loadRing('/r.stl', 'white');
    const mat = mesh.material as THREE.MeshPhysicalMaterial;
    expect(mat.color.getHexString()).toBe(FINISH_SPECS.white.ring.color.slice(1));
    const geo = mesh.geometry;
    applyRingFinish(mesh, 'silver');
    expect(mesh.material).toBe(mat);
    expect(mesh.geometry).toBe(geo);
    expect(mat.color.getHexString()).toBe('c9ced0');
    expect(mat.metalness).toBe(1);
    expect(mat.roughness).toBe(FINISH_SPECS.silver.ring.roughness);
  });
});
