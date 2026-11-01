// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { frameDistance } from '../framing';
import { createShadowBlob } from '../shadowBlob';

describe('frameDistance', () => {
  const size = { x: 1.5, y: 1.3, z: 0.6 };
  const fits = (d: number, aspect: number, fov = 32) => {
    const halfH = (d - size.z / 2) * Math.tan((fov * Math.PI) / 360);
    return halfH >= size.y / 2 && halfH * aspect >= size.x / 2;
  };

  it('keeps the whole box in view for wide, square and tall containers', () => {
    for (const aspect of [2, 1.4, 1, 0.8, 0.5]) expect(fits(frameDistance(size, aspect, 32), aspect)).toBe(true);
  });

  it('pulls back as the container narrows, and is height-bound when wide', () => {
    expect(frameDistance(size, 0.8, 32)).toBeGreaterThan(frameDistance(size, 1, 32));
    expect(frameDistance(size, 0.5, 32)).toBeGreaterThan(frameDistance(size, 0.8, 32));
    expect(frameDistance(size, 2, 32)).toBeCloseTo(frameDistance(size, 3, 32), 9);
  });

  it('stays finite for degenerate aspects', () => {
    for (const aspect of [0, -1, Number.NaN, Infinity]) expect(Number.isFinite(frameDistance(size, aspect, 32))).toBe(true);
  });
});

describe('createShadowBlob', () => {
  it('is a flat transparent plane, dark in the centre and clear at the rim', () => {
    const blob = createShadowBlob(0.6, 0.25, 0.5);
    const mat = blob.mesh.material as THREE.MeshBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.opacity).toBeCloseTo(0.5, 6);
    // Lies in the floor plane (normal up) and is scaled to the ellipse.
    blob.mesh.updateWorldMatrix(true, false);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(blob.mesh.quaternion);
    expect(n.y).toBeCloseTo(1, 6);
    const box = new THREE.Box3().setFromObject(blob.mesh, true).getSize(new THREE.Vector3());
    expect(box.x).toBeCloseTo(0.6, 6);
    expect(box.z).toBeCloseTo(0.25, 6);
    const tex = mat.map as THREE.DataTexture;
    const { data, width, height } = tex.image as { data: Uint8Array; width: number; height: number };
    const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3];
    expect(alphaAt(width / 2, height / 2)).toBeGreaterThan(200);
    expect(alphaAt(0, height / 2)).toBe(0);
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(width / 2, height / 2)).toBeGreaterThan(alphaAt(width / 2 + width / 4, height / 2));
  });

  it('disposes its geometry, material and texture', () => {
    const blob = createShadowBlob(1, 0.4, 0.5);
    const mat = blob.mesh.material as THREE.MeshBasicMaterial;
    const spies = [vi.spyOn(blob.mesh.geometry, 'dispose'), vi.spyOn(mat, 'dispose'), vi.spyOn(mat.map!, 'dispose')];
    blob.dispose();
    spies.forEach(s => expect(s).toHaveBeenCalledTimes(1));
  });
});
