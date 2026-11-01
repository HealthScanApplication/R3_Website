/**
 * The /wearables hero scene: "rings in the same centre". The R³ Retro watch (the full measured retro watch on its closed
 * link bracelet, its e-paper screen showing a beating pixel heart) stands upright, and the R³ Ring ring floats INSIDE
 * the bracelet's loop, concentric with it: both hole axes aligned at rest and both centred on one point, which is
 * the scene origin the camera looks at (so it sits at the vertical middle of the devices container). The watch
 * swings in an eased yaw about its three-quarter view (never straight on, so the ring stays visible); the ring turns slowly like a turntable inside it and
 * counter-rotates about its own hole axis. One renderer, one rAF loop that this module owns (paused off-screen or
 * when the tab is hidden, never started for auto-motion under reduced motion, which shows a static three-quarter
 * view), full disposal. Pure pieces: nest.ts (concentric sizing, yaw), framing.ts (camera), shadowBlob.ts.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { frameDistance } from './framing';
import { REST_YAW, nestRing, watchYaw, type Axis } from './nest';
import { loadRetroWatch, type ClipModel } from './retroClipModel';
import { RETRO_BPM, drawRetroScreen, type RetroScreenContext } from './retroScreen';
import { loadRing } from './ringModel';
import { createShadowBlob } from './shadowBlob';

export type HeroSceneOptions = { ringUrl: string; clipUrl?: string; reducedMotion: boolean; onReady?: () => void };
export const CLIP_URL = '/models/r3-clip-watch.bin';
export type HeroSceneHandle = { dispose(): void };

// ---- The watch's screen texture (the heartbeat, retroScreen.ts) ----
export const SCREEN_PX = 200;
const BPM = RETRO_BPM;

// ---- Layout (world units) ----
const FOV = 32;
const ELEVATION = THREE.MathUtils.degToRad(5);       // the camera looks very slightly down
const WATCH_HEIGHT = 1;                              // the watch (bracelet loop included) is scaled to this height
export const RING_TURN_RATE = 0.35;                  // rad/s, the ring's turntable turn about the vertical axis
export const RING_SPIN_RATE = 0.25;                  // rad/s, the ring's counter-rotation about its own hole axis
const MAX_YAW = 0.6, MAX_PITCH = 0.25, DRAG_RATE = 12, RETURN_RATE = 4; // drag limits and damping (1/s)
const TEXTURE_FPS = 30;
const clamp = (v: number, m: number) => Math.min(m, Math.max(-m, v));

export async function createHeroScene(container: HTMLElement, options: HeroSceneOptions): Promise<HeroSceneHandle> {
  const { reducedMotion } = options;
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
    // Free in reverse order; one failing free must not leak the rest.
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

  let ring: THREE.Mesh | null = null, clip: ClipModel | null = null;
  // The heartbeat canvas is made first so the watch can load (in parallel with the ring) straight onto it.
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = screenCanvas.height = SCREEN_PX;
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.magFilter = THREE.NearestFilter;   // crisp e-paper pixels
  cleanups.push(() => screenTexture.dispose());
  const ringPromise = loadRing(options.ringUrl);
  const clipPromise = loadRetroWatch(options.clipUrl ?? CLIP_URL, { screenTexture });
  // Whichever loads, it is freed if the scene fails part-way (handled below once awaited).
  ringPromise.catch(() => {});
  clipPromise.catch(() => {});
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

    const ctx = screenCanvas.getContext('2d') as RetroScreenContext | null;
    const paint = (t: number) => {
      if (!ctx) return;
      drawRetroScreen(ctx, SCREEN_PX, t, BPM, reducedMotion);
      screenTexture.needsUpdate = true;
    };
    paint(0);
    clip = await clipPromise;
    const watch = clip;
    cleanups.push(() => watch.dispose());

    // rig (drag) > content (origin = the common centre) > watchTurn (eased yaw) > watch, and ringHolder (turntable)
    // > ringSpin (own hole axis) > ring, plus the contact shadow.
    const rig = new THREE.Group();
    rig.name = 'rig';
    const content = new THREE.Group();
    content.name = 'content';
    rig.add(content);
    scene.add(rig);

    // Size the watch by its PRECISE box, then put the bracelet's hole centre on the origin.
    watch.group.updateMatrixWorld(true);
    const watchBox = new THREE.Box3().setFromObject(watch.group, true);
    const k = WATCH_HEIGHT / Math.max(1e-6, watchBox.max.y - watchBox.min.y);
    const hole = watch.group.userData.hole as THREE.Box3;
    const holeAxis = (watch.group.userData.holeAxis as Axis | undefined) ?? 'x';
    watch.group.scale.setScalar(k);
    watch.group.position.copy(hole.getCenter(new THREE.Vector3())).multiplyScalar(-k);
    const watchTurn = new THREE.Group();
    watchTurn.name = 'watchTurn';
    watchTurn.add(watch.group);
    content.add(watchTurn);

    ring = await ringPromise;
    const ringMesh = ring;
    cleanups.push(() => { ringMesh.geometry.dispose(); (ringMesh.material as THREE.Material).dispose(); });
    // The ring model's hole axis is its Y axis; turn it onto the bracelet's hole axis (model +Y -> +X for 'x').
    if (!ringMesh.geometry.boundingBox) ringMesh.geometry.computeBoundingBox();
    const nest = nestRing(hole, ringMesh.geometry.boundingBox!, holeAxis, 'y');
    if (holeAxis === 'x') ringMesh.rotation.set(0, 0, -Math.PI / 2);
    else if (holeAxis === 'z') ringMesh.rotation.set(Math.PI / 2, 0, 0);
    else ringMesh.rotation.set(0, 0, 0);
    const ringSpin = new THREE.Group();
    ringSpin.name = 'ringSpin';
    ringSpin.add(ringMesh);
    const ringHolder = new THREE.Group();
    ringHolder.name = 'ringHolder';
    ringHolder.scale.setScalar(nest.scale * k);
    ringHolder.add(ringSpin);
    content.add(ringHolder);
    const spinAxis = new THREE.Vector3(holeAxis === 'x' ? 1 : 0, holeAxis === 'y' ? 1 : 0, holeAxis === 'z' ? 1 : 0);

    // Frame what the watch sweeps through its yaw: a cylinder about the vertical axis through the common centre.
    content.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(watchTurn, true);
    let reach = 0;
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) reach = Math.max(reach, Math.hypot(x, z));
    const halfY = Math.max(Math.abs(box.min.y), Math.abs(box.max.y));
    const compSize = { x: 2 * reach, y: 2 * halfY, z: 2 * reach };
    const shadow = createShadowBlob(reach * 1.6, reach * 0.7, 0.4);
    cleanups.push(() => shadow.dispose());
    shadow.mesh.position.set(0, box.min.y - 0.01, 0);
    content.add(shadow.mesh);

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
      watchTurn.rotation.y = watchYaw(elapsed, reducedMotion);
      ringHolder.rotation.y = REST_YAW + ((elapsed * RING_TURN_RATE) % (Math.PI * 2));
      ringSpin.setRotationFromAxisAngle(spinAxis, -((elapsed * RING_SPIN_RATE) % (Math.PI * 2)));
      if (!reducedMotion && elapsed - lastPaint >= 1 / TEXTURE_FPS) { paint(elapsed); lastPaint = elapsed; }
      renderer.render(scene, camera);
      if (!ready) { ready = true; try { options.onReady?.(); } catch { /* a throwing callback must not stop the loop */ } }
      // Auto-motion keeps the loop alive; under reduced motion only a drag (and its ease back) does.
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
    request(); // the first frame always renders (it fires onReady)
    return { dispose: disposeAll };
  } catch (err) {
    if (!ring) ringPromise.then(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }, () => {});
    if (!clip) clipPromise.then(c => c.dispose(), () => {});
    disposeAll();
    throw err;
  }
}
