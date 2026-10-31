// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

type StubRenderer = {
  params: unknown;
  domElement: HTMLCanvasElement;
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  setPixelRatio: ReturnType<typeof vi.fn>;
};

const h = vi.hoisted(() => ({
  failRenderer: false,
  renderers: [] as StubRenderer[],
  pmrems: [] as Array<{ dispose: () => void; target: { dispose: () => void } }>,
  loadRing: null as null | ((url: string, finish?: string) => Promise<unknown>),
  loadClip: null as null | ((url: string, o: { screenTexture: unknown; finish?: string }) => Promise<unknown>),
  fills: [] as string[],
}));

vi.mock('three', async orig => {
  const actual = await orig<typeof import('three')>();
  class FakeRenderer {
    domElement = document.createElement('canvas');
    toneMapping = 0;
    outputColorSpace = '';
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

vi.mock('../ringModel', async orig => {
  const actual = await orig<typeof import('../ringModel')>();
  return { ...actual, loadRing: (url: string, finish?: string) => h.loadRing!(url, finish) };
});
vi.mock('../retroClipModel', async orig => {
  const actual = await orig<typeof import('../retroClipModel')>();
  return { ...actual, loadRetroWatch: (url: string, o: { screenTexture: THREE.Texture; finish?: string }) => h.loadClip!(url, o) };
});

import {
  CLIP_URL, RING_REST_YAW, RING_URL, WATCH_MAX_OFF, WATCH_MIN_OFF, WATCH_REST_YAW,
  createDeviceScene as create, deviceWatchYaw, type DeviceSceneHandle, type DeviceSceneOptions,
} from '../deviceScene';
import { FINISH_SPECS } from '../finishes';
import { buildRetroWatch } from '../retroClipModel';
import { watchBytes } from './watchFixture';

const live: DeviceSceneHandle[] = [];
const createDeviceScene = async (c: HTMLElement, o: DeviceSceneOptions) => { const handle = await create(c, o); live.push(handle); return handle; };

let frames: Array<{ id: number; cb: FrameRequestCallback }> = [];
let rafCalls = 0;
let ioInstances: Array<{ cb: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }> = [];
let roInstances: Array<{ cb: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }> = [];
let container: HTMLElement;
let ringMesh: THREE.Mesh;

const flush = (now = 16) => frames.splice(0).forEach(f => f.cb(now));
const sceneOf = (r: StubRenderer) => r.render.mock.calls[0][0] as THREE.Scene;
const bodyOf = (scene: THREE.Scene) => {
  let body: THREE.MeshPhysicalMaterial | null = null;
  scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (!body && m?.name === 'watchBody') body = m as THREE.MeshPhysicalMaterial; });
  return body!;
};

beforeEach(() => {
  h.failRenderer = false;
  h.renderers = [];
  h.pmrems = [];
  h.fills = [];
  ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 8, 16).rotateX(Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: FINISH_SPECS.white.ring.color }));
  h.loadRing = vi.fn(async () => ringMesh);
  h.loadClip = vi.fn(async (_url: string, o: { screenTexture: unknown; finish?: string }) => buildRetroWatch(watchBytes(), o as { screenTexture: THREE.Texture; finish?: 'white' }));
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
  // A 2D context that records the ground fill (the first full-canvas fillRect of each paint).
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : k === 'fillRect'
      ? (x: number, y: number, w: number) => { if (x === 0 && y === 0 && w === 200) h.fills.push(String(t.fillStyle)); }
      : () => undefined),
    set: (t, k, v) => { t[k as string] = v; return true; },
  });
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

