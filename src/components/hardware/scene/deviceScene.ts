/**
 * One R³ device on its own, for the "Two devices, one routine" cards: the R³ Note ring or the R³ Retro watch (its
 * screen showing the beating pixel heart), centred and framed, in a finish from finishes.ts that `setFinish`
 * changes in place (materials and the screen's inks only, never a new download or parse).
 *
 * Motion: the ring turns continuously like a turntable about the vertical axis; the watch swings in an eased yaw
 * about a three-quarter view (the hero's off-axis idea, nest.ts), never straight on, edge-on or back-on, so the
 * screen stays in view. Drag turns the rig and it eases back. One renderer, one rAF loop this module owns, paused
 * off-screen or when the tab is hidden; under reduced motion a static three-quarter view and a static heartbeat
 * frame. Full disposal (renderer, PMREM and its target, screen texture, models, shadow, listeners, observers).
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { finishSpec, type Finish } from './finishes';
import { frameDistance } from './framing';
import { applyWatchFinish, loadRetroWatch, type ClipModel } from './retroClipModel';
import { RETRO_BPM, drawRetroScreen, type RetroScreenContext } from './retroScreen';
import { applyRingFinish, loadRing } from './ringModel';
import { createShadowBlob } from './shadowBlob';

export type Device = 'ring' | 'watch';
export type DeviceSceneOptions = {
  device: Device;
  finish: Finish;
  reducedMotion: boolean;
  onReady?: () => void;
  ringUrl?: string;
  clipUrl?: string;
};
export type DeviceSceneHandle = { setFinish(f: Finish): void; dispose(): void };
export const RING_URL = '/models/r3-ring.stl';
export const CLIP_URL = '/models/r3-clip-watch.bin';   // the same model as heroScene.ts

// ---- Motion ----
/** Ring: turntable rate (rad/s) and its resting three-quarter yaw. The ring stands with its hole axis horizontal. */
export const RING_TURN_RATE = 0.45;
export const RING_REST_YAW = -0.75;
/** Watch: eased swing about a three-quarter view; it stays between WATCH_MIN_OFF and WATCH_MAX_OFF rad off axis. */
export const WATCH_REST_YAW = -0.55;
export const WATCH_SWING = 0.35;
export const WATCH_PERIOD = 10;
export const WATCH_MIN_OFF = Math.abs(WATCH_REST_YAW) - WATCH_SWING;
export const WATCH_MAX_OFF = Math.abs(WATCH_REST_YAW) + WATCH_SWING;

export function deviceWatchYaw(t: number, reducedMotion: boolean): number {
  if (reducedMotion) return WATCH_REST_YAW;
  return WATCH_REST_YAW + WATCH_SWING * Math.sin((2 * Math.PI * t) / WATCH_PERIOD);
}
export function deviceRingYaw(t: number, reducedMotion: boolean): number {
  if (reducedMotion) return RING_REST_YAW;
  return RING_REST_YAW + ((t * RING_TURN_RATE) % (Math.PI * 2));
}

// ---- Layout ----
export const SCREEN_PX = 200;
const FOV = 30;
const ELEVATION = THREE.MathUtils.degToRad(8);
const RING_TILT = THREE.MathUtils.degToRad(-12);     // the standing ring leans back a little, so the hole reads
const MAX_YAW = 0.6, MAX_PITCH = 0.25, DRAG_RATE = 12, RETURN_RATE = 4;
const TEXTURE_FPS = 30;
const clamp = (v: number, m: number) => Math.min(m, Math.max(-m, v));

