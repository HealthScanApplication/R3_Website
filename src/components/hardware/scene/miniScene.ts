/**
 * Pre-order thumbnails: one small three-quarter snapshot each of the R³ Ring, the R³ Clip and the Ring + Clip pair
 * (the ring nested in the bracelet, as in the hero). One short-lived renderer draws all three once and is freed, so the
 * page holds no extra WebGL contexts and no loops. Same models, finish and lighting as the hero (heroScene.ts).
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { frameDistance } from './framing';
import { REST_YAW, nestRing, type Axis } from './nest';
import { loadRetroWatch } from './retroClipModel';
import { RETRO_BPM, drawRetroScreen, type RetroScreenContext } from './retroScreen';
import { loadRing } from './ringModel';

export type MiniKey = 'ring' | 'clip' | 'bundle';
export type MiniShots = Record<MiniKey, string>;

const FOV = 30;
const PX = 128;           // snapshot size; shown at about half that, so it stays sharp on 2x screens
const SCREEN_PX = 200;
const CLIP_YAW = -0.6;      // the watch alone turns its face toward the camera
const BUNDLE_YAW = REST_YAW; // paired, it stays three-quarter so the ring shows inside the bracelet

export async function renderMiniShots(ringUrl: string, clipUrl: string): Promise<MiniShots> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const frees: Array<() => void> = [() => { renderer.dispose(); (renderer as { forceContextLoss?: () => void }).forceContextLoss?.(); }];
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(PX, PX, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = screenCanvas.height = SCREEN_PX;
    const ctx = screenCanvas.getContext('2d') as RetroScreenContext | null;
    if (ctx) drawRetroScreen(ctx, SCREEN_PX, 0, RETRO_BPM, true);
    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    screenTexture.magFilter = THREE.NearestFilter;
    frees.push(() => screenTexture.dispose());

    const [ring, watch] = await Promise.all([loadRing(ringUrl), loadRetroWatch(clipUrl, { screenTexture })]);
    frees.push(() => { ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); watch.dispose(); });

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    frees.push(() => pmrem.dispose());
    const room = new RoomEnvironment();
    const envTarget = pmrem.fromScene(room, 0.04);
    room.dispose();
    frees.push(() => envTarget.dispose());
    scene.environment = envTarget.texture;
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 3, 4);
    scene.add(key);

    // The watch, one unit tall, hole centre on the origin, in its resting three-quarter view.
    watch.group.updateMatrixWorld(true);
    const watchBox = new THREE.Box3().setFromObject(watch.group, true);
    const k = 1 / Math.max(1e-6, watchBox.max.y - watchBox.min.y);
    const hole = watch.group.userData.hole as THREE.Box3;
    const holeAxis = (watch.group.userData.holeAxis as Axis | undefined) ?? 'x';
    watch.group.scale.setScalar(k);
    watch.group.position.copy(hole.getCenter(new THREE.Vector3())).multiplyScalar(-k);
    const watchTurn = new THREE.Group();
    watchTurn.rotation.y = CLIP_YAW;
    watchTurn.add(watch.group);

    // The ring nested inside the bracelet loop (same maths as the hero).
    ring.geometry.computeBoundingBox();
    const nest = nestRing(hole, ring.geometry.boundingBox!, holeAxis, 'y');
    const nestedMesh = new THREE.Mesh(ring.geometry, ring.material);
    if (holeAxis === 'x') nestedMesh.rotation.set(0, 0, -Math.PI / 2);
    else if (holeAxis === 'z') nestedMesh.rotation.set(Math.PI / 2, 0, 0);
    const nestedHolder = new THREE.Group();
    nestedHolder.scale.setScalar(nest.scale * k);
    nestedHolder.rotation.y = BUNDLE_YAW;
    nestedHolder.add(nestedMesh);

    // The ring on its own: its hole turned toward the camera so it reads as a ring.
    const soloMesh = new THREE.Mesh(ring.geometry, ring.material);
    soloMesh.rotation.set(1.05, 0.35, 0.2);

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
    const shoot = (root: THREE.Object3D): string => {
      scene.add(root);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root, true);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const d = frameDistance({ x: size.x, y: size.y, z: size.z }, 1, FOV, 1.08);
      camera.position.set(centre.x, centre.y + Math.sin(0.09) * d, centre.z + Math.cos(0.09) * d);
      camera.far = d + 10;
      camera.lookAt(centre);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png'); // read straight after the draw, before the buffer clears
      scene.remove(root);
      return url;
    };

    const ringOnly = new THREE.Group(); ringOnly.add(soloMesh);
    const clipOnly = new THREE.Group(); clipOnly.add(watchTurn);
    const shots: MiniShots = { ring: shoot(ringOnly), clip: shoot(clipOnly), bundle: '' };
    watchTurn.rotation.y = BUNDLE_YAW;
    const pair = new THREE.Group(); pair.add(watchTurn); pair.add(nestedHolder);
    shots.bundle = shoot(pair);
    return shots;
  } finally {
    while (frees.length) try { frees.pop()!(); } catch { /* keep freeing */ }
  }
}