describe('createDeviceScene', () => {
  it('rejects when WebGL cannot be created, loading nothing and leaving the container empty', async () => {
    h.failRenderer = true;
    await expect(createDeviceScene(container, { device: 'ring', finish: 'white', reducedMotion: false })).rejects.toThrow(/WebGL/);
    expect(container.childElementCount).toBe(0);
    expect(h.loadRing).not.toHaveBeenCalled();
  });

  it('builds the ring alone, in the finish asked for, on a transparent canvas with RoomEnvironment', async () => {
    const onReady = vi.fn();
    await createDeviceScene(container, { device: 'ring', finish: 'white', reducedMotion: false, onReady });
    expect(h.loadRing).toHaveBeenCalledWith(RING_URL, 'white');
    expect(h.loadClip).not.toHaveBeenCalled();
    const [r] = h.renderers;
    expect(r.params).toMatchObject({ alpha: true });
    expect(r.setPixelRatio.mock.calls[0][0]).toBeLessThanOrEqual(2);
    expect(container.querySelector('canvas')).toBe(r.domElement);
    flush(16);
    expect(onReady).toHaveBeenCalledTimes(1);
    const scene = sceneOf(r);
    expect(scene.environment).toBe(h.pmrems[0].target.texture);
    let has = false;
    scene.traverse(o => { if (o === ringMesh) has = true; });
    expect(has).toBe(true);
    expect(scene.getObjectByName('watch')).toBeUndefined();
    // Centred on the origin.
    scene.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(ringMesh, true).getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-3);
  });

  it('builds the watch alone with its heartbeat screen in the finish\'s inks', async () => {
    await createDeviceScene(container, { device: 'watch', finish: 'white', reducedMotion: false });
    expect(h.loadClip).toHaveBeenCalledWith(CLIP_URL, expect.objectContaining({ finish: 'white', screenTexture: expect.any(THREE.CanvasTexture) }));
    expect(h.loadRing).not.toHaveBeenCalled();
    flush(16);
    const scene = sceneOf(h.renderers[0]);
    const screen = scene.getObjectByName('screen') as THREE.Mesh;
    expect((screen.material as THREE.MeshBasicMaterial).map).toBeInstanceOf(THREE.CanvasTexture);
    expect(h.fills[0]).toBe(FINISH_SPECS.white.screen.ground);
    expect(bodyOf(scene).color.getHexString()).toBe(FINISH_SPECS.white.watch.color.slice(1));
  });

  it('turns the ring continuously', async () => {
    await createDeviceScene(container, { device: 'ring', finish: 'black', reducedMotion: false });
    flush(0);
    const turn = sceneOf(h.renderers[0]).getObjectByName('deviceTurn')!;
    const a = turn.rotation.y;
    for (let t = 16; t <= 3000; t += 16) flush(t);
    expect(turn.rotation.y - a).toBeGreaterThan(1);
    expect(frames).toHaveLength(1);
  });

  it('swings the watch about a three-quarter view, never straight on, edge-on or back-on', async () => {
    expect(WATCH_MIN_OFF).toBeGreaterThan(0.1);
    expect(WATCH_MAX_OFF).toBeLessThan(1.2);
    await createDeviceScene(container, { device: 'watch', finish: 'black', reducedMotion: false });
    flush(0);
    const scene = sceneOf(h.renderers[0]);
    const turn = scene.getObjectByName('deviceTurn')!;
    let lo = Infinity, hi = -Infinity;
    for (let t = 16; t <= 12000; t += 48) {
      flush(t);
      lo = Math.min(lo, turn.rotation.y); hi = Math.max(hi, turn.rotation.y);
      scene.updateMatrixWorld(true);
      const n = new THREE.Vector3(0, 0, 1).transformDirection(scene.getObjectByName('screen')!.matrixWorld);
      expect(n.z).toBeGreaterThan(0.35);   // the screen always faces the camera side
    }
    expect(hi).toBeLessThanOrEqual(-WATCH_MIN_OFF + 1e-9);
    expect(lo).toBeGreaterThanOrEqual(-WATCH_MAX_OFF - 1e-9);
    expect(hi - lo).toBeGreaterThan(0.5);
  });

  it('setFinish re-colours the ring in place without loading again', async () => {
    const handle = await createDeviceScene(container, { device: 'ring', finish: 'white', reducedMotion: false });
    flush(16);
    const mat = ringMesh.material as THREE.MeshPhysicalMaterial, geo = ringMesh.geometry;
    handle.setFinish('silver');
    expect(mat.color.getHexString()).toBe('c9ced0');
    expect(mat.metalness).toBe(1);
    handle.setFinish('black');
    expect(mat.color.getHexString()).toBe('1b1c1a');
    expect(h.loadRing).toHaveBeenCalledTimes(1);
    expect(ringMesh.material).toBe(mat);
    expect(ringMesh.geometry).toBe(geo);
  });

  it('setFinish re-colours the watch and repaints the screen in the new scheme, without loading again', async () => {
    const handle = await createDeviceScene(container, { device: 'watch', finish: 'white', reducedMotion: true });
    flush(16);
    expect(frames).toHaveLength(0);
    const scene = sceneOf(h.renderers[0]);
    const body = bodyOf(scene);
    const tex = ((scene.getObjectByName('screen') as THREE.Mesh).material as THREE.MeshBasicMaterial).map!;
    const v0 = tex.version;
    handle.setFinish('black');
    expect(body.color.getHexString()).toBe('2a2e2d');
    expect(h.fills[h.fills.length - 1]).toBe('#000000');
    expect(tex.version).toBeGreaterThan(v0);
    expect(((scene.getObjectByName('screenGround') as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex()).toBe(0);
    // Under reduced motion one frame shows the change, then the loop is idle again.
    expect(frames).toHaveLength(1);
    flush(32);
    expect(frames).toHaveLength(0);
    expect(h.loadClip).toHaveBeenCalledTimes(1);
  });

  it('under reduced motion holds a static three-quarter view and a static heartbeat frame', async () => {
    await createDeviceScene(container, { device: 'watch', finish: 'white', reducedMotion: true });
    flush(16);
    expect(frames).toHaveLength(0);
    expect(rafCalls).toBe(1);
    const turn = sceneOf(h.renderers[0]).getObjectByName('deviceTurn')!;
    expect(turn.rotation.y).toBe(WATCH_REST_YAW);
    expect(deviceWatchYaw(5, true)).toBe(WATCH_REST_YAW);
    expect(h.fills).toHaveLength(1);           // painted once, never again
    const ring = await createDeviceScene(container, { device: 'ring', finish: 'white', reducedMotion: true });
    flush(16);
    expect(sceneOf(h.renderers[1]).getObjectByName('deviceTurn')!.rotation.y).toBe(RING_REST_YAW);
    expect(frames).toHaveLength(0);
    ring.dispose();
  });

  it('pauses off-screen or hidden and resumes when visible again', async () => {
    await createDeviceScene(container, { device: 'ring', finish: 'white', reducedMotion: false });
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

  it('turns the rig with a drag and eases back', async () => {
    await createDeviceScene(container, { device: 'ring', finish: 'white', reducedMotion: false });
    flush(0);
    const r = h.renderers[0];
    const rig = sceneOf(r).getObjectByName('rig')!;
    const ev = (type: string, x: number, y: number) =>
      r.domElement.dispatchEvent(Object.assign(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }), { pointerId: 1 }));
    ev('pointerdown', 100, 100);
    ev('pointermove', 5000, 100);
    for (let t = 16; t <= 1600; t += 16) flush(t);
    expect(rig.rotation.y).toBeGreaterThan(0.3);
    expect(rig.rotation.y).toBeLessThanOrEqual(0.6 + 1e-9);
    ev('pointerup', 5000, 100);
    for (let t = 1616; t <= 4000; t += 16) flush(t);
    expect(Math.abs(rig.rotation.y)).toBeLessThan(0.02);
  });

  it('dispose frees the renderer, PMREM, screen texture, model and observers; twice is a no-op', async () => {
    const handle = await createDeviceScene(container, { device: 'watch', finish: 'white', reducedMotion: false });
    flush(16);
    const r = h.renderers[0];
    const scene = sceneOf(r);
    const tex = ((scene.getObjectByName('screen') as THREE.Mesh).material as THREE.MeshBasicMaterial).map!;
    const texDispose = vi.spyOn(tex, 'dispose');
    const bodyDispose = vi.spyOn(bodyOf(scene), 'dispose');
    handle.dispose();
    handle.dispose();
    expect(container.childElementCount).toBe(0);
    expect(r.dispose).toHaveBeenCalledTimes(1);
    expect(h.pmrems[0].dispose).toHaveBeenCalledTimes(1);
    expect(h.pmrems[0].target.dispose).toHaveBeenCalledTimes(1);
    expect(texDispose).toHaveBeenCalledTimes(1);
    expect(bodyDispose).toHaveBeenCalledTimes(1);
    expect(ioInstances[0].disconnect).toHaveBeenCalled();
    expect(roInstances[0].disconnect).toHaveBeenCalled();
    expect(frames).toHaveLength(0);
    // setFinish after dispose does nothing.
    handle.setFinish('silver');
    expect(frames).toHaveLength(0);
  });

  it('dispose frees the ring geometry and material', async () => {
    const handle = await createDeviceScene(container, { device: 'ring', finish: 'white', reducedMotion: false });
    const g = vi.spyOn(ringMesh.geometry, 'dispose'), m = vi.spyOn(ringMesh.material as THREE.Material, 'dispose');
    handle.dispose();
    expect(g).toHaveBeenCalledTimes(1);
    expect(m).toHaveBeenCalledTimes(1);
  });

  it('rejects and cleans up when the model fails to load', async () => {
    h.loadClip = vi.fn(async () => { throw new Error('Watch model request failed: 404'); });
    await expect(createDeviceScene(container, { device: 'watch', finish: 'white', reducedMotion: false })).rejects.toThrow(/404/);
    expect(container.childElementCount).toBe(0);
    expect(h.renderers[0].dispose).toHaveBeenCalledTimes(1);
    expect(h.pmrems[0].dispose).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(0);
  });
});
