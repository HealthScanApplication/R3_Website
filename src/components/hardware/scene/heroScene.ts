/**
 * The /ring hero scene: the owner's R³ Note resting on the left, the R³ Clip hanging on a cord on the right, its
 * crystal showing a live heartbeat. One renderer, one rAF loop that this module owns (paused off-screen or when the
 * tab is hidden, never started for auto-motion under reduced motion), full disposal. Camera framing lives in
 * framing.ts and the contact shadow in shadowBlob.ts.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildClip } from './clipModel';
import { necklacePose } from './flip';
import { frameDistance } from './framing';
import { beatPhaseAt, heartbeatPoints, heartbeatY } from './heartbeat';
import { loadRing } from './ringModel';
import { createShadowBlob } from './shadowBlob';

export type HeroSceneOptions = { ringUrl: string; reducedMotion: boolean; onReady?: () => void };
export type HeroSceneHandle = { dispose(): void };

// ---- The clip's screen texture (256 px canvas; CanvasTexture flipY, so canvas y = (1 - v) × 256) ----
export type VisibleUV = { u0: number; v0: number; u1: number; v1: number };
export type ScreenFrame = { scroll: number; pulse: number };
export type ScreenContext = Pick<CanvasRenderingContext2D,
  'fillStyle' | 'strokeStyle' | 'lineWidth' | 'lineJoin' | 'lineCap' | 'globalAlpha' | 'shadowBlur' | 'shadowColor'
  | 'save' | 'restore' | 'fillRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'arc' | 'stroke'>;

export const SCREEN_PX = 256;
/** The annulus between the button's polished ring (UV r 0.27) and the dot ring (UV r 0.38), in canvas px. */
export const BEAT_RING = { cx: 128, cy: 128, inner: 69, outer: 97 } as const;
/**
 * The texture sits on both `map` and `emissiveMap` (clipModel), so lit pixels roughly double; 0.6 keeps the mint
 * trace and beat ring bright and readable without clipping to white under ACES tone mapping.
 */
export const SCREEN_EMISSIVE_INTENSITY = 0.6;
const DEFAULT_UV: VisibleUV = { u0: 0.28, v0: 0.14, u1: 0.72, v1: 0.235 };
const MINT = '#C7D99F';
const BPM = 62;
const RING_LINE = 5;
/** Reduced motion: two whole beats on the trace (scroll 0) and the beat ring at a steady, visible glow. */
const STATIC_FRAME: Readonly<ScreenFrame> = Object.freeze({ scroll: 0, pulse: 0.6 });

export function traceRect(uv: VisibleUV) {
  const S = SCREEN_PX;
  return { x0: Math.round(uv.u0 * S), y0: Math.round((1 - uv.v1) * S), x1: Math.round(uv.u1 * S), y1: Math.round((1 - uv.v0) * S) };
}

/** The heartbeat state at `t` seconds: trace scroll (in beats) and the ring's alpha, synced to the trace's right edge. */
export function screenFrameAt(t: number, reducedMotion: boolean, out: ScreenFrame = { scroll: 0, pulse: 0 }): ScreenFrame {
  if (reducedMotion) return Object.assign(out, STATIC_FRAME);
  out.scroll = beatPhaseAt(t, BPM);
  out.pulse = Math.max(0, heartbeatY(out.scroll));
  return out;
}

