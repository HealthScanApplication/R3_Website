/**
 * The /ring hero scene: the owner's R³ Note resting on the left, the R³ Retro necklace (the measured retro watch head
 * turned 45° as a diamond) hanging from its chain on the right, its e-paper screen showing a beating pixel heart.
 * One renderer, one rAF loop that this module owns (paused off-screen or when the
 * tab is hidden, never started for auto-motion under reduced motion), full disposal. Camera framing lives in
 * framing.ts and the contact shadow in shadowBlob.ts.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { necklacePose } from './flip';
import { frameDistance } from './framing';
import { loadRetroClip, type ClipModel } from './retroClipModel';
import { RETRO_BPM, drawRetroScreen, type RetroScreenContext } from './retroScreen';
import { loadRing } from './ringModel';
import { createShadowBlob } from './shadowBlob';

export type HeroSceneOptions = { ringUrl: string; clipUrl?: string; reducedMotion: boolean; onReady?: () => void };
export const CLIP_URL = '/models/r3-clip-retro.bin';
export type HeroSceneHandle = { dispose(): void };

// ---- The clip's screen texture (the R³ Retro necklace screen, retroScreen.ts) ----
export const SCREEN_PX = 200;
const BPM = RETRO_BPM;

// ---- Layout (world units) ----
const FOV = 32;
const ELEVATION = THREE.MathUtils.degToRad(5);       // the camera looks very slightly down
const CLIP_HEIGHT = 1;                               // the clip is scaled to this height (precise box)
const RING_SIZE = 0.55 * CLIP_HEIGHT;                // the ring's largest dimension: ~0.55 of the clip
const CLIP_CENTRE = new THREE.Vector3(0.28, 0.08, 0);
const RING_CENTRE = new THREE.Vector3(-0.42, -0.36, 0.3);
const FAR_MARGIN = 24;                               // the chain runs far up out of frame
const SPIN_RATE = 0.25;                              // rad/s, the ring about its own vertical axis
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
  // The heartbeat canvas is made first so the clip can load (in parallel with the ring) straight onto it.
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = screenCanvas.height = SCREEN_PX;
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.magFilter = THREE.NearestFilter;   // crisp e-paper pixels
  cleanups.push(() => screenTexture.dispose());
  const ringPromise = loadRing(options.ringUrl);
  const clipPromise = loadRetroClip(options.clipUrl ?? CLIP_URL, { screenTexture });
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
    const clipModel = clip;
    cleanups.push(() => clipModel.dispose());

    // rig (drag) > content (centred on the composition) > ring holder / shadow / clip pivot (with its chain).
    const rig = new THREE.Group();
    rig.name = 'rig';
    const content = new THREE.Group();
    rig.add(content);
    scene.add(rig);

    // Size the clip with the PRECISE box of the head alone (the chain runs up out of frame), then hang it from a
    // pivot at its chain anchor so the flip and swing turn about the anchor.
    const chain = clip.group.getObjectByName('chain');
    const chainParent = chain?.parent ?? null;
    if (chain) chain.removeFromParent();
    clip.group.updateMatrixWorld(true);
    const clipBox = new THREE.Box3().setFromObject(clip.group, true);
    if (chain && chainParent) chainParent.add(chain);
    const clipScale = CLIP_HEIGHT / Math.max(1e-6, clipBox.max.y - clipBox.min.y);
    const anchor = (clip.group.userData.anchor as THREE.Vector3).clone().multiplyScalar(clipScale);
    clip.group.scale.setScalar(clipScale);
    clip.group.position.copy(anchor).negate();
    const pivot = new THREE.Group();
    pivot.name = 'clipPivot';
    pivot.position.copy(CLIP_CENTRE).add(anchor).sub(clipBox.getCenter(new THREE.Vector3()).multiplyScalar(clipScale));
    pivot.add(clip.group);
    content.add(pivot);
    ring = await ringPromise;
    const ringMesh = ring;
    cleanups.push(() => { ringMesh.geometry.dispose(); (ringMesh.material as THREE.Material).dispose(); });
    // The model's ring axis is its Y (thin) axis: rotation.x = +90° turns model +Y to world +Z, so the ring stands
    // up with its finger hole facing the camera. The tilt group then leans the top 25° toward the viewer (we look
    // slightly down through the hole) and turns it -20° on Y to show the band's depth; the spin group turns it
    // about its own vertical axis.
    ringMesh.rotation.set(Math.PI / 2, 0, 0);
    const spin = new THREE.Group();
    spin.add(ringMesh);
    const tilt = new THREE.Group();
    tilt.rotation.set(THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(-20), 0);
    tilt.add(spin);
    const ringHolder = new THREE.Group();
    ringHolder.position.copy(RING_CENTRE);
    ringHolder.scale.setScalar(RING_SIZE);
    ringHolder.add(tilt);
    content.add(ringHolder);
    content.updateMatrixWorld(true);
    const ringBox = new THREE.Box3().setFromObject(ringHolder, true);
    const shadow = createShadowBlob(RING_SIZE * 1.15, RING_SIZE * 0.42, 0.5);
    cleanups.push(() => shadow.dispose());
    shadow.mesh.position.set(RING_CENTRE.x, ringBox.min.y - 0.004, RING_CENTRE.z);
    content.add(shadow.mesh);
    // Centre the composition (ring + clip at rest, not the chain) on the rig's origin and frame it.
    if (chain) chain.removeFromParent();
    content.updateMatrixWorld(true);
    const comp = ringBox.clone().union(new THREE.Box3().setFromObject(pivot, true));
    if (chain && chainParent) chainParent.add(chain);
    const compSize = comp.getSize(new THREE.Vector3());
    content.position.copy(comp.getCenter(new THREE.Vector3())).negate();

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
    const resize = () => {
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const d = frameDistance(compSize, camera.aspect, FOV);
      camera.position.set(0, Math.sin(ELEVATION) * d, Math.cos(ELEVATION) * d);
      camera.far = d + FAR_MARGIN;
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
      const k = 1 - Math.exp(-(dragging ? DRAG_RATE : RETURN_RATE) * dt);
      yaw += (targetYaw - yaw) * k;
      pitch += (targetPitch - pitch) * k;
      if (settled()) { yaw = targetYaw; pitch = targetPitch; }
      rig.rotation.set(pitch, yaw, 0);
      const pose = necklacePose(elapsed, reducedMotion);
      pivot.rotation.y = pose.yaw;
      pivot.rotation.z = pose.swing;
      spin.rotation.y = (elapsed * SPIN_RATE) % (Math.PI * 2);
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
