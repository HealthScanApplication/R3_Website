// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

type StubRenderer = {
  params: unknown;
  domElement: HTMLCanvasElement;
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  setPixelRatio: ReturnType<typeof vi.fn>;
};

const h = vi.hoisted(() => ({
  failRenderer: false,
  renderers: [] as StubRenderer[],
  pmrems: [] as Array<{ dispose: () => void; target: { dispose: () => void } }>,
  loadRing: null as null | ((url: string) => Promise<unknown>),
  loadClip: null as null | ((url: string, o: { screenTexture: unknown }) => Promise<unknown>),
}));

vi.mock('three', async orig => {
  const actual = await orig<typeof import('three')>();
  // jsdom has no WebGL: a minimal fake renderer, and a PMREM generator that needs no GPU.
  class FakeRenderer {
    domElement = document.createElement('canvas');
    toneMapping = 0;
    outputColorSpace = '';
    info = { render: { calls: 0 } };
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    setClearColor = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    constructor(public params: unknown) {
      if (h.failRenderer) throw new Error('no webgl');
      h.renderers.push(this as unknown as StubRenderer);
    }
  }
  class FakePMREM {
    target = { texture: new actual.Texture(), dispose: vi.fn() };
    dispose = vi.fn();
    constructor() { h.pmrems.push(this); }
    fromScene() { return this.target; }
  }
  return { ...actual, WebGLRenderer: FakeRenderer, PMREMGenerator: FakePMREM };
});

vi.mock('../ringModel', () => ({ loadRing: (url: string) => h.loadRing!(url) }));
vi.mock('../retroClipModel', async orig => {
  const actual = await orig<typeof import('../retroClipModel')>();
  return { ...actual, loadRetroWatch: (url: string, o: { screenTexture: THREE.Texture }) => h.loadClip!(url, o) };
});

import { CLIP_URL, RING_SPIN_RATE, RING_TURN_RATE, createHeroScene as create, type HeroSceneHandle } from '../heroScene';
import { REST_YAW, WATCH_SWING } from '../nest';
import { buildRetroWatch } from '../retroClipModel';
import { watchBytes as headBytes } from './watchFixture';

// Every scene a test makes is disposed afterwards, so no listener leaks into the next test.
const live: HeroSceneHandle[] = [];
const createHeroScene: typeof create = async (c, o) => { const handle = await create(c, o); live.push(handle); return handle; };

let frames: Array<{ id: number; cb: FrameRequestCallback }> = [];
let rafCalls = 0;
let ioInstances: Array<{ cb: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }> = [];
let roInstances: Array<{ cb: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }> = [];
let container: HTMLElement;
let ringMesh: THREE.Mesh;

const flush = (now = 16) => frames.splice(0).forEach(f => f.cb(now));
const sceneOf = (r: StubRenderer) => r.render.mock.calls[0][0] as THREE.Scene;

