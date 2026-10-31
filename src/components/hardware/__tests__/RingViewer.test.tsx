// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

const reg = vi.hoisted(() => ({
  loads: 0,
  fail: false,
  gate: null as Promise<void> | null,
}));

let RingViewer: typeof import('../RingViewer').RingViewer;

async function loadComponent() {
  vi.resetModules();
  vi.doMock('../registerModelViewer', async () => {
    reg.loads += 1;
    if (reg.gate) await reg.gate;
    if (reg.fail) throw new Error('registration failed');
    return {};
  });
  ({ RingViewer } = await import('../RingViewer'));
}

function stubMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

beforeEach(async () => {
  reg.loads = 0;
  reg.fail = false;
  reg.gate = null;
  stubMotion(false);
  await loadComponent();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const viewer = (container: HTMLElement) => container.querySelector('model-viewer');

describe('RingViewer', () => {
  it('renders a model-viewer with the model, poster, alt and controls', async () => {
    const { container } = render(<RingViewer />);
    const el = viewer(container)!;
    expect(el).not.toBeNull();
    expect(el.getAttribute('src')).toBe('/models/r3-ring.glb');
    expect(el.getAttribute('poster')).toBe('/models/r3-ring-poster.webp');
    expect(el.getAttribute('alt')).toBe('R³ Note — drag to rotate');
    expect(el.getAttribute('camera-controls')).not.toBeNull();
    expect(el.getAttribute('shadow-intensity')).not.toBeNull();
    await waitFor(() => expect(reg.loads).toBe(1));
  });

  it('auto-rotates normally', async () => {
    const { container } = render(<RingViewer />);
    expect(viewer(container)!.getAttribute('auto-rotate')).not.toBeNull();
    expect(viewer(container)!.getAttribute('rotation-per-second')).toBe('12deg');
    await waitFor(() => expect(reg.loads).toBe(1));
  });

  it('omits auto-rotate and rotation-per-second under reduced motion', async () => {
    stubMotion(true);
    const { container } = render(<RingViewer />);
    expect(viewer(container)!.getAttribute('auto-rotate')).toBeNull();
    expect(viewer(container)!.getAttribute('rotation-per-second')).toBeNull();
    await waitFor(() => expect(reg.loads).toBe(1));
  });

  it('tolerates matchMedia being undefined', async () => {
    vi.stubGlobal('matchMedia', undefined);
    const { container } = render(<RingViewer />);
    expect(viewer(container)!.getAttribute('auto-rotate')).not.toBeNull();
    await waitFor(() => expect(reg.loads).toBe(1));
  });

  it('is never blank: the SVG shows and the viewer is transparent before load', async () => {
    const { container } = render(<RingViewer />);
    expect(screen.getByRole('img', { name: 'R³ Note' })).toBeTruthy();
    expect(viewer(container)!.style.opacity).toBe('0');
    await waitFor(() => expect(reg.loads).toBe(1));
  });

  it('reveals the viewer and removes the SVG once the model loads', async () => {
    const { container } = render(<RingViewer />);
    await waitFor(() => expect(reg.loads).toBe(1));
    fireEvent(viewer(container)!, new Event('load'));
    await waitFor(() => expect(screen.queryByRole('img', { name: 'R³ Note' })).toBeNull());
    expect(viewer(container)!.style.opacity).toBe('1');
  });

  it('removes the viewer and keeps the SVG when the element fires error', async () => {
    const { container } = render(<RingViewer />);
    await waitFor(() => expect(reg.loads).toBe(1));
    fireEvent(viewer(container)!, new CustomEvent('error', { detail: { type: 'loadfailure' } }));
    await waitFor(() => expect(viewer(container)).toBeNull());
    expect(screen.getByRole('img', { name: 'R³ Note' })).toBeTruthy();
  });

  it('gives each instance a distinct gradient id', async () => {
    const { container } = render(<><RingViewer /><RingViewer /></>);
    const ids = Array.from(container.querySelectorAll('linearGradient')).map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids.every((id) => /^[\w-]+$/.test(id))).toBe(true);
    await waitFor(() => expect(reg.loads).toBe(1));
  });

  it('shows the fallback when registration fails', async () => {
    reg.fail = true;
    await loadComponent();
    const { container } = render(<RingViewer />);
    expect(await screen.findByRole('img', { name: 'R³ Note' })).toBeTruthy();
    expect(viewer(container)).toBeNull();
  });

  it('shows the fallback without registering when customElements is missing', async () => {
    vi.stubGlobal('customElements', undefined);
    Object.defineProperty(window, 'customElements', { value: undefined, configurable: true });
    const { container } = render(<RingViewer />);
    expect(screen.getByRole('img', { name: 'R³ Note' })).toBeTruthy();
    expect(viewer(container)).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(reg.loads).toBe(0);
  });

  it('requests registration exactly once', async () => {
    const { rerender } = render(<RingViewer />);
    await waitFor(() => expect(reg.loads).toBe(1));
    rerender(<RingViewer />);
    await new Promise((r) => setTimeout(r, 20));
    expect(reg.loads).toBe(1);
  });

  it('does not warn or set state when unmounted before the import settles', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let release!: () => void;
    reg.gate = new Promise<void>((r) => { release = r; });
    reg.fail = true;
    await loadComponent();
    const { unmount } = render(<RingViewer />);
    await waitFor(() => expect(reg.loads).toBe(1));
    unmount();
    release();
    await new Promise((r) => setTimeout(r, 30));
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
