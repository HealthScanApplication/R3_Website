// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { OptimizedImage } from '../../components/OptimizedImage';

const STORAGE = 'https://mofhvoudjxinvpplsytd.supabase.co/storage/v1/object/public/catalog-media/activities/activity_plank.png';
const DATA_URI = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

function setReducedMotion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && /prefers-reduced-motion/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => setReducedMotion(false));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const main = (c: HTMLElement) => c.querySelector('img:not([aria-hidden="true"])') as HTMLImageElement | null;
const blurLayer = (c: HTMLElement) => c.querySelector('img[aria-hidden="true"]') as HTMLImageElement | null;
const state = (c: HTMLElement) => (c.firstElementChild as HTMLElement).getAttribute('data-image-state');

describe('OptimizedImage loading attributes', () => {
  it('lazy-loads and decodes off the main thread by default (everything below the fold)', () => {
    const { container } = render(<OptimizedImage src="/images/content/03-energy.webp" alt="Energy" aspectRatio={1} />);
    const img = main(container)!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    expect(img.getAttribute('fetchpriority')).toBeNull();
  });
  it('a priority image is the one that is not lazy and is fetched first', () => {
    const { container } = render(<OptimizedImage src="/images/hero.webp" alt="" aspectRatio={16 / 9} priority />);
    const img = main(container)!;
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('fetchpriority')).toBe('high');
  });
  it('reserves its space from the aspect ratio before anything has loaded, so nothing shifts', () => {
    const { container } = render(<OptimizedImage src="/a.webp" alt="" aspectRatio={3 / 2} />);
    expect((container.firstElementChild as HTMLElement).style.aspectRatio).toBe('1.5');
  });
  it('takes the aspect ratio from width and height when those are given instead', () => {
    const { container } = render(<OptimizedImage src="/a.webp" alt="" width={800} height={400} />);
    expect((container.firstElementChild as HTMLElement).style.aspectRatio).toBe('2');
  });
});

describe('OptimizedImage sources', () => {
  it('asks Storage for right-sized candidates and lets the browser choose', () => {
    const { container } = render(<OptimizedImage src={STORAGE} alt="" aspectRatio={1} widths={[160, 320]} sizes="160px" />);
    const img = main(container)!;
    expect(img.getAttribute('srcset')).toMatch(/width=160&height=160.* 160w, .*width=320&height=320.* 320w$/);
    expect(img.getAttribute('sizes')).toBe('160px');
    expect(img.getAttribute('src')).toContain('/render/image/public/');
  });
  it('scales to the width without a crop when the box is sized by its parent', () => {
    const { container } = render(<OptimizedImage src={STORAGE} alt="" proportional widths={[160]} />);
    expect(main(container)!.getAttribute('srcset')).toMatch(/width=160&height=640&resize=contain/);
  });
  it('uses a precomputed srcset for a local file as it is', () => {
    const { container } = render(<OptimizedImage src="/h-1600.webp" srcSet="/h-800.webp 800w, /h-1600.webp 1600w" sizes="100vw" alt="" aspectRatio={2} />);
    const img = main(container)!;
    expect(img.getAttribute('src')).toBe('/h-1600.webp');
    expect(img.getAttribute('srcset')).toBe('/h-800.webp 800w, /h-1600.webp 1600w');
  });
  it('shows an image that cannot be resized exactly as given', () => {
    const { container } = render(<OptimizedImage src="https://example.com/photo.jpg" alt="" aspectRatio={1} widths={[320]} />);
    expect(main(container)!.getAttribute('src')).toBe('https://example.com/photo.jpg');
    expect(main(container)!.getAttribute('srcset')).toBeNull();
  });
});

