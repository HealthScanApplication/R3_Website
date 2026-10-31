// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildClip } from '../clipModel';

const meshesOf = (root: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
};
const firstMaterial = (m: THREE.Mesh) =>
  (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshPhysicalMaterial;
const worldNormalZ = (m: THREE.Mesh) => {
  m.updateWorldMatrix(true, false);
  const n = new THREE.Vector3().fromBufferAttribute(m.geometry.getAttribute('normal') as THREE.BufferAttribute, 0);
  return n.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(m.matrixWorld)).normalize().z;
};
const centreZ = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o, true).getCenter(new THREE.Vector3()).z;

afterEach(() => vi.restoreAllMocks());

describe('buildClip', () => {
  it('builds a group of meshes with the screen, cord and anchor inside it', () => {
    const { group, screen } = buildClip();
    expect(group).toBeInstanceOf(THREE.Group);
    expect(meshesOf(group).length).toBeGreaterThanOrEqual(6);
    expect(screen).toBeInstanceOf(THREE.Mesh);
    let inside = false;
    group.traverse(o => { if (o === screen) inside = true; });
    expect(inside).toBe(true);
    expect(group.getObjectByName('cord')).toBeTruthy();
    expect(group.userData.anchor).toBeInstanceOf(THREE.Vector3);
  });

  it('is about one unit tall, finite, and hangs from an anchor on its vertical axis', () => {
    const { group } = buildClip();
    const box = new THREE.Box3().setFromObject(group, true);
    const size = box.getSize(new THREE.Vector3());
    for (const v of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) expect(Number.isFinite(v)).toBe(true);
    expect(size.y).toBeGreaterThan(0.8);
    expect(size.y).toBeLessThan(1.4);
    const anchor = group.userData.anchor as THREE.Vector3;
    expect(Math.abs(anchor.x)).toBeLessThan(1e-9);
    expect(Math.abs(anchor.z)).toBeLessThan(1e-9);
    // The anchor is the top corner: near the top of the body, and the cord starts there.
    expect(anchor.y).toBeGreaterThan(box.max.y - 0.1);
    const cordBox = new THREE.Box3().setFromObject(group.getObjectByName('cord')!, true);
    expect(cordBox.min.y).toBeLessThan(anchor.y);
    expect(cordBox.max.y).toBeGreaterThanOrEqual(anchor.y);
    // Hung as a diamond: roughly as wide as tall below the anchor, and symmetric about x = 0.
    expect(Math.abs(box.max.x + box.min.x)).toBeLessThan(0.08);
    expect(size.x / (anchor.y - box.min.y)).toBeGreaterThan(0.8);
    expect(size.x / (anchor.y - box.min.y)).toBeLessThan(1.2);
  });

  it('faces the crystal to +Z and the etched back to -Z', () => {
    const { group, screen } = buildClip();
    const body = group.getObjectByName('body')!;
    const back = group.getObjectByName('back') as THREE.Mesh;
    expect(centreZ(screen)).toBeGreaterThan(centreZ(body));
    expect(centreZ(back)).toBeLessThan(centreZ(body));
    expect(worldNormalZ(screen)).toBeGreaterThan(0.9);
    expect(worldNormalZ(back)).toBeLessThan(-0.9);
  });

  it('maps the octagon crystal\'s bounding square onto the whole [0,1] UV square', () => {
    const { screen } = buildClip();
    const uv = screen.geometry.getAttribute('uv');
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    expect(minU).toBeLessThan(0.02); expect(minV).toBeLessThan(0.02);
    expect(maxU).toBeGreaterThan(0.98); expect(maxV).toBeGreaterThan(0.98);
    // Upright: u follows world x and v follows world y across the face.
    const pos = screen.geometry.getAttribute('position');
    let iMaxX = 0, iMaxY = 0;
    for (let i = 0; i < pos.count; i++) { if (pos.getX(i) > pos.getX(iMaxX)) iMaxX = i; if (pos.getY(i) > pos.getY(iMaxY)) iMaxY = i; }
    expect(uv.getX(iMaxX)).toBeGreaterThan(0.98);
    expect(uv.getY(iMaxY)).toBeGreaterThan(0.98);
  });

  it('applies a screen texture as emissiveMap and map, and leaves plain glass without one', () => {
    const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const withTex = buildClip({ screenTexture: tex });
    const mats = Array.isArray(withTex.screen.material) ? withTex.screen.material : [withTex.screen.material];
    for (const m of mats as THREE.MeshPhysicalMaterial[]) {
      expect(m.emissiveMap).toBe(tex);
      expect(m.map).toBe(tex);
    }
    const plain = firstMaterial(buildClip({ screenTexture: null }).screen);
    expect(plain.emissiveMap).toBeNull();
    expect(plain.map).toBeNull();
    expect(plain).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  it('colours the body differently for white and black', () => {
    const body = (c: 'white' | 'black') => firstMaterial(buildClip({ colour: c }).group.getObjectByName('body') as THREE.Mesh);
    expect(body('white')).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(body('white').color.getHex()).not.toBe(body('black').color.getHex());
  });

  it('disposes its own geometries and materials but not the passed-in texture', () => {
    const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const texDispose = vi.spyOn(tex, 'dispose');
    const clip = buildClip({ screenTexture: tex });
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    meshesOf(clip.group).forEach(m => {
      geometries.add(m.geometry);
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => materials.add(x));
    });
    const geoDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const matDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    clip.dispose();
    const disposedGeos = new Set(geoDispose.mock.contexts);
    const disposedMats = new Set(matDispose.mock.contexts);
    geometries.forEach(g => expect(disposedGeos.has(g)).toBe(true));
    materials.forEach(m => expect(disposedMats.has(m)).toBe(true));
    expect(texDispose).not.toHaveBeenCalled();
  });

  it('returns independent groups on each call', () => {
    const a = buildClip({ colour: 'black' });
    const b = buildClip({ colour: 'black' });
    expect(a.group).not.toBe(b.group);
    expect(a.screen).not.toBe(b.screen);
    expect(a.screen.material).not.toBe(b.screen.material);
    expect(a.screen.geometry).not.toBe(b.screen.geometry);
    const bodyA = firstMaterial(a.group.getObjectByName('body') as THREE.Mesh);
    const bodyB = firstMaterial(b.group.getObjectByName('body') as THREE.Mesh);
    expect(bodyA).not.toBe(bodyB);
    bodyA.color.set('#ff0000');
    expect(bodyB.color.getHex()).not.toBe(0xff0000);
  });
});
