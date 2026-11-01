import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HEAD_MAX_Y, HEAD_MIN_Z, buildRetroWatch, cutHead, isHeadVertex, parseWatchModel } from '../retroClipModel';
import {
  CAP_HINGE_REST, CAP_HINGE_SWING, CAP_REST_YAW, CAP_YAW_SWING, DIAMOND_TURN, buildCapClip, buildNecklace, capHingeAngle, capYaw,
} from '../wearModels';
import { buildWear } from '../wearScene';
import { watchBytes } from './watchFixture';

const tex = () => new THREE.Texture();

describe('cutHead', () => {
  it('keeps only triangles whose three vertices are on the head, compacted', () => {
    // Two triangles: one on the case (z 0.6, |y| < 0.47), one with a vertex out on the bracelet (y 0.6).
    const positions = new Float32Array([
      0, 0, 0.6, 0.1, 0, 0.6, 0, 0.1, 0.6,      // head
      0, 0.6, 0.6, 0.1, 0.6, 0.6, 0, 0.1, 0.6,  // bracelet (two vertices outside |y| < 0.47)
      0, 0, -0.4,                               // unused, under the case
    ]);
    const out = cutHead(positions, [0, 1, 2, 3, 4, 5, 6, 0, 1]);
    expect(Array.from(out.indices)).toEqual([0, 1, 2]);
    expect(Array.from(out.positions)).toEqual(Array.from(positions.slice(0, 9)));
  });

  it('on the fixture watch, drops the bracelet loop and keeps every head vertex in range', () => {
    const { positions, indices } = parseWatchModel(watchBytes());
    const out = cutHead(positions, indices);
    expect(out.indices.length).toBeGreaterThan(0);
    expect(out.indices.length).toBeLessThan(indices.length);
    for (let i = 0; i < out.positions.length / 3; i++) {
      expect(isHeadVertex(out.positions, i)).toBe(true);
      expect(out.positions[i * 3 + 2]).toBeGreaterThan(HEAD_MIN_Z);
      expect(Math.abs(out.positions[i * 3 + 1])).toBeLessThan(HEAD_MAX_Y);
    }
    expect(Math.max(...out.indices)).toBe(out.positions.length / 3 - 1);
  });
});

describe('buildRetroWatch headOnly', () => {
  it('builds the head with two end caps and no bracelet hole', () => {
    const m = buildRetroWatch(watchBytes(), { screenTexture: tex(), headOnly: true });
    const caps: THREE.Object3D[] = [];
    m.group.traverse(o => { if (o.name === 'endCap') caps.push(o); });
    expect(caps).toHaveLength(2);
    expect(m.group.userData.hole).toBeUndefined();
    const full = buildRetroWatch(watchBytes(), { screenTexture: tex() });
    expect(full.group.userData.hole).toBeInstanceOf(THREE.Box3);
    let endCapsOnFull = 0;
    full.group.traverse(o => { if (o.name === 'endCap') endCapsOnFull++; });
    expect(endCapsOnFull).toBe(0);
    // The head is far shallower than the whole watch (the bracelet loop is gone).
    const hb = new THREE.Box3().setFromObject(m.group, true), fb = new THREE.Box3().setFromObject(full.group, true);
    expect(hb.max.z - hb.min.z).toBeLessThan((fb.max.z - fb.min.z) / 2);
    m.dispose(); full.dispose();
  });
});

describe('necklace rig', () => {
  it('turns the head 45° to hang as a diamond under the chain', () => {
    const head = new THREE.Group();
    const n = buildNecklace(head);
    const diamond = n.getObjectByName('diamond')!;
    expect(DIAMOND_TURN).toBeCloseTo(Math.PI / 4);
    expect(diamond.rotation.z).toBeCloseTo(Math.PI / 4);
    expect(head.parent).toBe(diamond);
    const chain = n.getObjectByName('chain')!;
    n.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(chain).min.y).toBeGreaterThan(15);   // the chain starts at the top corner
  });
});

describe('cap clip rig', () => {
  it('hangs the head from the hinge under the bill as a diamond, resting at the looking-ahead stop', () => {
    const head = new THREE.Group();
    const { group, hinge } = buildCapClip(head);
    expect(hinge.rotation.x).toBeCloseTo(CAP_HINGE_REST);
    expect(head.parent?.name).toBe('diamond');
    expect(head.parent?.rotation.z).toBeCloseTo(Math.PI / 4);
    expect(head.parent?.parent).toBe(hinge);
    group.updateMatrixWorld(true);
    const p = head.getWorldPosition(new THREE.Vector3());
    const bill = group.getObjectByName('bill')!;
    expect(p.y).toBeLessThan(bill.position.y);   // below the bill
  });

  it('swings the hinge slowly about its rest, and not at all under reduced motion', () => {
    expect(capHingeAngle(3, true)).toBe(CAP_HINGE_REST);
    for (let t = 0; t < 20; t += 0.5) expect(Math.abs(capHingeAngle(t, false) - CAP_HINGE_REST)).toBeLessThanOrEqual(CAP_HINGE_SWING + 1e-9);
    expect(capHingeAngle(2, false)).not.toBe(CAP_HINGE_REST);
  });

  it('turns the cap a little either side of a near-front three-quarter view, never edge-on', () => {
    expect(capYaw(5, true)).toBe(CAP_REST_YAW);
    for (let t = 0; t < 30; t += 0.5) {
      const y = capYaw(t, false);
      expect(Math.abs(y - CAP_REST_YAW)).toBeLessThanOrEqual(CAP_YAW_SWING + 1e-9);
      expect(Math.abs(y)).toBeLessThan(0.6);
    }
  });
});

describe('buildWear', () => {
  it('shows the bracelet only in watch mode, the chain only on the necklace and the cap only on the clip', () => {
    const names = (o: THREE.Object3D) => { const s = new Set<string>(); o.traverse(x => s.add(x.name)); return s; };
    const w = buildWear(watchBytes(), 'watch', tex());
    const n = buildWear(watchBytes(), 'necklace', tex());
    const c = buildWear(watchBytes(), 'clip', tex());
    expect(w.model.group.userData.hole).toBeInstanceOf(THREE.Box3);
    expect(n.model.group.userData.hole).toBeUndefined();
    expect(c.model.group.userData.hole).toBeUndefined();
    expect(names(w.object).has('chain') || names(w.object).has('capClip')).toBe(false);
    expect(names(n.object).has('chain')).toBe(true);
    expect(names(c.object).has('capClip') && names(c.object).has('hinge')).toBe(true);
    expect(c.hinge).not.toBeNull();
    for (const b of [w, n, c]) { expect(b.frame.isEmpty()).toBe(false); b.model.dispose(); }
  });
});
