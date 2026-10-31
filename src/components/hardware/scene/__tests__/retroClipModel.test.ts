import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
// @ts-expect-error - plain .mjs script without type declarations
import { encodeModel } from '../../../../../scripts/decode-watch-model.mjs';
import { buildRetroClip, parseWatchModel } from '../retroClipModel';

// A small box-ish "head" in the artifact's model units (x ±0.5, |y| < 0.47, z 0.53..0.77).
function headBytes(): ArrayBuffer {
  const g = new THREE.BoxGeometry(1.0, 0.9, 0.24, 2, 2, 1).translate(0, 0, 0.65);
  const positions = new Float32Array(g.attributes.position.array as Float32Array);
  const indices = new Uint32Array(g.index!.array as ArrayLike<number>);
  g.dispose();
  const u = encodeModel({ positions, indices }) as Uint8Array;
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

describe('parseWatchModel', () => {
  it('reads positions and indices from the binary format', () => {
    const { positions, indices } = parseWatchModel(headBytes());
    expect(positions.length % 3).toBe(0);
    expect(indices.length % 3).toBe(0);
    expect(Math.max(...indices)).toBeLessThan(positions.length / 3);
  });
});

describe('buildRetroClip', () => {
  it('hangs as a diamond from an anchor on the axis, above the head, with a named screen showing the texture', () => {
    const tex = new THREE.Texture();
    const clip = buildRetroClip(headBytes(), { screenTexture: tex });
    expect(clip.group.name).toBe('clip');
    const anchor = clip.group.userData.anchor as THREE.Vector3;
    expect(anchor.x).toBe(0);
    expect(anchor.z).toBeCloseTo(0, 9);
    expect(clip.screen.name).toBe('screen');
    expect((clip.screen.material as THREE.MeshBasicMaterial).map).toBe(tex);
    // The head (without the chain) sits below the anchor and is turned 45°.
    clip.group.updateMatrixWorld(true);
    const head = clip.group.getObjectByName('head')!;
    expect(head.rotation.z).toBeCloseTo(Math.PI / 4, 9);
    const box = new THREE.Box3().setFromObject(head, true);
    expect(box.max.y).toBeLessThan(anchor.y);
    expect(Math.abs((box.min.x + box.max.x) / 2)).toBeLessThan(4);
    // Front faces +Z: the screen is in front of the head's depth centre.
    const sp = clip.screen.getWorldPosition(new THREE.Vector3());
    expect(sp.z).toBeGreaterThan((box.min.z + box.max.z) / 2);
    // The chain runs up out of the head's frame.
    const chain = clip.group.getObjectByName('chain')!;
    expect(new THREE.Box3().setFromObject(chain, true).max.y).toBeGreaterThan(anchor.y + 40);
    clip.dispose();
  });

  it('dispose frees the geometries and materials it made, but not the caller-owned screen texture', () => {
    const tex = new THREE.Texture();
    const texDispose = vi.spyOn(tex, 'dispose');
    const clip = buildRetroClip(headBytes(), { screenTexture: tex });
    const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
    clip.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { geos.add(m.geometry); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => mats.add(x)); }
    });
    const spies = [...geos, ...mats].map(x => vi.spyOn(x, 'dispose'));
    expect(spies.length).toBeGreaterThan(10);
    clip.dispose();
    spies.forEach(s => expect(s).toHaveBeenCalledTimes(1));
    expect(texDispose).not.toHaveBeenCalled();
  });
});
