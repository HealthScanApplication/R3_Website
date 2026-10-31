import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
// @ts-expect-error - plain .mjs script without type declarations
import { encodeModel } from '../../../../../scripts/decode-watch-model.mjs';
import { applyWatchFinish, buildRetroWatch, loopHole, parseWatchModel } from '../retroClipModel';
import { FINISH_SPECS } from '../finishes';
import { watchBytes } from './watchFixture';

describe('parseWatchModel', () => {
  it('reads positions and indices from the binary format', () => {
    const { positions, indices } = parseWatchModel(watchBytes());
    expect(positions.length % 3).toBe(0);
    expect(indices.length % 3).toBe(0);
    expect(Math.max(...indices)).toBeLessThan(positions.length / 3);
  });
});

describe('loopHole', () => {
  it('finds the closed bracelet\'s hole: centre and inner extents across the X axis', () => {
    const { positions } = parseWatchModel(watchBytes());
    const h = loopHole(positions);
    // The fixture loop: a torus of radius 0.75, tube 0.1, about the X axis, centred at z = -0.05.
    expect((h.min.y + h.max.y) / 2).toBeCloseTo(0, 1);
    expect((h.min.z + h.max.z) / 2).toBeCloseTo(-0.05, 1);
    expect(h.max.y - h.min.y).toBeGreaterThan(1.2);
    expect(h.max.y - h.min.y).toBeLessThan(1.35);
    // The case back (z 0.53) closes the top of the hole.
    expect(h.max.z).toBeLessThan(0.56);
    expect(h.max.x - h.min.x).toBeGreaterThan(0.9);
  });

  it('falls back to the outer box when a ray finds nothing', () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const h = loopHole(new Float32Array(g.attributes.position.array as Float32Array));
    g.dispose();
    expect(Number.isFinite(h.min.y) && Number.isFinite(h.max.z)).toBe(true);
  });
});

describe('buildRetroWatch', () => {
  it('stands upright with a named screen showing the texture, facing +Z', () => {
    const tex = new THREE.Texture();
    const watch = buildRetroWatch(watchBytes(), { screenTexture: tex });
    expect(watch.group.name).toBe('watch');
    expect(watch.screen.name).toBe('screen');
    expect((watch.screen.material as THREE.MeshBasicMaterial).map).toBe(tex);
    watch.group.updateMatrixWorld(true);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(watch.screen.matrixWorld);
    expect(n.z).toBeGreaterThan(0.999);
    const box = new THREE.Box3().setFromObject(watch.group, true);
    const sp = watch.screen.getWorldPosition(new THREE.Vector3());
    expect(sp.z).toBeGreaterThan((box.min.z + box.max.z) / 2);
    // Upright: the bracelet runs above and below the case (taller than the case is wide).
    expect(box.max.y - box.min.y).toBeGreaterThan(box.max.x - box.min.x);
    expect(watch.group.getObjectByName('chain')).toBeUndefined();
    watch.dispose();
  });

  it('exposes the bracelet loop\'s hole (mm, axis X) behind the screen, inside the watch', () => {
    const watch = buildRetroWatch(watchBytes(), { screenTexture: new THREE.Texture() });
    watch.group.updateMatrixWorld(true);
    expect(watch.group.userData.holeAxis).toBe('x');
    const hole = watch.group.userData.hole as THREE.Box3;
    expect(hole).toBeInstanceOf(THREE.Box3);
    const c = hole.getCenter(new THREE.Vector3());
    const box = new THREE.Box3().setFromObject(watch.group, true);
    expect(box.containsPoint(c)).toBe(true);
    expect(c.z).toBeLessThan(watch.screen.getWorldPosition(new THREE.Vector3()).z - 10);
    expect(Math.abs(c.y)).toBeLessThan(2);
    // 38 mm per model unit: the fixture's inner hole is about 1.3 units = ~49 mm tall.
    expect(hole.max.y - hole.min.y).toBeGreaterThan(45);
    expect(hole.max.y - hole.min.y).toBeLessThan(52);
    watch.dispose();
  });

  it('keeps the screen unoccluded: ring has a hole, crystal is additive and see-through', () => {
    const watch = buildRetroWatch(watchBytes(), { screenTexture: new THREE.Texture() });
    const head = watch.group.getObjectByName('head')!;
    const front = head.children.filter(o => (o as THREE.Mesh).isMesh && o !== watch.screen && o.position.z > watch.screen.position.z) as THREE.Mesh[];
    expect(front.length).toBe(2);
    const [ring, crystal] = front.sort((a, b) => a.position.z - b.position.z);
    const p = ring.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) expect(Math.abs(p.getX(i)) >= 13.4 || Math.abs(p.getY(i)) >= 11.7 || Math.abs(p.getX(i)) + Math.abs(p.getY(i)) >= 20.7).toBe(true);
    const cm = crystal.material as THREE.MeshStandardMaterial;
    expect(cm.transparent).toBe(true);
    expect(cm.blending).toBe(THREE.AdditiveBlending);
    expect(cm.depthWrite).toBe(false);
    expect(cm.color.getHex()).toBe(0x000000);
    watch.dispose();
  });

  it('dispose frees the geometries and materials it made, but not the caller-owned screen texture', () => {
    const tex = new THREE.Texture();
    const texDispose = vi.spyOn(tex, 'dispose');
    const watch = buildRetroWatch(watchBytes(), { screenTexture: tex });
    const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
    watch.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { geos.add(m.geometry); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => mats.add(x)); }
    });
    const spies = [...geos, ...mats].map(x => vi.spyOn(x, 'dispose'));
    expect(spies.length).toBeGreaterThan(10);
    watch.dispose();
    watch.dispose();
    spies.forEach(s => expect(s).toHaveBeenCalledTimes(1));
    expect(texDispose).not.toHaveBeenCalled();
  });

  it('uses Uint16 indices when the model has them', () => {
    const u = encodeModel({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) }) as Uint8Array;
    const { indices } = parseWatchModel(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer);
    expect(indices).toBeInstanceOf(Uint16Array);
  });
});