/** Paint one frame: near-black glass, the scrolling ECG in the lower band, and the beat ring around the button. */
export function drawScreen(ctx: ScreenContext, frame: ScreenFrame, uv: VisibleUV = DEFAULT_UV): void {
  const r = traceRect(uv);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, SCREEN_PX, SCREEN_PX);
  ctx.strokeStyle = MINT;
  ctx.shadowColor = MINT;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const pts = heartbeatPoints(r.x1 - r.x0, r.y1 - r.y0, 96, frame.scroll);
  ctx.lineWidth = 3;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(r.x0 + x, r.y0 + y) : ctx.moveTo(r.x0 + x, r.y0 + y)));
  ctx.stroke();
  if (frame.pulse > 0) {
    ctx.globalAlpha = Math.min(1, frame.pulse);
    ctx.lineWidth = RING_LINE;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(BEAT_RING.cx, BEAT_RING.cy, (BEAT_RING.inner + BEAT_RING.outer) / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- Layout (world units) ----
const FOV = 32;
const ELEVATION = THREE.MathUtils.degToRad(5);       // the camera looks very slightly down
const CLIP_HEIGHT = 1;                               // the clip is scaled to this height (precise box)
const RING_SIZE = 0.55 * CLIP_HEIGHT;                // the ring's largest dimension: ~0.55 of the clip
const CLIP_CENTRE = new THREE.Vector3(0.28, 0.08, 0);
const RING_CENTRE = new THREE.Vector3(-0.42, -0.36, 0.3);
const CORD_LENGTH = 12;                              // far past the top of any frame we pick
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

  let ring: THREE.Mesh | null = null;
  const ringPromise = loadRing(options.ringUrl);
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

    // The heartbeat canvas and the clip that shows it.
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = screenCanvas.height = SCREEN_PX;
    const ctx = screenCanvas.getContext('2d') as ScreenContext | null;
    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    cleanups.push(() => screenTexture.dispose());
    const clip = buildClip({ colour: 'black', screenTexture });
    cleanups.push(() => clip.dispose());
    (clip.screen.material as THREE.MeshPhysicalMaterial).emissiveIntensity = SCREEN_EMISSIVE_INTENSITY;
    const uv = (clip.screen.userData.visibleUV as VisibleUV | undefined) ?? DEFAULT_UV;
    const frameState: ScreenFrame = { scroll: 0, pulse: 0 };
    const paint = (t: number) => {
      if (!ctx) return;
      drawScreen(ctx, screenFrameAt(t, reducedMotion, frameState), uv);
      screenTexture.needsUpdate = true;
    };
    paint(0);

    // rig (drag) > content (centred on the composition) > ring holder / shadow / clip pivot / cord.
    const rig = new THREE.Group();
    rig.name = 'rig';
    const content = new THREE.Group();
    rig.add(content);
    scene.add(rig);

    // Size the clip with the PRECISE box (the default one overstates the 45°-turned body by ~15%), then hang it
    // from a pivot at its cord anchor so the flip and swing turn about the anchor.
    const clipBox = new THREE.Box3().setFromObject(clip.group, true);
    const clipScale = CLIP_HEIGHT / Math.max(1e-6, clipBox.max.y - clipBox.min.y);
    const anchor = (clip.group.userData.anchor as THREE.Vector3).clone().multiplyScalar(clipScale);
    clip.group.scale.setScalar(clipScale);
    clip.group.position.copy(anchor).negate();
    const pivot = new THREE.Group();
    pivot.name = 'clipPivot';
    pivot.position.copy(CLIP_CENTRE).add(anchor).sub(clipBox.getCenter(new THREE.Vector3()).multiplyScalar(clipScale));
    pivot.add(clip.group);
    content.add(pivot);
    // The cord: the clip's own bail loop plus a thin straight cord from the anchor up out of the frame.
    const cordGeo = new THREE.CylinderGeometry(0.006, 0.006, CORD_LENGTH, 8, 1, true);
    const cordMat = new THREE.MeshStandardMaterial({ color: '#141716', roughness: 0.55, metalness: 0.2 });
    cleanups.push(() => { cordGeo.dispose(); cordMat.dispose(); });
    const cord = new THREE.Mesh(cordGeo, cordMat);
    cord.position.set(pivot.position.x, pivot.position.y + CORD_LENGTH / 2, pivot.position.z);
    content.add(cord);

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
    // Centre the composition (ring + clip at rest, not the cord) on the rig's origin and frame it.
    const comp = ringBox.clone().union(new THREE.Box3().setFromObject(pivot, true));
    const compSize = comp.getSize(new THREE.Vector3());
    content.position.copy(comp.getCenter(new THREE.Vector3())).negate();

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
    const resize = () => {
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const d = frameDistance(compSize, camera.aspect, FOV);
      camera.position.set(0, Math.sin(ELEVATION) * d, Math.cos(ELEVATION) * d);
      camera.far = d + CORD_LENGTH * 2;
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
    disposeAll();
    throw err;
  }
}