beforeEach(() => {
  h.failRenderer = false;
  h.renderers = [];
  h.pmrems = [];
  // Like the real ring model: unit sized, its hole axis along Y.
  ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 8, 16).rotateX(Math.PI / 2), new THREE.MeshPhysicalMaterial());
  h.loadRing = vi.fn(async () => ringMesh);
  h.loadClip = vi.fn(async (_url: string, o: { screenTexture: unknown }) => buildRetroWatch(headBytes(), o as { screenTexture: THREE.Texture }));
  frames = [];
  rafCalls = 0;
  ioInstances = [];
  roInstances = [];
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { rafCalls++; frames.push({ id: rafCalls, cb }); return rafCalls; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { frames = frames.filter(f => f.id !== id); }));
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = vi.fn();
    observe = vi.fn();
    constructor(public cb: IntersectionObserverCallback) { ioInstances.push(this); }
  });
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn();
    observe = vi.fn();
    constructor(public cb: ResizeObserverCallback) { roInstances.push(this); }
  });
  // A no-op 2D context (jsdom has none) so the heartbeat and spiral textures can draw.
  const ctx = new Proxy({}, { get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : () => undefined), set: (t, k, v) => { t[k as string] = v; return true; } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  live.splice(0).forEach(x => x.dispose());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createHeroScene', () => {
  it('rejects (does not hang) and leaves the container empty when WebGL cannot be created', async () => {
    h.failRenderer = true;
    await expect(createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: false })).rejects.toThrow(/WebGL.*no webgl/);
    expect(container.childElementCount).toBe(0);
    expect(h.loadRing).not.toHaveBeenCalled();
    expect(h.loadClip).not.toHaveBeenCalled();
  });

  it('appends a styled canvas and calls onReady exactly once, right after the first render', async () => {
    const onReady = vi.fn();
    await createHeroScene(container, { ringUrl: '/models/r3-ring.stl', reducedMotion: false, onReady });
    const [r] = h.renderers;
    expect(h.loadRing).toHaveBeenCalledWith('/models/r3-ring.stl');
    expect(h.loadClip).toHaveBeenCalledWith(CLIP_URL, expect.objectContaining({ screenTexture: expect.any(THREE.CanvasTexture) }));
    expect(CLIP_URL).toBe('/models/r3-clip-watch.bin');
    expect(container.querySelector('canvas')).toBe(r.domElement);
    expect(r.domElement.getAttribute('style')).toMatch(/touch-action:\s*pan-y/);
    expect(r.domElement.style.width).toBe('100%');
    expect(r.params).toMatchObject({ antialias: true, alpha: true, powerPreference: 'default' });
    expect(onReady).not.toHaveBeenCalled();
    expect(r.render).not.toHaveBeenCalled();
    flush(16);
    expect(r.render).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(1);
    flush(32);
    flush(48);
    expect(r.render).toHaveBeenCalledTimes(3);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a throwing onReady cannot stop the render loop', async () => {
    const onReady = vi.fn(() => { throw new Error('boom'); });
    await createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: false, onReady });
    expect(() => flush(16)).not.toThrow();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(1);
    flush(32);
    expect(h.renderers[0].render).toHaveBeenCalledTimes(2);
  });

  it('puts the watch (no chain) and the ring in the scene, the ring nested concentric inside the bracelet loop', async () => {
    await createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: true });
    flush();
    const scene = sceneOf(h.renderers[0]);
    let hasRing = false;
    scene.traverse(o => { if (o === ringMesh) hasRing = true; });
    expect(hasRing).toBe(true);
    expect(scene.getObjectByName('chain')).toBeUndefined();
    expect(scene.getObjectByName('clipPivot')).toBeUndefined();
    const screen = scene.getObjectByName('screen') as THREE.Mesh;
    const sm = screen.material as THREE.MeshBasicMaterial;
    expect(sm.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(sm.toneMapped).toBe(false);
    expect(scene.environment).toBe(h.pmrems[0].target.texture);
    scene.updateMatrixWorld(true);
    const watch = scene.getObjectByName('watch')!;
    const content = scene.getObjectByName('content')!;
    // The watch is 1 unit tall and its bracelet hole is centred on the common centre (the origin).
    const box = new THREE.Box3().setFromObject(watch, true);
    expect(box.max.y - box.min.y).toBeCloseTo(1, 3);
    const hole = (watch.userData.hole as THREE.Box3).clone().applyMatrix4(watch.matrixWorld);
    const hc = hole.getCenter(new THREE.Vector3());
    expect(hc.length()).toBeLessThan(1e-6);
    expect(content.getWorldPosition(new THREE.Vector3()).length()).toBeLessThan(1e-9);
    // The ring sits on the same centre, inside the hole with clearance, its hole axis along the bracelet's.
    const rb = new THREE.Box3().setFromObject(ringMesh, true);
    expect(rb.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-3);
    const ringAxis = new THREE.Vector3(0, 1, 0).transformDirection(ringMesh.matrixWorld);
    const holeAxis = new THREE.Vector3(1, 0, 0).transformDirection(watch.matrixWorld);
    expect(Math.abs(ringAxis.dot(holeAxis))).toBeGreaterThan(0.999);
    const local = watch.userData.hole as THREE.Box3, k = watch.scale.x;
    const inner = Math.min(local.max.y - local.min.y, local.max.z - local.min.z) * k;
    const ringOuter = rb.max.y - rb.min.y;
    expect(ringOuter / inner).toBeGreaterThan(0.5);
    expect(ringOuter / inner).toBeLessThan(0.7);
  });

  it('under reduced motion holds a static three-quarter view with the screen facing the camera', async () => {
    await createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: true });
    flush(16);
    const scene = sceneOf(h.renderers[0]);
    const turn = scene.getObjectByName('watchTurn')!;
    expect(turn.rotation.y).toBe(REST_YAW);
    scene.updateMatrixWorld(true);
    const screen = scene.getObjectByName('screen')!;
    const n = new THREE.Vector3(0, 0, 1).transformDirection(screen.matrixWorld);
    expect(n.z).toBeGreaterThan(0.6);              // toward the camera (on +Z)
    expect(Math.abs(n.x)).toBeGreaterThan(0.3);    // but turned: three-quarter
  });

  it('swings the watch within ±50° and turns the ring inside it when motion is allowed', async () => {
    await createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: false });
    flush(0);
    const scene = sceneOf(h.renderers[0]);
    const turn = scene.getObjectByName('watchTurn')!;
    const holder = scene.getObjectByName('ringHolder')!;
    const spin = scene.getObjectByName('ringSpin')!;
    let lo = Infinity, hi = -Infinity;
    for (let t = 16; t <= 12000; t += 16) {
      flush(t);
      lo = Math.min(lo, turn.rotation.y); hi = Math.max(hi, turn.rotation.y);
    }
    expect(hi - lo).toBeGreaterThan(1.5);
    expect(hi).toBeLessThanOrEqual(WATCH_SWING + 1e-9);
    expect(lo).toBeGreaterThanOrEqual(-WATCH_SWING - 1e-9);
    // ~12 s of turntable and counter-spin.
    const turned = (holder.rotation.y - REST_YAW + Math.PI * 2) % (Math.PI * 2);
    expect(turned).toBeCloseTo((12 * RING_TURN_RATE) % (Math.PI * 2), 1);
    expect(Math.abs(spin.rotation.x)).toBeGreaterThan(0.1);
    expect(RING_TURN_RATE).toBeCloseTo(0.35, 9);
    expect(RING_SPIN_RATE).toBeCloseTo(0.25, 9);
    expect(frames.length).toBe(1);
    // The ring stays on the common centre throughout.
    scene.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(ringMesh, true).getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-3);
  });

  it('repaints the screen texture as time runs (needsUpdate bumps its version)', async () => {
    await createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: false });
    flush(0);
    const tex = ((sceneOf(h.renderers[0]).getObjectByName('screen') as THREE.Mesh).material as THREE.MeshBasicMaterial).map!;
    const v0 = tex.version;
    for (let t = 16; t <= 500; t += 16) flush(t);
    expect(tex.version - v0).toBeGreaterThan(5);
  });

  it('under reduced motion renders one static frame and requests no further frames', async () => {
    const onReady = vi.fn();
    await createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: true, onReady });
    expect(rafCalls).toBe(1);
    flush(16);
    expect(h.renderers[0].render).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(0);
    expect(rafCalls).toBe(1);
    expect(sceneOf(h.renderers[0]).getObjectByName('watchTurn')!.rotation.y).toBe(REST_YAW);
    // A resize re-renders once, then stops again.
    roInstances[0].cb([], roInstances[0] as unknown as ResizeObserver);
    expect(rafCalls).toBe(2);
    flush(1000);
    expect(frames).toHaveLength(0);
    expect(h.renderers[0].render).toHaveBeenCalledTimes(2);
  });

  it('pauses while off-screen or hidden and resumes when visible again', async () => {
    await createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: false });
    flush(16);
    const io = ioInstances[0];
    io.cb([{ isIntersecting: false } as IntersectionObserverEntry], io as unknown as IntersectionObserver);
    flush(32);
    expect(frames).toHaveLength(0);
    io.cb([{ isIntersecting: true } as IntersectionObserverEntry], io as unknown as IntersectionObserver);
    expect(frames).toHaveLength(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    flush(48);
    expect(frames).toHaveLength(0);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames).toHaveLength(1);
  });

  it('turns the rig with a pointer drag within its limits', async () => {
    await createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: false });
    flush(0);
    const r = h.renderers[0];
    const rig = sceneOf(r).getObjectByName('rig')!;
    const ev = (type: string, x: number, y: number) =>
      r.domElement.dispatchEvent(Object.assign(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }), { pointerId: 1 }));
    ev('pointerdown', 100, 100);
    ev('pointermove', 5000, 5000);
    for (let t = 16; t <= 1600; t += 16) flush(t);
    expect(rig.rotation.y).toBeGreaterThan(0.3);
    expect(rig.rotation.y).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(Math.abs(rig.rotation.x)).toBeLessThanOrEqual(0.25 + 1e-9);
    ev('pointerup', 5000, 5000);
    for (let t = 1616; t <= 4000; t += 16) flush(t);
    expect(Math.abs(rig.rotation.y)).toBeLessThan(0.02);
  });

  it('dispose() removes the canvas, frees everything, and a second dispose is a no-op', async () => {
    const handle = await createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: false });
    flush(16);
    const r = h.renderers[0];
    const ringGeo = vi.spyOn(ringMesh.geometry, 'dispose');
    const ringMat = vi.spyOn(ringMesh.material as THREE.Material, 'dispose');
    const screen = sceneOf(r).getObjectByName('screen') as THREE.Mesh;
    const screenTex = vi.spyOn((screen.material as THREE.MeshPhysicalMaterial).map!, 'dispose');
    handle.dispose();
    expect(container.childElementCount).toBe(0);
    expect(r.dispose).toHaveBeenCalledTimes(1);
    expect(h.pmrems[0].dispose).toHaveBeenCalledTimes(1);
    expect(h.pmrems[0].target.dispose).toHaveBeenCalledTimes(1);
    expect(ringGeo).toHaveBeenCalledTimes(1);
    expect(ringMat).toHaveBeenCalledTimes(1);
    expect(screenTex).toHaveBeenCalledTimes(1);
    expect(ioInstances[0].disconnect).toHaveBeenCalled();
    expect(roInstances[0].disconnect).toHaveBeenCalled();
    expect(frames).toHaveLength(0);
    handle.dispose();
    expect(r.dispose).toHaveBeenCalledTimes(1);
    expect(ringGeo).toHaveBeenCalledTimes(1);
    expect(screenTex).toHaveBeenCalledTimes(1);
    // No frame renders after dispose, even if a stale callback fires.
    const before = r.render.mock.calls.length;
    flush(64);
    expect(r.render.mock.calls.length).toBe(before);
  });

  it('rejects and cleans up when the watch model fails to load', async () => {
    h.loadClip = vi.fn(async () => { throw new Error('Watch model request failed: 404'); });
    await expect(createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: false })).rejects.toThrow(/Watch.*404/);
    expect(container.childElementCount).toBe(0);
    expect(h.renderers[0].dispose).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(0);
  });

  it('frees the loaded watch when the ring fails', async () => {
    let built: { dispose: () => void } | null = null;
    h.loadClip = vi.fn(async (_u: string, o: { screenTexture: unknown }) => {
      const c = buildRetroWatch(headBytes(), o as { screenTexture: THREE.Texture });
      built = c;
      vi.spyOn(c, 'dispose');
      return c;
    });
    h.loadRing = vi.fn(async () => { throw new Error('Ring model request failed: 404'); });
    await expect(createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: false })).rejects.toThrow(/404/);
    await Promise.resolve();
    expect(built!.dispose).toHaveBeenCalledTimes(1);
  });

  it('rejects and cleans up when the ring fails to load', async () => {
    h.loadRing = vi.fn(async () => { throw new Error('Ring model request failed: 404'); });
    await expect(createHeroScene(container, { ringUrl: '/r.stl', reducedMotion: false })).rejects.toThrow(/404/);
    expect(container.childElementCount).toBe(0);
    expect(h.renderers[0].dispose).toHaveBeenCalledTimes(1);
    expect(h.pmrems[0].dispose).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(0);
  });
});
