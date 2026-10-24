import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { chooseHeaderLayout, menuOnlyLayout, sameLayout, type HeaderLayout, type NavLinkSpec } from './headerLayout';

export const HEADER_GAP = 16;
export const HEADER_LINK_GAP = 4;
export const HEADER_TRIGGER_WIDTH = 32;
/** Below this row width (about a phone in portrait) no link stays in the bar. */
export const HEADER_MIN_INLINE_WIDTH = 440;

/** A block that is in the header but not shown: parked off to the left so it keeps its natural width for measuring, takes no space and is out of reach of keyboards and screen readers. */
export const parked: CSSProperties = { position: 'absolute', left: -9999, top: 0, visibility: 'hidden', pointerEvents: 'none' };

/**
 * Measures the header row and decides what it shows (see headerLayout.ts). Every link and the account actions are
 * always rendered, so each keeps a measurable width; the ones that do not fit are parked, not removed, so they are not
 * remounted when the window is resized (a parked element is invisible and cannot take focus, so an element that was focused
 * when it got parked loses focus). The first layout is the phone one and is replaced before the first paint. Changes that
 * arrive later (a resize, a font, a longer account name) are painted in the same frame, not one frame late.
 */
export function useHeaderLayout(links: NavLinkSpec[], remeasureOn: unknown[]) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const logoRef = useRef<HTMLElement | null>(null);
  const authRef = useRef<HTMLElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLElement | null>>({});
  const [layout, setLayout] = useState<HeaderLayout>(() => menuOnlyLayout(links));
  const linksKey = links.map((l) => `${l.key}:${l.dropOrder}`).join('|');

  const measure = useCallback((sync = false) => {
    const row = rowRef.current;
    if (!row) return;
    const next = chooseHeaderLayout({
      rowWidth: row.clientWidth,
      logoWidth: logoRef.current?.offsetWidth ?? 0,
      authWidth: authRef.current?.offsetWidth ?? 0,
      triggerWidth: HEADER_TRIGGER_WIDTH,
      links: links.map((l) => ({ ...l, width: linkRefs.current[l.key]?.offsetWidth ?? 0 })),
      gap: HEADER_GAP,
      linkGap: HEADER_LINK_GAP,
      minInlineWidth: HEADER_MIN_INLINE_WIDTH,
    });
    const apply = () => setLayout((prev) => (sameLayout(prev, next) ? prev : next));
    // Not from a layout effect (React forbids flushSync there): there the update is already flushed before paint.
    if (sync) flushSync(apply); else apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linksKey]);

  useLayoutEffect(() => {
    measure();
    const later = () => measure(true);
    const row = rowRef.current;
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && row) {
      // The row changes width with the window; the logo, the links and the account block change theirs on their own (a font arrives, a longer name).
      observer = new ResizeObserver(later);
      for (const el of [row, logoRef.current, authRef.current, ...Object.values(linkRefs.current)]) if (el) observer.observe(el);
    } else window.addEventListener('resize', later);
    // The brand fonts change every width when they arrive. `ready` can resolve before a late font starts loading, so also listen for each batch finishing.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(later).catch(() => {});
    fonts?.addEventListener?.('loadingdone', later);
    return () => { observer?.disconnect(); window.removeEventListener('resize', later); fonts?.removeEventListener?.('loadingdone', later); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...remeasureOn]);

  const setLinkRef = (key: string) => (el: HTMLElement | null) => { linkRefs.current[key] = el; };
  return { layout, rowRef, logoRef, authRef, setLinkRef };
}
