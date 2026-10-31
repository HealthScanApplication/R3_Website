/**
 * One way to wear the R³ Clip, for the "One clip, three ways to wear it" cards: the R³ Retro watch in Black (its
 * screen showing the beating pixel heart) as a WATCH on its bracelet, on a CAP's bill, or on a NECKLACE chain
 * (wearModels.ts). Follows deviceScene.ts: one renderer and one rAF loop per card, the same environment light and
 * key light, framing by `frameDistance` on what the rig sweeps as it swings, a contact shadow under the watch, paused
 * off-screen or when the tab is hidden, and full disposal.
 *
 * Motion: the rig swings in deviceScene's eased three-quarter yaw (`deviceWatchYaw`), so the screen stays in view;
 * the cap swings less and nearer front-on (`capYaw`), and its hinge swings slowly about its "looking ahead" stop. Reduced motion: one static three-quarter
 * view, the hinge at rest and a static heartbeat frame. No drag (the cards are pictures, not controls).
 *
 * The model file is fetched once per URL and shared by the three cards (each builds its own meshes from it).
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CLIP_URL, deviceWatchYaw } from './deviceScene';
import { finishSpec, type Finish } from './finishes';
import { frameDistance } from './framing';
import { buildRetroWatch, type ClipModel } from './retroClipModel';
import { RETRO_BPM, drawRetroScreen, type RetroScreenContext } from './retroScreen';
import { createShadowBlob } from './shadowBlob';
import { buildCapClip, buildNecklace, capHingeAngle, capYaw, disposeTree, type WearModeId } from './wearModels';

export type WearSceneOptions = { mode: WearModeId; reducedMotion: boolean; onReady?: () => void; clipUrl?: string };
export type WearSceneHandle = { dispose(): void };
export const WEAR_FINISH: Finish = 'black';

const SCREEN_PX = 200;
const FOV = 30;
const TEXTURE_FPS = 30;
/** Camera elevation per mode: a touch above the watch, level with the pendant, a touch below the cap's bill. */
const ELEVATION: Record<WearModeId, number> = { watch: 8, necklace: 4, clip: -6 };
/** Framing margin per mode (frameDistance's default is 1.15). */
export const WEAR_MARGIN: Record<WearModeId, number> = { watch: 1.0, necklace: 1.05, clip: 1.0 };
/** How much of the chain shows above the pendant (mm); the rest runs out of the frame. */
export const NECKLACE_CHAIN_SHOWN = 20;
/** The part of the cap in frame (mm, cap coordinates): enough crown to read as a cap, the bill, the clip and the head. */
const CAP_FRAME = new THREE.Box3(new THREE.Vector3(-44, -70, 10), new THREE.Vector3(44, 26, 104));

const bytesCache = new Map<string, Promise<ArrayBuffer>>();
/** Fetch the model once per URL; a failed request is forgotten so a later card can retry. */
export function fetchWatchBytes(url: string): Promise<ArrayBuffer> {
  let p = bytesCache.get(url);
  if (!p) {
    p = fetch(url).then(async res => {
      if (!res.ok) throw new Error(`Watch model request failed: status ${res.status} for ${url}`);
      const bytes = await res.arrayBuffer();
      if (!bytes || bytes.byteLength < 8) throw new Error(`Watch model response was empty (status ${res.status}) for ${url}`);
      return bytes;
    });
    p.catch(() => bytesCache.delete(url));
    bytesCache.set(url, p);
  }
  return p;
}

/** Build the worn device for `mode` (in millimetres) and the box the camera frames, in the same space. */
export function buildWear(bytes: ArrayBuffer, mode: WearModeId, screenTexture: THREE.Texture): {
  object: THREE.Object3D; frame: THREE.Box3; hinge: THREE.Group | null; model: ClipModel;
} {
  const model = buildRetroWatch(bytes, { screenTexture, finish: WEAR_FINISH, headOnly: mode !== 'watch' });
  if (mode === 'watch') {
    model.group.updateMatrixWorld(true);
    return { object: model.group, frame: new THREE.Box3().setFromObject(model.group, true), hinge: null, model };
  }
  if (mode === 'necklace') {
    const necklace = buildNecklace(model.group);
    necklace.updateMatrixWorld(true);
    const frame = new THREE.Box3().setFromObject(model.group, true);
    frame.max.y += NECKLACE_CHAIN_SHOWN;
    return { object: necklace, frame, hinge: null, model };
  }
  const { group, hinge } = buildCapClip(model.group);
  return { object: group, frame: CAP_FRAME.clone(), hinge, model };
}