describe('OptimizedImage placeholder and fade', () => {
  it('shows the image only once it has loaded, and says so', () => {
    const { container } = render(<OptimizedImage src="/a.webp" alt="" aspectRatio={1} placeholderColor="#c9b8a4" />);
    const img = main(container)!;
    expect((container.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(201, 184, 164)');
    expect(img.style.opacity).toBe('0');
    expect(state(container)).toBe('loading');
    fireEvent.load(img);
    expect(img.style.opacity).toBe('1');
    expect(state(container)).toBe('loaded');
  });
  it('shows a tiny blurred version first for a big Storage image, cross-fades to the real one, then drops it', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<OptimizedImage src={STORAGE} alt="" aspectRatio={1} widths={[320, 640]} />);
      expect(blurLayer(container)!.getAttribute('src')).toContain('width=24&height=24');
      expect(blurLayer(container)!.style.opacity).toBe('1');
      fireEvent.load(main(container)!);
      expect(blurLayer(container)!.style.opacity).toBe('0');
      act(() => { vi.advanceTimersByTime(600); });
      expect(blurLayer(container)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('shows a supplied data-URI placeholder for a local image', () => {
    const { container } = render(<OptimizedImage src="/a.webp" alt="" aspectRatio={1} placeholderSrc={DATA_URI} />);
    expect(blurLayer(container)!.getAttribute('src')).toBe(DATA_URI);
  });
  it('does not request a blur placeholder for a thumbnail', () => {
    const { container } = render(<OptimizedImage src={STORAGE} alt="" aspectRatio={1} widths={[96, 160]} />);
    expect(blurLayer(container)).toBeNull();
  });
  it('shows an image that is already in the cache at once, with no fade', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(640);
    const { container } = render(<OptimizedImage src="/a.webp" alt="" aspectRatio={1} />);
    expect(state(container)).toBe('loaded');
    expect(main(container)!.style.opacity).toBe('1');
    expect(main(container)!.style.transition).toBe('none');
  });
  it('fades in over a moment normally and not at all when the visitor prefers reduced motion', () => {
    const normal = render(<OptimizedImage src="/a.webp" alt="" aspectRatio={1} />);
    expect(main(normal.container)!.style.transition).toContain('opacity');
    cleanup();
    setReducedMotion(true);
    const reduced = render(<OptimizedImage src="/a.webp" alt="" aspectRatio={1} />);
    expect(main(reduced.container)!.style.transition).toBe('none');
  });
});

describe('OptimizedImage failure', () => {
  it('goes back to the original if the resized version will not load', () => {
    const onError = vi.fn();
    const { container } = render(<OptimizedImage src={STORAGE} alt="" aspectRatio={1} widths={[160]} onError={onError} />);
    fireEvent.error(main(container)!);
    const img = main(container)!;
    expect(img.getAttribute('src')).toBe(STORAGE);
    expect(img.getAttribute('srcset')).toBeNull();
    expect(state(container)).toBe('loading');
    expect(onError).not.toHaveBeenCalled();
  });
  it('shows the fallback, not a broken image, when the original fails too', () => {
    const onError = vi.fn();
    const { container, getByText } = render(
      <OptimizedImage src={STORAGE} alt="Plank" aspectRatio={1} widths={[160]} onError={onError} fallback={<span>No photo</span>} />,
    );
    fireEvent.error(main(container)!);
    fireEvent.error(main(container)!);
    expect(container.querySelector('img')).toBeNull();
    expect(getByText('No photo')).toBeTruthy();
    expect(state(container)).toBe('failed');
    expect(onError).toHaveBeenCalledTimes(1);
  });
  it('an image with nothing smaller to fall back to goes straight to the fallback', () => {
    const { container } = render(<OptimizedImage src="/missing.webp" alt="" aspectRatio={1} />);
    fireEvent.error(main(container)!);
    expect(container.querySelector('img')).toBeNull();
    expect(state(container)).toBe('failed');
  });
  it('keeps its reserved space and describes itself when it has failed', () => {
    const { container } = render(<OptimizedImage src="/missing.webp" alt="A plank" aspectRatio={4 / 3} />);
    fireEvent.error(main(container)!);
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.aspectRatio).toBe('1.3333333333333333');
    expect(box.getAttribute('role')).toBe('img');
    expect(box.getAttribute('aria-label')).toBe('A plank');
  });
  it('shows the fallback straight away when there is no source', () => {
    const { container } = render(<OptimizedImage src="" alt="" aspectRatio={1} />);
    expect(container.querySelector('img')).toBeNull();
    expect(state(container)).toBe('failed');
  });
  it('starts over when the source changes after a failure', () => {
    const { container, rerender } = render(<OptimizedImage src="/missing.webp" alt="" aspectRatio={1} />);
    fireEvent.error(main(container)!);
    expect(state(container)).toBe('failed');
    rerender(<OptimizedImage src="/b.webp" alt="" aspectRatio={1} />);
    expect(state(container)).toBe('loading');
    expect(main(container)!.getAttribute('src')).toBe('/b.webp');
  });
});

describe('OptimizedImage styling hooks', () => {
  it('lets the caller style the box and the image separately', () => {
    const { container } = render(
      <OptimizedImage src="/a.webp" alt="" aspectRatio={1} style={{ borderRadius: 12 }} imgStyle={{ filter: 'grayscale(1)', objectPosition: 'center 30%' }} />,
    );
    expect((container.firstElementChild as HTMLElement).style.borderRadius).toBe('12px');
    expect(main(container)!.style.filter).toBe('grayscale(1)');
    expect(main(container)!.style.objectPosition).toBe('center 30%');
  });
});
