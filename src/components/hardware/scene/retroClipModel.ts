/**
 * The R³ Retro "real retro watch" in WATCH mode, ported from the owner's Pod Plan artifact (three r160): `buildRetro`
 * (artifact lines ~2140-2200), `addHead(wG, 0, 13.8, true)`: the FULL measured watch, case plus its closed link
 * bracelet (public/models/r3-clip-watch.bin, made by `scripts/decode-watch-model.mjs --full`), standing upright with
 * its e-paper screen facing +Z under a flat crystal and the bracelet looping behind and around the case.
 *
 * Ported faithfully (millimetres, the artifact's S = 38 mm per model unit): the watch mesh (`g`, scaled by S at
 * z = -0.74 S); the screen window `octagon(27, 23.5, 4)` at y -0.7, z = zf; the ring in the screen's colour that
 * fills the gap to the case (`octagon(31.4, 27.9, 4.8)` with the window as a hole); the additive crystal over it;
 * `lensBlend` camera at [12, 14.9, -0.2]; no end caps (the bracelet runs into the case). Helpers ported: `octagon`
 * (~1803), `add` (~940), `lensBlend` (~1897), `crystalMat` (~935), colours from `PRO.black` and `UI.black`.
 *
 * Changed: the finishes in finishes.ts (default black, the artifact's colourway; `applyWatchFinish` re-colours); the screen is a MeshBasicMaterial (the artifact's `displayMat`) showing the
 * caller's texture (the heartbeat, retroScreen.ts, not navigation), with UVs mapping the 27.6 mm square onto
 * [0,1]²; the bracelet's hole is measured (`loopHole`) and exposed as `group.userData.hole` (a Box3 in the group's
 * millimetres, hole axis `userData.holeAxis` = 'x') so the scene can nest the R³ Note ring inside it.
 */
import * as THREE from 'three';
import { finishSpec, type Finish } from './finishes';

/** The watch: `group` (with `userData.hole` / `userData.holeAxis`), its `screen` mesh, and `dispose`. */
export type ClipModel = { group: THREE.Group; screen: THREE.Mesh; dispose(): void };
/** `finish` (default 'black', today's look) colours the case, bracelet and the face around the screen. */
export type RetroClipOptions = { screenTexture: THREE.Texture; finish?: Finish };
export type HoleBox = { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
type V3 = [number, number, number];

const S = 38;                                  // mm per model unit
// Colours come from finishes.ts: black = PRO.black.body '#2a2e2d' and UI.black.ground '#000000'.
const BODY_MAT = 'watchBody', GROUND_MESH = 'screenGround';
const ZF = (0.785 - 0.74) * S, Z_SHIFT = -0.74 * S;
const RAY_BAND = 0.08;                         // model units: vertices this close to a ray count as on it
const SCREEN_SPAN = 27.6;                      // the texture's square, mm

/** Binary model: uint32 header length, JSON {min, max, n, ni, iw?}, Int16 positions, pad to 4, Uint16/Uint32 indices. */
export function parseWatchModel(bytes: ArrayBuffer): { positions: Float32Array; indices: Uint16Array | Uint32Array } {
  const dv = new DataView(bytes);
  const hl = dv.getUint32(0, true);
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 4, hl))) as { min: number[]; max: number[]; n: number; ni: number; iw?: number };
  const positions = new Float32Array(h.n * 3);
  for (let i = 0; i < positions.length; i++) {
    const k = i % 3;
    positions[i] = h.min[k] + ((dv.getInt16(4 + hl + i * 2, true) + 32768) / 65535) * (h.max[k] - h.min[k]);
  }
  const end = 4 + hl + h.n * 6, io = end + ((4 - (end % 4)) % 4);
  const indices = h.iw === 2 ? new Uint16Array(bytes.slice(io, io + h.ni * 2)) : new Uint32Array(bytes.slice(io, io + h.ni * 4));
  return { positions, indices };
}

