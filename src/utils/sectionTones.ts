/*
 * Sections of a Guardian's public page alternate dark and light down the page. Every section can be drawn in either tone, so each takes
 * whichever is opposite the section above it and two dark or two light sections never meet, in any order.
 */
import type { PageSectionKey } from './pageSections';

export type Tone = 'light' | 'dark';

/** Fixed tones; a section missing here is flexible. */
export const FIXED_TONES: Partial<Record<PageSectionKey, Tone>> = {};

/** The colours a section draws with in each tone (every section can take either, so any order alternates). */
export const TONE_PALETTE = {
  light: { bg: '#E7E1D5', ink: '#11120F', muted: '#5F5E57', line: 'rgba(17,18,15,.22)', accent: '#667245', card: '#FFFFFF' },
  dark: { bg: '#11150F', ink: '#F2EFE7', muted: '#B8B6AF', line: 'rgba(242,239,231,.3)', accent: '#C7D8A3', card: '#171B14' },
} as const;

/**
 * The tone of every section that will show, in page order. The hero above the first section is dark. `overrides` fixes the
 * tone of a section that is not flexible after all (the offer funnel's sign-up is dark over a picture, else light).
 */
export function sectionTones(order: PageSectionKey[], shown: ReadonlySet<PageSectionKey>, overrides: Partial<Record<PageSectionKey, Tone>> = {}): Partial<Record<PageSectionKey, Tone>> {
  const visible = order.filter((key) => shown.has(key));
  // Alternating from the dark hero the first section is light; a section that must keep its tone (the sign-up over a picture
  // is dark) fixes the pattern instead, so the sections above it flip to match.
  let firstLight = true;
  const pinned = visible.findIndex((key) => overrides[key] || FIXED_TONES[key]);
  if (pinned >= 0) {
    const want = (overrides[visible[pinned]] || FIXED_TONES[visible[pinned]]) as Tone;
    firstLight = (pinned % 2 === 0) === (want === 'light');
  }
  const tones: Partial<Record<PageSectionKey, Tone>> = {};
  visible.forEach((key, index) => { tones[key] = (index % 2 === 0) === firstLight ? 'light' : 'dark'; });
  return tones;
}
