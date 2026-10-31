/**
 * The R³ Click clip (camera pod worn on a necklace), ported from the owner's "Pod Plan" artifact (three r160).
 *
 * Ported builder: `buildPod(rig, scene, colour, withCord)` (artifact lines ~1011-1047). Both the `#stage-hero`
 * (white, with cord) and `#stage-pod` (black, no cord) stages call it (lines ~2210-2212). It uses these helpers,
 * also ported: `classicCase` (~1821-1882, with stretch = false and cam = true), `rounded` (~1810), `lensBlend`
 * (~1897), the dot `ring` (~959), `backSide` + `spiral` (~989-1009) and the material helpers `metal`, `glass`,
 * `smoked`, `disc` (~932-939). `makeBody` (~907) is NOT used by buildPod (only the Test Pod uses it).
 *
 * Kept: the 36 x 36 mm softened octagon (C = 7 mm corners) turned 45° to hang as a diamond; the swept profile
 * (flat back, 33° ramp, straight side, 33° ramp into the crystal), the back plate and shallow 110 mm dome; the
 * glass ramp edge, the polished stroke where steel meets glass; the edge rail and the privacy slider; the 18 mm
 * button with its polished ring; 45 dots at r = 12.4 mm with the gap under the camera; the blended camera at the
 * top corner; the back's etched golden-angle spiral (canvas map), sensor window, two glow LEDs and charging pins;
 * the bail loop. Colours come from the artifact's POD table.
 *
 * Changed / simplified:
 * - Built in millimetres inside `rig`, scaled by S = 1/45 so the clip is ~1 unit tall; shifted +2 mm in z so the
 *   cord anchor sits at x = 0, z = 0 of the group. The group origin is the diamond's centre.
 * - The crystal: the artifact draws it as additive reflections over an unlit mask (black, or white for the white
 *   pod). Here `screen` is one opaque dark MeshPhysicalMaterial glass face (the brief's "plain dark glass"), built
 *   pre-rotated so its UVs map the diamond's bounding square onto [0,1]² upright, for the heartbeat canvas. The
 *   mask under the glass ramp is black for both colours, and the inner mask plate (hidden by the opaque face) is
 *   dropped. The dots sit a hair above the face (were 0.1 mm under the see-through crystal) so they stay visible.
 * - The dots no longer animate (`fill`): they show the artifact's still state (30 lit, 15 dim), merged into two
 *   meshes. The necklace's two long cord tubes are dropped: the scene draws the cord from `userData.anchor`.
 * - The spiral is drawn on a 512 px canvas (was 1024) and only when a 2D canvas exists; in node the back disc stays
 *   in place but transparent. No GLTF, no RoomEnvironment, no shadow plane, no UI state.
 * - three 0.169: no API drift needed (colour management and `SRGBColorSpace` match r160).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type ClipModel = { group: THREE.Group; screen: THREE.Mesh; dispose(): void };
export type ClipOptions = { colour?: 'black' | 'white'; screenTexture?: THREE.Texture | null };

type P = [number, number];
type V3 = [number, number, number];

const POD = {
  white: { body: '#ffffff', cap: '#ffffff', off: '#c9d0cd', ink: 'rgba(20,40,34,0.45)' },
  black: { body: '#1c2220', cap: '#252c2a', off: '#2f3835', ink: 'rgba(222,232,228,0.34)' },
} as const;
const GLOW = '#10d39a';
const W = 36, L = 36, C = 7, TOP = 2.8;
const T = Math.tan((33 * Math.PI) / 180);
const TIP = (W / 2 + L / 2 - C) / Math.SQRT2;   // the diamond's top corner, ~20.5 mm above its centre
const LOOP_Z = -2;                              // the bail loop's depth in the artifact
const ANCHOR_Y = TIP + 3.2;                     // where the cord leaves the loop (artifact: tip + 3.2)
const S = 1 / 45;                               // mm -> scene units: the clip is ~45 mm tall with its loop

// ---- Outline helpers (classicCase's ring/soft, stretch = false) ----
const toward = (p: P, q: P, r: number): P => {
  const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
  return [p[0] + (dx / l) * r, p[1] + (dy / l) * r];
};
// The octagon outline inset by d (a 45° corner moves in by d(2 - √2) along each edge).
const ringPts = (d: number): P[] => {
  const x = W / 2 - d, y = L / 2 - d, c = C - d * (2 - Math.SQRT2);
  return [[-x + c, -y], [x - c, -y], [x, -y + c], [x, y - c], [x - c, y], [-x + c, y], [-x, y - c], [-x, -y + c]];
};
// The same outline with each corner blended into a gentle 1.4 mm curve.
const soft = (d: number): P[] => {
  const V = ringPts(d), out: P[] = [];
  V.forEach((v, i) => {
    const a = toward(v, V[(i + 7) % 8], 1.4), b = toward(v, V[(i + 1) % 8], 1.4);
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * v[0] + t * t * b[0], u * u * a[1] + 2 * u * t * v[1] + t * t * b[1]]);
    }
  });
  return out;
};
const shapeOf = (pts: P[], hole?: P[]) => {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  if (hole) {
    const h = new THREE.Path();
    hole.forEach(([x, y], i) => (i ? h.lineTo(x, y) : h.moveTo(x, y)));
    h.closePath();
    s.holes.push(h);
  }
  return s;
};
const plate = (d: number) => new THREE.ShapeGeometry(shapeOf(soft(d)));
// A polyline whose inner corners become quadratic curves of radius r; it stops where the last corner's curve begins.
function rounded(pts: P[], radii: number[], steps = 8): P[] {
  const out: P[] = [pts[0]], lerp = (p: P, q: P, t: number): P => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = toward(pts[i], pts[i - 1], radii[i]), b = toward(pts[i], pts[i + 1], radii[i]);
    for (let k = 0; k <= steps; k++) { const t = k / steps; out.push(lerp(lerp(a, pts[i], t), lerp(pts[i], b, t), t)); }
  }
  const last = pts.length - 1;
  out.push(toward(pts[last], pts[last - 1], radii[last]));
  return out;
}
// Sweep a profile of (inset, height) points round the softened octagon as one closed surface.
function loft(profile: P[]) {
  const pos: number[] = [], idx: number[] = [], M = soft(0).length;
  profile.forEach(([d, z]) => soft(d).forEach(([x, y]) => pos.push(x, y, z)));
  for (let k = 0; k < profile.length - 1; k++) for (let e = 0; e < M; e++) {
    const a = k * M + e, b = k * M + ((e + 1) % M);
    idx.push(a, b, b + M, a, b + M, a + M);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
// The front crystal, pre-turned 45° into the diamond, with UVs spanning its bounding square upright in [0,1]².
function crystalGeometry(inset: number) {
  const g = plate(inset);
  g.rotateZ(Math.PI / 4);
  g.computeBoundingBox();
  const b = g.boundingBox!, pos = g.getAttribute('position'), uv = g.getAttribute('uv');
  const w = b.max.x - b.min.x, h = b.max.y - b.min.y;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - b.min.x) / w, (pos.getY(i) - b.min.y) / h);
  uv.needsUpdate = true;
  return g;
}

// ---- Materials (artifact lines ~932-939) ----
const metal = (color: string, roughness = 0.3) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.9, roughness });
const smoked = () => new THREE.MeshPhysicalMaterial({ color: '#0b1311', roughness: 0.08, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
const disc = (r: number, h: number) => { const g = new THREE.CylinderGeometry(r, r, h, 72); g.rotateX(Math.PI / 2); return g; };
const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};

// The etched back: a golden-angle spiral of dots inside a thin circle (artifact `spiral`, at half resolution).
function spiralTexture(ink: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext?.('2d');
  if (!g) return null;
  const GA = Math.PI * (3 - Math.sqrt(5)), k = 0.5;
  g.fillStyle = ink;
  for (let n = 0; n < 700; n++) {
    const r = 19 * Math.sqrt(n);
    if (r < 170) continue;
    if (r > 495) break;
    const t = n * GA;
    g.beginPath(); g.arc(256 + Math.cos(t) * r * k, 256 + Math.sin(t) * r * k, (2.4 + r * 0.009) * k, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = ink; g.lineWidth = 1.5; g.beginPath(); g.arc(256, 256, 252.5, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A blended camera module: a soft swell in the case material with the lens set in it; the lens looks along n.
function lensBlend(parent: THREE.Object3D, p: V3, t: V3, n: V3, mat: THREE.Material) {
  const z = new THREE.Vector3(...n).normalize(), x0 = new THREE.Vector3(...t);
  const x = x0.sub(z.clone().multiplyScalar(x0.dot(z))).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  g.matrix.makeBasis(x, y, z).setPosition(new THREE.Vector3(...p));
  parent.add(g);
  add(g, new THREE.SphereGeometry(3.4, 48, 32), mat, 0, 0, -1.55).scale.set(1, 0.8, 0.5);
  add(g, new THREE.SphereGeometry(2.3, 48, 32), mat, 0, 0, -0.9).scale.set(1, 1, 0.55);
  add(g, new THREE.CircleGeometry(1.25, 40), std({ color: '#010202', roughness: 0.2 }), 0, 0, 0.36);
  add(g, new THREE.TorusGeometry(1.3, 0.09, 8, 40), std({ color: '#c9ced0', metalness: 1, roughness: 0.2 }), 0, 0, 0.37);
  const lens = add(g, new THREE.SphereGeometry(1.0, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: '#0a1218', roughness: 0.02, clearcoat: 1 }), 0, 0, 0.37);
  lens.rotation.x = Math.PI / 2;
  lens.scale.set(1, 0.45, 1);
  add(g, new THREE.CircleGeometry(0.2, 20), new THREE.MeshBasicMaterial({ color: '#4a7aa8' }), -0.35, 0.35, 0.6);
  add(g, new THREE.CircleGeometry(0.17, 20), std({ color: '#2a0909', emissive: '#ff3b3b', emissiveIntensity: 1.2 }), 1.7, 0, 0.1);
}

export function buildClip(options: ClipOptions = {}): ClipModel {
  const colour = options.colour === 'black' ? 'black' : 'white';
  const screenTexture = options.screenTexture ?? null;
  const pod = POD[colour];
  const ownedTextures: THREE.Texture[] = [];

  const group = new THREE.Group();
  group.name = 'clip';
  const rig = new THREE.Group();                 // millimetres, front = +Z, diamond centre at the origin
  rig.scale.setScalar(S);
  rig.position.z = -LOOP_Z * S;                  // the loop (and so the anchor) at z = 0
  group.add(rig);
  const caseG = new THREE.Group();               // the octagon case, turned 45° to hang as a diamond
  caseG.rotation.z = Math.PI / 4;
  rig.add(caseG);

  const bodyMat = new THREE.MeshPhysicalMaterial({ color: pod.body, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const capMat = new THREE.MeshPhysicalMaterial({ color: pod.cap, roughness: 0.3, clearcoat: 0.7 });

  // The case: flat back, 33° ramp, straight side, 33° ramp running on into the crystal.
  const corners: P[] = [[5, -6.8], [3.6, -6.8], [0, -6.8 + 3.6 * T], [0, 0.4], [3.7, 0.4 + 3.7 * T]];
  const steel = rounded(corners, [0, 0.8, 1, 1, 1.2]);
  add(caseG, loft(steel), bodyMat).name = 'body';
  add(caseG, plate(5), bodyMat, 0, 0, -6.8).rotation.x = Math.PI;
  // The back's shallow dome (radius 110 mm, 0.75 mm proud).
  add(caseG, new THREE.SphereGeometry(110, 72, 6, 0, Math.PI * 2, 0, Math.asin(12.8 / 110)), bodyMat, 0, 0, -6.8 - 0.75 + 110)
    .rotation.x = -Math.PI / 2;
  // The glass carries the last ramp on and curves flat (the curved edge is see-through, over a black mask).
  const E = corners[4], Ea = steel[steel.length - 1], Eb: P = [E[0] + 1.2, E[1]], edge: P[] = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10, m = (p: P, q: P): P => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    edge.push(m(m(Ea, E), m(E, Eb)));
  }
  const edgeGlass = new THREE.MeshPhysicalMaterial({
    color: '#05090a', metalness: 0.3, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.55, depthWrite: false,
  });
  add(caseG, loft(edge), edgeGlass);
  add(caseG, plate(2.75), new THREE.MeshBasicMaterial({ color: '#000000', toneMapped: false }), 0, 0, 2.1);
  // The polished stroke where steel meets glass.
  add(caseG, new THREE.ShapeGeometry(shapeOf(soft(2.7), soft(3.3))),
    new THREE.MeshPhysicalMaterial({ color: '#e9eceb', metalness: 1, roughness: 0.08 }), 0, 0, 2.165);
  // The camera on the first 33° ramp at the case's top-right corner, which is the diamond's top corner.
  {
    const d = 1.5, c = C - d * (2 - Math.SQRT2), x = W / 2 - d, y = L / 2 - d, k = Math.SQRT1_2;
    lensBlend(caseG, [x - c / 2, y - c / 2, 0.4 + d * T], [-k, k, 0], [0.545 * k, 0.545 * k, 0.839], bodyMat);
  }
  // The edge rail all the way round, and the privacy slider on the side.
  const railCurve = new THREE.CatmullRomCurve3(soft(0).map(([x, y]) => new THREE.Vector3(x, y, -2.2)), true);
  add(caseG, new THREE.TubeGeometry(railCurve, 300, 0.26, 8, true), std({ color: '#0a0f0d', roughness: 0.6 }));
  add(caseG, new RoundedBoxGeometry(1.1, 4.4, 1.8, 2, 0.4), std({ color: '#2a0909', roughness: 0.6 }), W / 2 + 0.35, 8, -2);

  // The front crystal: the screen the scene draws on.
  const screenMat = new THREE.MeshPhysicalMaterial(screenTexture
    ? { color: '#ffffff', map: screenTexture, emissive: '#ffffff', emissiveMap: screenTexture, emissiveIntensity: 1, metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 }
    : { color: '#05090a', metalness: 0.3, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
  const screen = add(rig, crystalGeometry(Eb[0]), screenMat, 0, 0, E[1]);
  screen.name = 'screen';
  // The UV rectangle of the crystal left visible below the button (the button covers UV radius ~0.26 around the
  // centre); the scene draws the heartbeat trace here. Checked against the octagon and the button in the tests.
  screen.userData.visibleUV = { u0: 0.28, v0: 0.14, u1: 0.72, v1: 0.235 };

  // The button through the crystal and its polished ring, square to the diamond.
  add(rig, new THREE.TorusGeometry(7.95, 0.2, 16, 120), metal('#c4ccc8', 0.25), 0, 0, TOP + 0.05);
  add(rig, disc(7.7, 0.9), capMat, 0, 0, TOP + 0.2).name = 'button';

  // 45 light dots near the edge; the three under the camera (top) are left out. Still state: 30 lit.
  const lit: THREE.BufferGeometry[] = [], dim: THREE.BufferGeometry[] = [];
  for (let i = 2; i <= 46; i++) {
    const t = (i * Math.PI) / 24, g = disc(0.3, 0.12);
    g.translate(Math.sin(t) * 12.4, Math.cos(t) * 12.4, E[1] + 0.02);
    (lit.length < 30 ? lit : dim).push(g);
  }
  const dotMat = (intensity: number) => std({ color: pod.off, emissive: GLOW, emissiveIntensity: intensity, roughness: 0.35 });
  [[lit, 1.5], [dim, 0.04]].forEach(([geos, intensity]) => {
    const list = geos as THREE.BufferGeometry[];
    add(rig, mergeGeometries(list), dotMat(intensity as number)).name = 'dots';
    list.forEach(g => g.dispose());
  });

  // The back: the etched spiral, sensor window, two glow LEDs and charging pins (artifact backSide, FZ 7.6, R 10.5).
  const FZ = 7.6, R = 10.5, tex = spiralTexture(pod.ink);
  if (tex) ownedTextures.push(tex);
  const back = add(rig, new THREE.CircleGeometry(R, 96),
    std({ map: tex, transparent: true, opacity: tex ? 1 : 0, roughness: 0.45, depthWrite: false }), 0, 0, -FZ - 0.02);
  back.rotation.y = Math.PI;
  back.name = 'back';
  add(rig, new THREE.CircleGeometry(R * 0.3, 64), smoked(), 0, 0, -FZ - 0.03).rotation.y = Math.PI;
  [-1, 1].forEach(s => {
    add(rig, new THREE.SphereGeometry(0.35, 12, 12), std({ color: '#0a2a20', emissive: GLOW, emissiveIntensity: 0.6 }), s * 0.9, 0, -FZ - 0.05);
    add(rig, disc(0.55, 0.3), metal('#c9a85a', 0.3), s * 1.6, -R * 0.62, -FZ - 0.05);
  });

  // The bail loop at the top corner; the scene runs the cord up from the anchor.
  const cord = new THREE.Group();
  cord.name = 'cord';
  rig.add(cord);
  add(cord, new THREE.TorusGeometry(1.9, 0.55, 16, 48), metal('#c4ccc8', 0.25), 0, TIP + 1.6, LOOP_Z).rotation.y = Math.PI / 2;
  group.userData.anchor = new THREE.Vector3(0, ANCHOR_Y * S, 0);

  const dispose = () => {
    const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
    group.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      geos.add(m.geometry);
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => mats.add(x));
    });
    geos.forEach(g => g.dispose());
    mats.forEach(m => m.dispose());
    ownedTextures.forEach(t => t.dispose());
  };

  return { group, screen, dispose };
}