function octagon(w: number, h: number, c: number): THREE.Shape {
  const s = new THREE.Shape(), x = w / 2, y = h / 2;
  s.moveTo(-x + c, -y); s.lineTo(x - c, -y); s.lineTo(x, -y + c); s.lineTo(x, y - c);
  s.lineTo(x - c, y); s.lineTo(-x + c, y); s.lineTo(-x, y - c); s.lineTo(-x, -y + c); s.closePath();
  return s;
}
const add = (rig: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); rig.add(m); return m;
};
// Sapphire crystal: drawn as its reflections only, added on top, so the screen under it stays sharp and true.
const crystalMat = () => new THREE.MeshStandardMaterial({ color: '#000000', metalness: 0, roughness: 0.04, envMapIntensity: 0.35, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

// A blended camera module: a soft swell in the case material with the lens set in it; it looks along n.
function lensBlend(parent: THREE.Object3D, p: V3, t: V3, n: V3, mat: THREE.Material) {
  const z = new THREE.Vector3(...n).normalize(), x0 = new THREE.Vector3(...t);
  const x = x0.sub(z.clone().multiplyScalar(x0.dot(z))).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  const g = new THREE.Group(); g.matrixAutoUpdate = false;
  g.matrix.makeBasis(x, y, z).setPosition(new THREE.Vector3(...p)); parent.add(g);
  const swell = add(g, new THREE.SphereGeometry(3.4, 48, 32), mat, 0, 0, -1.55); swell.scale.set(1, 0.8, 0.5);
  const crown = add(g, new THREE.SphereGeometry(2.3, 48, 32), mat, 0, 0, -0.9); crown.scale.set(1, 1, 0.55);
  add(g, new THREE.CircleGeometry(1.25, 40), new THREE.MeshStandardMaterial({ color: '#010202', roughness: 0.2 }), 0, 0, 0.36);
  add(g, new THREE.TorusGeometry(1.3, 0.09, 8, 40), new THREE.MeshStandardMaterial({ color: '#c9ced0', metalness: 1, roughness: 0.2 }), 0, 0, 0.37);
  const lens = add(g, new THREE.SphereGeometry(1.0, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#0a1218', roughness: 0.02, clearcoat: 1 }), 0, 0, 0.37);
  lens.rotation.x = Math.PI / 2; lens.scale.set(1, 0.45, 1);
  add(g, new THREE.CircleGeometry(0.2, 20), new THREE.MeshBasicMaterial({ color: '#4a7aa8' }), -0.35, 0.35, 0.6);
  add(g, new THREE.CircleGeometry(0.17, 20), new THREE.MeshStandardMaterial({ color: '#2a0909', emissive: new THREE.Color('#ff3b3b'), emissiveIntensity: 1.2 }), 1.7, 0, 0.1);
  return g;
}

/**
 * The closed bracelet's hole, in model units, for a loop about the X axis: start at the YZ centre of the model's box,
 * cast rays along ±Y and ±Z (vertices within RAY_BAND of a ray count), take the nearest hit on each, re-centre
 * between the hits and cast once more. The X span is the model's full width. A ray that hits nothing falls back to
 * the outer box.
 */
export function loopHole(positions: Float32Array): HoleBox {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], positions[i]); hi[k] = Math.max(hi[k], positions[i]); }
  let cy = (lo[1] + hi[1]) / 2, cz = (lo[2] + hi[2]) / 2;
  let yp = hi[1] - cy, yn = cy - lo[1], zp = hi[2] - cz, zn = cz - lo[2];
  for (let pass = 0; pass < 2; pass++) {
    let a = Infinity, b = Infinity, c = Infinity, d = Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      const dy = positions[i + 1] - cy, dz = positions[i + 2] - cz;
      if (Math.abs(dz) < RAY_BAND) { if (dy > 0) a = Math.min(a, dy); else b = Math.min(b, -dy); }
      if (Math.abs(dy) < RAY_BAND) { if (dz > 0) c = Math.min(c, dz); else d = Math.min(d, -dz); }
    }
    yp = Number.isFinite(a) ? a : hi[1] - cy; yn = Number.isFinite(b) ? b : cy - lo[1];
    zp = Number.isFinite(c) ? c : hi[2] - cz; zn = Number.isFinite(d) ? d : cz - lo[2];
    if (pass === 0) { const ny = cy + (yp - yn) / 2, nz = cz + (zp - zn) / 2; yp += cy - ny; yn -= cy - ny; zp += cz - nz; zn -= cz - nz; cy = ny; cz = nz; }
  }
  return { min: { x: lo[0], y: cy - yn, z: cz - zn }, max: { x: hi[0], y: cy + yp, z: cz + zp } };
}

