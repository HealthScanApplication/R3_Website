/**
 * The R³ Clip's three ways to wear it, built around the R³ Retro watch from retroClipModel.ts, ported from the owner's
 * Pod Plan artifact (three r160, millimetres):
 *
 * - WATCH: the whole measured model, case plus closed steel link bracelet (`buildRetroWatch`, as in the "Two devices"
 *   card).
 * - NECKLACE (`buildRetro`, ~2149-2230): the head alone (`headOnly`: bracelet cut off, end caps on), turned 45° about
 *   the screen's axis so it hangs as a diamond, with a bail on its top corner, a ring and the two strands of a chain
 *   running up out of view.
 * - CAP CLIP (`hatClip` and the `hat:` accessory, ~1320-1437): a cap, a clip on the bill's front edge and a click hinge
 *   under it; the head hangs from the hinge as a diamond (the artifact's clip mode). The hinge's "under the bill,
 *   looking ahead" stop is the rest; a slow, small swing about it (none under reduced motion).
 *
 * Changed: one finish (Black, the artifact's colourway) for the watch; the artifact's cap colours and materials
 * (`soft`, `metal`) are kept as-is; the artifact's procedural fallback watch is not ported (this file is only used
 * once the real model has loaded).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HEAD_MAX_Y } from './retroClipModel';

export type WearModeId = 'watch' | 'clip' | 'necklace';

/** The necklace and the cap clip hang the head as a diamond: turned this far about the screen's axis (Z). */
export const DIAMOND_TURN = Math.PI / 4;
/** Cap hinge (rad about X): the artifact's stops are above -0.35, under 0.6 (looking ahead) and flat 1.45. */
export const CAP_HINGE_REST = 0.6;
export const CAP_HINGE_SWING = 0.12;
export const CAP_HINGE_PERIOD = 9;
/** Where the hinge sits on the cap and where the head hangs from it (mm), as in the artifact. */
export const CAP_HINGE_POS: [number, number, number] = [0, -13.4, 98];
export const CAP_HEAD_OFFSET: [number, number, number] = [0, -26, 1.5];

/**
 * The cap's own rig swing (rad about Y): nearer front-on and narrower than the watch's, since the cap's crown sits far
 * behind the framed bill and would otherwise swing out of the card.
 */
export const CAP_REST_YAW = -0.32;
export const CAP_YAW_SWING = 0.18;
export const CAP_YAW_PERIOD = 12;
export function capYaw(t: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(t)) return CAP_REST_YAW;
  return CAP_REST_YAW + CAP_YAW_SWING * Math.sin((2 * Math.PI * t) / CAP_YAW_PERIOD);
}

export function capHingeAngle(t: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(t)) return CAP_HINGE_REST;
  return CAP_HINGE_REST + CAP_HINGE_SWING * Math.sin((2 * Math.PI * t) / CAP_HINGE_PERIOD);
}

const soft = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
const metal = (color: string, roughness = 0.3) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.9, roughness });
const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
};

/** Dispose every geometry and material under `root` (each once). */
export function disposeTree(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    geos.add(m.geometry);
    (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => mats.add(x));
  });
  geos.forEach(g => g.dispose());
  mats.forEach(x => x.dispose());
}

/**
 * NECKLACE: `head` (a `headOnly` watch group, in its millimetres) turned to a diamond, and the chain fixed to the turned
 * head's top point: a bail, a ring, and two strands rising out of the frame. Returns the necklace group; the chain is
 * named 'chain', the turned head's holder 'diamond'.
 */
export function buildNecklace(head: THREE.Object3D): THREE.Group {
  const necklace = new THREE.Group();
  necklace.name = 'necklace';
  const diamond = new THREE.Group();
  diamond.name = 'diamond';
  diamond.rotation.z = DIAMOND_TURN;
  diamond.add(head);
  necklace.add(diamond);

  const ey = HEAD_MAX_Y * 38;
  const ty = (11.8 + ey + 1.5) * Math.SQRT1_2, cm = metal('#c4ccc8', 0.25);
  const chain = new THREE.Group();
  chain.name = 'chain';
  chain.position.z = -3.8;   // centred on the case's depth, so the ring sits right above it
  add(chain, new THREE.CylinderGeometry(1.1, 1.1, 5.4, 20), cm, 0, ty - 1.2, 0).name = 'bail';
  add(chain, new THREE.TorusGeometry(1.9, 0.55, 16, 48), cm, 0, ty + 2.0, 0).rotation.y = Math.PI / 2;
  [-1, 1].forEach(sd => add(chain, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, ty + 3.6, 0), new THREE.Vector3(sd * 9, 46, -3), new THREE.Vector3(sd * 19, 72, -7), new THREE.Vector3(sd * 26, 104, -10),
  ]), 80, 0.5, 10), cm));
  necklace.add(chain);
  return necklace;
}

/**
 * CAP CLIP: the artifact's `hatClip` (a cap, a clip on the bill's front edge, a click hinge under it) with `head` hung
 * from the hinge as a diamond. Returns the cap group and its hinge (turn `hinge.rotation.x` with `capHingeAngle`).
 */
export function buildCapClip(head: THREE.Object3D): { group: THREE.Group; hinge: THREE.Group } {
  const r = new THREE.Group();
  r.name = 'capClip';
  add(r, new THREE.SphereGeometry(70, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), soft('#cbbd9f'), 0, -10, 0).scale.set(1, 0.75, 1);
  const bill = add(r, new THREE.CylinderGeometry(58, 58, 3, 64), soft('#bba985'), 0, -10, 46);
  bill.scale.set(1, 1, 0.85);
  bill.name = 'bill';
  add(r, new THREE.SphereGeometry(4, 16, 12), soft('#bba985'), 0, 42, 0);
  const clip = soft('#1c2220');
  [-7.7, -12.3].forEach(y => { add(r, new RoundedBoxGeometry(16, 1.6, 14, 2, 0.6), clip, 0, y, 89).name = 'clipJaw'; });
  add(r, new RoundedBoxGeometry(16, 6.2, 1.8, 2, 0.6), clip, 0, -10, 96.6);
  add(r, new THREE.CylinderGeometry(1.8, 1.8, 18, 24), metal('#9aa39f'), ...CAP_HINGE_POS).rotation.z = Math.PI / 2;
  const hinge = new THREE.Group();
  hinge.name = 'hinge';
  hinge.position.set(...CAP_HINGE_POS);
  hinge.rotation.x = CAP_HINGE_REST;
  r.add(hinge);
  add(hinge, new RoundedBoxGeometry(8, 6, 2.4, 2, 0.8), clip, 0, -3.4, 0);
  const holder = new THREE.Group();
  holder.name = 'diamond';
  holder.position.set(...CAP_HEAD_OFFSET);
  holder.rotation.z = DIAMOND_TURN;
  holder.add(head);
  hinge.add(holder);
  return { group: r, hinge };
}
