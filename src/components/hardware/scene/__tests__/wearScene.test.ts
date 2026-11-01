// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

type StubRenderer = { domElement: HTMLCanvasElement; render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
const h = vi.hoisted(() => ({ failRenderer: false, renderers: [] as StubRenderer[] }));

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
    constructor() {
      if (h.failRenderer) throw new Error('no webgl');
      h.renderers.push(this as unknown as StubRenderer);
    }
  }
  class FakePMREM {
    target = { texture: new actual.Texture(), dispose: vi.fn() };
    dispose = vi.fn();
    fromScene() { return this.target; }
  }
  return { ...actual, WebGLRenderer: FakeRenderer, PMREMGenerator: FakePMREM };
});

import { createWearScene, fetchWatchBytes } from '../wearScene';
import { CAP_HINGE_REST } from '../wearModels';
import { watchBytes } from './watchFixture';

let frames: Array<{ id: number; cb: FrameRequestCallback }> = [];
let container: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;
const flush = (now: number) => frames.splice(0).forEach(f => f.cb(now));
const sceneOf = (r: StubRenderer) => r.render.mock.calls[0][0] as THREE.Scene;
let n = 0;
const url = () => `/models/test-${++n}.bin`;

beforeEach(() => {
  h.failRenderer = false;
  h.renderers = [];
  frames = [];
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { frames.push({ id: ++id, cb }); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((x: number) => { frames = frames.filter(f => f.id !== x); }));
  vi.stubGlobal('IntersectionObserver', class { disconnect = vi.fn(); observe = vi.fn(); });
  vi.stubGlobal('ResizeObserver', class { disconnect = vi.fn(); observe = vi.fn(); });
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => watchBytes() }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => undefined, set: () => true }) as unknown as CanvasRenderingContext2D);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createWearScene', () => {
  it('rejects without WebGL and leaves the container empty', async () => {
    h.failRenderer = true;
    await expect(createWearScene(container, { mode: 'watch', reducedMotion: false, clipUrl: url() })).rejects.toThrow(/WebGL/);
    expect(container.childElementCount).toBe(0);
  });

  it('fetches the model once per URL for all three cards', async () => {
    const u = url();
    const hs = await Promise.all((['watch', 'clip', 'necklace'] as const).map(mode => createWearScene(document.createElement('div'), { mode, reducedMotion: true, clipUrl: u })));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    hs.forEach(x => x.dispose());
    expect(await fetchWatchBytes(u)).toBeInstanceOf(ArrayBuffer);
  });

  it('renders each mode, fires onReady once, and keeps the bracelet to the watch', async () => {
    for (const mode of ['watch', 'clip', 'necklace'] as const) {
      const onReady = vi.fn();
      const handle = await createWearScene(container, { mode, reducedMotion: false, onReady, clipUrl: url() });
      flush(16); flush(32);
      expect(onReady).toHaveBeenCalledTimes(1);
      const scene = sceneOf(h.renderers[h.renderers.length - 1]);
      expect(!!scene.getObjectByName('watch')).toBe(mode === 'watch');
      expect(!!scene.getObjectByName('watchHead')).toBe(mode !== 'watch');
      expect(!!scene.getObjectByName('chain')).toBe(mode === 'necklace');
      expect(!!scene.getObjectByName('capClip')).toBe(mode === 'clip');
      handle.dispose();
      expect(container.querySelector('canvas')).toBeNull();
    }
  });

  it('under reduced motion renders one still frame with the hinge at rest', async () => {
    const handle = await createWearScene(container, { mode: 'clip', reducedMotion: true, clipUrl: url() });
    flush(16);
    expect(frames).toHaveLength(0);
    const hinge = sceneOf(h.renderers[0]).getObjectByName('hinge')!;
    expect(hinge.rotation.x).toBe(CAP_HINGE_REST);
    handle.dispose();
  });

  it('rejects and cleans up when the model request fails', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(createWearScene(container, { mode: 'necklace', reducedMotion: false, clipUrl: url() })).rejects.toThrow(/404/);
    expect(container.querySelector('canvas')).toBeNull();
    expect(h.renderers[0].dispose).toHaveBeenCalled();
  });
});
