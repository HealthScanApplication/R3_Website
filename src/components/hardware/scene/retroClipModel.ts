/**
 * The R³ Retro "real retro watch" in necklace mode, ported from the owner's Pod Plan artifact (three r160):
 * `buildRetro` (artifact lines ~2140-2200), necklace branch only. The measured watch head (bracelet and lugs cut
 * off; public/models/r3-clip-retro.bin, made by scripts/decode-watch-model.mjs) turned 45° to hang as a diamond
 * from a chain, its e-paper screen under a flat crystal.
 *
 * Ported faithfully (millimetres, the artifact's S = 38 mm per model unit): the case mesh (`hm`, scaled by S at
 * z = -0.74 S); the screen window `octagon(27, 23.5, 4)` at y -0.7, z = zf; the ring in the screen's colour that
 * fills the gap to the case (`octagon(31.4, 27.9, 4.8)` with the window as a hole); the additive crystal over it;
 * `lensBlend` camera at [12, 14.9, -0.2]; the two end caps with their dark rail mouths; `headG.rotation.z = π/4`;
 * the chain (bail cylinder, ring, two tubes) fixed to the turned head's top point. Helpers ported: `octagon`
 * (~1803), `add` (~940), `lensBlend` (~1897), `crystalMat` (~935), `metal` (~932), colours from `PRO.black` and
 * `UI.black`.
 *
 * Changed: black colourway only; the screen is a MeshBasicMaterial (the artifact's `displayMat`) showing the
 * caller's texture, with UVs mapping the 27.6 mm square onto [0,1]² (the artifact set texture repeat/offset
 * instead, so the caller's texture needs no setup here); normals are computed on the head alone; the whole rig is
 * shifted +3.8 mm in z so the chain, and so `userData.anchor`, sit at x = 0, z = 0; the two chain tubes get one
 * more control point so they leave any frame. `chain` is a named child so the scene can frame without it.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** A hanging clip: `group` (with `userData.anchor` where the chain leaves it), its `screen` mesh, and `dispose`. */
export type ClipModel = { group: THREE.Group; screen: THREE.Mesh; dispose(): void };
export type RetroClipOptions = { screenTexture: THREE.Texture };
type V3 = [number, number, number];

const S = 38;                                  // mm per model unit
const BODY = '#2a2e2d';                        // PRO.black.body
const GROUND = '#000000';                      // UI.black.ground
const EY = 0.47, ZF = (0.785 - 0.74) * S, CHAIN_Z = -3.8;
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
const metal = (color: string, rough = 0.3) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.9, roughness: rough });
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

export function buildRetroClip(bytes: ArrayBuffer, options: RetroClipOptions): ClipModel {
  const { positions, indices } = parseWatchModel(bytes);
  const caseGeo = new THREE.BufferGeometry();
  caseGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  caseGeo.setIndex(new THREE.BufferAttribute(indices, 1));
  caseGeo.computeVertexNormals();

  const group = new THREE.Group();
  group.name = 'clip';
  const rig = new THREE.Group();
  rig.position.z = -CHAIN_Z;                   // the chain (and so the anchor) at z = 0
  group.add(rig);
  const head = new THREE.Group();
  head.name = 'head';
  rig.add(head);

  const mat = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.32, color: BODY });
  const hm = new THREE.Mesh(caseGeo, mat); hm.scale.setScalar(S); hm.position.z = -0.74 * S; head.add(hm);
  // The screen: the artifact's unlit display material; UVs put the 27.6 mm texture square on the window.
  const winGeo = new THREE.ShapeGeometry(octagon(27, 23.5, 4));
  const uv = winGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / SCREEN_SPAN + 0.5, uv.getY(i) / SCREEN_SPAN + 0.5);
  const screen = add(head, winGeo, new THREE.MeshBasicMaterial({ map: options.screenTexture, toneMapped: false }), 0, -0.7, ZF);
  screen.name = 'screen';
  // No metal edge: a ring in the screen's own colour fills the gap to the case, so the screen reads as one sheet of glass.
  const fr = octagon(31.4, 27.9, 4.8); fr.holes.push(octagon(27, 23.5, 4));
  add(head, new THREE.ShapeGeometry(fr), new THREE.MeshBasicMaterial({ color: GROUND, toneMapped: false }), 0, -0.7, ZF + 0.01);
  add(head, new THREE.ShapeGeometry(octagon(31.4, 27.9, 4.8)), crystalMat(), 0, -0.7, ZF + 0.2);
  lensBlend(head, [12.0, 14.9, -0.2], [-0.707, 0.707, 0], [0.288, 0.288, 0.914], mat);
  const ey = EY * S, mouth = new THREE.MeshStandardMaterial({ color: '#050606', roughness: 0.5 });
  [-1, 1].forEach(sd => {
    // The case's short edge, measured: 24 mm wide and about 6 mm deep, at its z centre.
    add(head, new RoundedBoxGeometry(23.6, 2.4, 6, 2, 0.9), mat, 0, sd * (ey + 0.3), -3.8);
    add(head, new RoundedBoxGeometry(15, 0.5, 3, 1, 0.4), mouth, 0, sd * (ey + 1.5), -3.8);
  });
  head.rotation.z = Math.PI / 4;

  // The chain, fixed to the actual top point of the turned head.
  const ty = (11.8 + ey + 1.5) * 0.7071, cm = metal('#c4ccc8', 0.25);
  const chain = new THREE.Group();
  chain.name = 'chain';
  chain.position.z = CHAIN_Z;
  rig.add(chain);
  add(chain, new THREE.CylinderGeometry(1.1, 1.1, 5.4, 20), cm, 0, ty - 1.2, 0);
  add(chain, new THREE.TorusGeometry(1.9, 0.55, 16, 48), cm, 0, ty + 2.0, 0).rotation.y = Math.PI / 2;
  [-1, 1].forEach(sd => add(chain, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, ty + 3.6, 0), new THREE.Vector3(sd * 9, 46, -3), new THREE.Vector3(sd * 19, 72, -7),
    new THREE.Vector3(sd * 26, 104, -10), new THREE.Vector3(sd * 40, 200, -18),
  ]), 100, 0.5, 10), cm));
  group.userData.anchor = new THREE.Vector3(0, ty + 3.6, 0);

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

/** Fetch the head model and build the clip. */
export async function loadRetroClip(url: string, options: RetroClipOptions): Promise<ClipModel> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Clip model request failed: status ${res.status} for ${url}`);
  const bytes = await res.arrayBuffer();
  if (!bytes || bytes.byteLength < 8) throw new Error(`Clip model response was empty (status ${res.status}) for ${url}`);
  return buildRetroClip(bytes, options);
}