export function buildRetroWatch(bytes: ArrayBuffer, options: RetroClipOptions): ClipModel {
  const { positions, indices } = parseWatchModel(bytes);
  const watchGeo = new THREE.BufferGeometry();
  watchGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  watchGeo.setIndex(new THREE.BufferAttribute(indices, 1));
  watchGeo.computeVertexNormals();

  const group = new THREE.Group();
  group.name = 'watch';
  const head = new THREE.Group();
  head.name = 'head';
  group.add(head);

  const spec = finishSpec(options.finish);
  const mat = new THREE.MeshPhysicalMaterial({ ...spec.watch });
  mat.name = BODY_MAT;
  const wm = new THREE.Mesh(watchGeo, mat); wm.scale.setScalar(S); wm.position.z = Z_SHIFT; head.add(wm);
  // The screen: the artifact's unlit display material; UVs put the 27.6 mm texture square on the window.
  const winGeo = new THREE.ShapeGeometry(octagon(27, 23.5, 4));
  const uv = winGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / SCREEN_SPAN + 0.5, uv.getY(i) / SCREEN_SPAN + 0.5);
  const screen = add(head, winGeo, new THREE.MeshBasicMaterial({ map: options.screenTexture, toneMapped: false }), 0, -0.7, ZF);
  screen.name = 'screen';
  // No metal edge: a ring in the screen's own colour fills the gap to the case, so the screen reads as one sheet of glass.
  const fr = octagon(31.4, 27.9, 4.8); fr.holes.push(octagon(27, 23.5, 4));
  const ground = add(head, new THREE.ShapeGeometry(fr), new THREE.MeshBasicMaterial({ color: spec.screen.ground, toneMapped: false }), 0, -0.7, ZF + 0.01);
  ground.name = GROUND_MESH;
  add(head, new THREE.ShapeGeometry(octagon(31.4, 27.9, 4.8)), crystalMat(), 0, -0.7, ZF + 0.2);
  lensBlend(head, [12.0, 14.9, -0.2], [-0.707, 0.707, 0], [0.288, 0.288, 0.914], mat);

  // The bracelet's hole, in the group's millimetres.
  const h = loopHole(positions);
  group.userData.hole = new THREE.Box3(
    new THREE.Vector3(h.min.x * S, h.min.y * S, h.min.z * S + Z_SHIFT),
    new THREE.Vector3(h.max.x * S, h.max.y * S, h.max.z * S + Z_SHIFT),
  );
  group.userData.holeAxis = 'x';

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
    group.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      geos.add(m.geometry);
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => mats.add(x));
    });
    geos.forEach(g => g.dispose());
    mats.forEach(x => x.dispose());       // material.dispose() leaves its map (the caller's texture) alone
  };
  return { group, screen, dispose };
}

/**
 * Re-colour a built watch in place (case, bracelet and the face around the screen): no new geometry. The screen
 * texture itself belongs to the caller, which repaints it with the finish's screen scheme.
 */
export function applyWatchFinish(model: ClipModel, finish: Finish): void {
  const spec = finishSpec(finish);
  model.group.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshPhysicalMaterial;
    if (mat.name === BODY_MAT) {
      mat.color.set(spec.watch.color);
      mat.metalness = spec.watch.metalness;
      mat.roughness = spec.watch.roughness;
    } else if (m.name === GROUND_MESH) {
      (m.material as THREE.MeshBasicMaterial).color.set(spec.screen.ground);
    }
  });
}

/** Fetch the full watch model and build it. */
export async function loadRetroWatch(url: string, options: RetroClipOptions): Promise<ClipModel> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Watch model request failed: status ${res.status} for ${url}`);
  const bytes = await res.arrayBuffer();
  if (!bytes || bytes.byteLength < 8) throw new Error(`Watch model response was empty (status ${res.status}) for ${url}`);
  return buildRetroWatch(bytes, options);
}