export async function createDeviceScene(container: HTMLElement, options: DeviceSceneOptions): Promise<DeviceSceneHandle> {
  const { device, reducedMotion } = options;
  let finish = options.finish;
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
  renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  canvas.setAttribute('style', 'width:100%;height:100%;display:block;touch-action:pan-y');
  container.appendChild(canvas);
  cleanups.push(() => canvas.remove());

  // The watch's heartbeat screen (only the watch has one).
  let screenTexture: THREE.CanvasTexture | null = null, ctx: RetroScreenContext | null = null;
  if (device === 'watch') {
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = screenCanvas.height = SCREEN_PX;
    const tex = new THREE.CanvasTexture(screenCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    cleanups.push(() => tex.dispose());
    screenTexture = tex;
    ctx = screenCanvas.getContext('2d') as RetroScreenContext | null;
  }
  const paint = (t: number) => {
    if (!ctx || !screenTexture) return;
    drawRetroScreen(ctx, SCREEN_PX, t, RETRO_BPM, reducedMotion, finishSpec(finish).screen);
    screenTexture.needsUpdate = true;
  };

  let ring: THREE.Mesh | null = null, clip: ClipModel | null = null;
  const modelPromise: Promise<THREE.Mesh | ClipModel> = device === 'ring'
    ? loadRing(options.ringUrl ?? RING_URL, finish)
    : loadRetroWatch(options.clipUrl ?? CLIP_URL, { screenTexture: screenTexture!, finish });
  modelPromise.catch(() => {});
  try {
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
    paint(0);

    // rig (drag) > turn (turntable / swing) > the device, centred on the origin; plus the contact shadow.
    const rig = new THREE.Group();
    rig.name = 'rig';
    scene.add(rig);
    const turn = new THREE.Group();
    turn.name = 'deviceTurn';
    rig.add(turn);

    const model = await modelPromise;
    let object: THREE.Object3D;
    if (device === 'ring') {
      const mesh = model as THREE.Mesh;
      ring = mesh;
      cleanups.push(() => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); });
      // The ring's hole axis is model Y: stand it up (hole axis along X) and lean it back a touch.
      const stand = new THREE.Group();
      stand.name = 'ringStand';
      mesh.rotation.set(0, 0, -Math.PI / 2);
      stand.rotation.x = RING_TILT;
      stand.add(mesh);
      object = stand;
    } else {
      const watch = model as ClipModel;
      clip = watch;
      cleanups.push(() => watch.dispose());
      object = watch.group;
    }
    // Unit height, centred on the origin by its precise box.
    object.updateMatrixWorld(true);
    const raw = new THREE.Box3().setFromObject(object, true);
    const k = 1 / Math.max(1e-6, raw.max.y - raw.min.y);
    object.scale.multiplyScalar(k);
    object.position.copy(raw.getCenter(new THREE.Vector3())).multiplyScalar(-k);
    turn.add(object);

    // Frame what the device sweeps as it turns: a cylinder about the vertical axis through the origin.
    turn.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object, true);
    let reach = 0;
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) reach = Math.max(reach, Math.hypot(x, z));
    const halfY = Math.max(Math.abs(box.min.y), Math.abs(box.max.y));
    const compSize = { x: 2 * reach, y: 2 * halfY, z: 2 * reach };
    const shadow = createShadowBlob(reach * 1.5, reach * 0.6, 0.35);
    cleanups.push(() => shadow.dispose());
    shadow.mesh.position.set(0, box.min.y - 0.01, 0);
    rig.add(shadow.mesh);

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
    const resize = () => {
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const d = frameDistance(compSize, camera.aspect, FOV);
      camera.position.set(0, Math.sin(ELEVATION) * d, Math.cos(ELEVATION) * d);
      camera.far = d + 10;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };
    resize();

    // ---- Loop, motion and interaction ----
    let inView = true, ready = false, dragging = false, lastNow = -1, elapsed = 0, lastPaint = 0;
    let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0, startX = 0, startY = 0, startYaw = 0, startPitch = 0;
    const pageVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const settled = () => !dragging && Math.abs(yaw - targetYaw) < 1e-4 && Math.abs(pitch - targetPitch) < 1e-4;
    const request = () => { if (!rafId && !disposed) rafId = requestAnimationFrame(frame); };
    function frame(now: number) {
      rafId = 0;
      if (disposed) return;
      const dt = lastNow < 0 ? 0 : Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;
      if (!reducedMotion) elapsed += dt;
      const ease = 1 - Math.exp(-(dragging ? DRAG_RATE : RETURN_RATE) * dt);
      yaw += (targetYaw - yaw) * ease;
      pitch += (targetPitch - pitch) * ease;
      if (settled()) { yaw = targetYaw; pitch = targetPitch; }
      rig.rotation.set(pitch, yaw, 0);
      turn.rotation.y = device === 'ring' ? deviceRingYaw(elapsed, reducedMotion) : deviceWatchYaw(elapsed, reducedMotion);
      if (!reducedMotion && elapsed - lastPaint >= 1 / TEXTURE_FPS) { paint(elapsed); lastPaint = elapsed; }
      renderer.render(scene, camera);
      if (!ready) { ready = true; try { options.onReady?.(); } catch { /* a throwing callback must not stop the loop */ } }
      if (inView && pageVisible() && (!reducedMotion || !settled())) request();
    }

    const onDown = (e: PointerEvent) => {
      dragging = true;
      startX = e.clientX; startY = e.clientY; startYaw = yaw; startPitch = pitch;
      try { canvas.setPointerCapture?.(e.pointerId); } catch { /* capture is a nicety */ }
      request();
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      targetYaw = clamp(startYaw + ((e.clientX - startX) / w) * 1.6, MAX_YAW);
      targetPitch = clamp(startPitch + ((e.clientY - startY) / h) * 0.8, MAX_PITCH);
      request();
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      targetYaw = 0; targetPitch = 0;
      try { canvas.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
      request();
    };
    const pointer: Array<[string, (e: PointerEvent) => void]> = [
      ['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp], ['lostpointercapture', onUp],
    ];
    pointer.forEach(([type, fn]) => canvas.addEventListener(type, fn as EventListener));
    cleanups.push(() => pointer.forEach(([type, fn]) => canvas.removeEventListener(type, fn as EventListener)));
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

    const setFinish = (f: Finish) => {
      if (disposed || f === finish) return;
      finish = f;
      if (ring) applyRingFinish(ring, f);
      if (clip) applyWatchFinish(clip, f);
      paint(elapsed);
      request(); // one frame shows it, even when the loop is idle under reduced motion
    };
    request(); // the first frame always renders (it fires onReady)
    return { setFinish, dispose: disposeAll };
  } catch (err) {
    if (!ring && !clip) modelPromise.then(m => {
      if ('group' in m) m.dispose();
      else { const mesh = m as THREE.Mesh; mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    }, () => {});
    disposeAll();
    throw err;
  }
}