export async function createWearScene(container: HTMLElement, options: WearSceneOptions): Promise<WearSceneHandle> {
  const { mode, reducedMotion } = options;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
  } catch (err) {
    throw new Error(`WebGL unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
  const cleanups: Array<() => void> = [];
  let disposed = false, rafId = 0;
  const disposeAll = () => {
    if (disposed) return;
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    while (cleanups.length) try { cleanups.pop()!(); } catch { /* keep going */ }
  };
  cleanups.push(() => { renderer.dispose(); (renderer as { forceContextLoss?: () => void }).forceContextLoss?.(); });
  try {
    renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const canvas = renderer.domElement;
    canvas.setAttribute('style', 'width:100%;height:100%;display:block');
    container.appendChild(canvas);
    cleanups.push(() => canvas.remove());

    // The heartbeat screen (drawn for a diamond: the heart leans and the readout runs along the upper-right edge).
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = screenCanvas.height = SCREEN_PX;
    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    screenTexture.magFilter = THREE.NearestFilter;
    cleanups.push(() => screenTexture.dispose());
    const ctx = screenCanvas.getContext('2d') as RetroScreenContext | null;
    const paint = (t: number) => {
      if (!ctx) return;
      drawRetroScreen(ctx, SCREEN_PX, t, RETRO_BPM, reducedMotion, finishSpec(WEAR_FINISH).screen);
      screenTexture.needsUpdate = true;
    };
    paint(0);

    const bytes = await fetchWatchBytes(options.clipUrl ?? CLIP_URL);
    if (disposed) throw new Error('disposed');

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    cleanups.push(() => pmrem.dispose());
    const room = new RoomEnvironment();
    const envTarget = pmrem.fromScene(room, 0.04);
    room.dispose();
    cleanups.push(() => envTarget.dispose());
    scene.environment = envTarget.texture;
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 3, 4);
    scene.add(key);
    cleanups.push(() => key.dispose());

    // rig (the swing) > the worn device, its frame box centred on the origin.
    const rig = new THREE.Group();
    rig.name = 'rig';
    scene.add(rig);
    const built = buildWear(bytes, mode, screenTexture);
    cleanups.push(() => { built.model.dispose(); disposeTree(built.object); });
    const centre = built.frame.getCenter(new THREE.Vector3());
    built.object.position.sub(centre);
    rig.add(built.object);

    // Frame what the box sweeps as the rig swings: a cylinder about the vertical axis through the origin.
    const box = built.frame.clone().translate(centre.clone().negate());
    let reach = 0;
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) reach = Math.max(reach, Math.hypot(x, z));
    const halfY = Math.max(Math.abs(box.min.y), Math.abs(box.max.y));
    // The swing never turns the rig past ~0.9 rad, so the full cylinder over-frames; use the box's widest turned width.
    const compSize = { x: 2 * Math.min(reach, Math.max(box.max.x - box.min.x, box.max.z - box.min.z)), y: 2 * halfY, z: 2 * reach };
    if (mode === 'watch') {
      const shadow = createShadowBlob(reach * 1.5, reach * 0.6, 0.35);
      cleanups.push(() => shadow.dispose());
      shadow.mesh.position.set(0, box.min.y - 0.5, 0);
      rig.add(shadow.mesh);
    }

    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 2000);
    const elevation = THREE.MathUtils.degToRad(ELEVATION[mode]);
    const resize = () => {
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const d = frameDistance(compSize, camera.aspect, FOV, WEAR_MARGIN[mode]);
      camera.position.set(0, Math.sin(elevation) * d, Math.cos(elevation) * d);
      camera.near = Math.max(0.5, d / 100);
      camera.far = d + 1000;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };
    resize();

    let inView = true, ready = false, lastNow = -1, elapsed = 0, lastPaint = 0;
    const pageVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const request = () => { if (!rafId && !disposed) rafId = requestAnimationFrame(frame); };
    function frame(now: number) {
      rafId = 0;
      if (disposed) return;
      const dt = lastNow < 0 ? 0 : Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;
      if (!reducedMotion) elapsed += dt;
      rig.rotation.y = mode === 'clip' ? capYaw(elapsed, reducedMotion) : deviceWatchYaw(elapsed, reducedMotion);
      if (built.hinge) built.hinge.rotation.x = capHingeAngle(elapsed, reducedMotion);
      if (!reducedMotion && elapsed - lastPaint >= 1 / TEXTURE_FPS) { paint(elapsed); lastPaint = elapsed; }
      renderer.render(scene, camera);
      if (!ready) { ready = true; try { options.onReady?.(); } catch { /* a throwing callback must not stop the loop */ } }
      if (inView && pageVisible() && !reducedMotion) request();
    }

    const onVisibility = () => { if (pageVisible() && inView) request(); };
    document.addEventListener('visibilitychange', onVisibility);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
    const onResize = () => { resize(); request(); };
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(onResize);
      ro.observe(container);
      cleanups.push(() => ro.disconnect());
    } else {
      window.addEventListener('resize', onResize);
      cleanups.push(() => window.removeEventListener('resize', onResize));
    }
    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(entries => {
        inView = entries.some(en => en.isIntersecting);
        if (inView && pageVisible()) request();
      });
      io.observe(container);
      cleanups.push(() => io.disconnect());
    }
    request(); // the first frame always renders (it fires onReady)
    return { dispose: disposeAll };
  } catch (err) {
    disposeAll();
    throw err;
  }
}