describe('watch finishes', () => {
  const bodyAndFace = (w: ReturnType<typeof buildRetroWatch>) => {
    const body = (w.group.getObjectByName('head')!.children.find(o => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).material instanceof THREE.MeshPhysicalMaterial) as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
    const face = (w.group.getObjectByName('screenGround') as THREE.Mesh).material as THREE.MeshBasicMaterial;
    return { body, face };
  };

  it('defaults to black (today\'s body, black face) and builds white with a white face', () => {
    const black = buildRetroWatch(watchBytes(), { screenTexture: new THREE.Texture() });
    const b = bodyAndFace(black);
    expect(b.body.color.getHexString()).toBe('2a2e2d');
    expect([b.body.metalness, b.body.roughness]).toEqual([1, 0.32]);
    expect(b.face.color.getHex()).toBe(0x000000);
    black.dispose();
    const white = buildRetroWatch(watchBytes(), { screenTexture: new THREE.Texture(), finish: 'white' });
    const w = bodyAndFace(white);
    expect(w.body.color.getHexString()).toBe(FINISH_SPECS.white.watch.color.slice(1));
    expect(w.face.color.getHexString()).toBe(FINISH_SPECS.white.screen.ground.slice(1));
    white.dispose();
  });

  it('applyWatchFinish re-colours the same materials, no new geometry', () => {
    const watch = buildRetroWatch(watchBytes(), { screenTexture: new THREE.Texture(), finish: 'white' });
    const geos: THREE.BufferGeometry[] = [];
    watch.group.traverse(o => { if ((o as THREE.Mesh).isMesh) geos.push((o as THREE.Mesh).geometry); });
    const { body, face } = bodyAndFace(watch);
    applyWatchFinish(watch, 'silver');
    const again = bodyAndFace(watch);
    expect(again.body).toBe(body);
    expect(again.face).toBe(face);
    expect(body.color.getHexString()).toBe('c9ced0');
    expect(body.metalness).toBe(1);
    expect(face.color.getHex()).toBe(0x000000);
    const after: THREE.BufferGeometry[] = [];
    watch.group.traverse(o => { if ((o as THREE.Mesh).isMesh) after.push((o as THREE.Mesh).geometry); });
    expect(after.length).toBe(geos.length);
    after.forEach((g, i) => expect(g).toBe(geos[i]));
    watch.dispose();
  });
});

describe('white watch bezel', () => {
  const bezelOf = (w: ReturnType<typeof buildRetroWatch>) => w.group.getObjectByName('screenBezel') as THREE.Mesh;

  it('white shows a thin near-black bezel around the screen ground; black (the hero) and silver hide it', () => {
    const white = buildRetroWatch(watchBytes(), { screenTexture: new THREE.Texture(), finish: 'white' });
    const b = bezelOf(white);
    expect(b).toBeTruthy();
    expect(b.visible).toBe(true);
    expect((b.material as THREE.MeshBasicMaterial).color.getHexString()).toBe('1a1a1a');
    // Inside the face, outside the window: every vertex lies beyond the screen window and within the ground's outline.
    const p = b.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = Math.abs(p.getX(i)), y = Math.abs(p.getY(i));
      expect(x <= 15.7 + 1e-6 && y <= 13.95 + 1e-6).toBe(true);
      expect(x >= 13.5 || y >= 11.75 || x + y >= 21).toBe(true);
    }
    // It draws over the ground (its parent), under the crystal.
    expect(b.parent?.name).toBe('screenGround');
    expect(b.position.z).toBeGreaterThan(0);
    white.dispose();
    for (const finish of [undefined, 'black', 'silver'] as const) {
      const w = buildRetroWatch(watchBytes(), { screenTexture: new THREE.Texture(), finish });
      expect(bezelOf(w).visible).toBe(false);
      w.dispose();
    }
  });

  it('applyWatchFinish shows the bezel on white and hides it on black and silver', () => {
    const w = buildRetroWatch(watchBytes(), { screenTexture: new THREE.Texture(), finish: 'black' });
    const b = bezelOf(w);
    applyWatchFinish(w, 'white');
    expect(b.visible).toBe(true);
    expect((b.material as THREE.MeshBasicMaterial).color.getHexString()).toBe('1a1a1a');
    applyWatchFinish(w, 'silver');
    expect(b.visible).toBe(false);
    applyWatchFinish(w, 'black');
    expect(b.visible).toBe(false);
    w.dispose();
  });
});
