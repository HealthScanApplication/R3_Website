/*
 * Sections of a Guardian's public page alternate dark and light down the page. Most sections have a fixed tone (the shop and
 * events are dark; the offers and retreats are light). The sections that can sit anywhere (the email sign-up and the brands
 * row) take whichever tone is opposite the section above them, so two dark or two light sections never meet.
 */
import type { PageSectionKey } from './pageSections';

export type Tone = 'light' | 'dark';

/** Fixed tones; a section missing here is flexible. */
export const FIXED_TONES: Partial<Record<PageSectionKey, Tone>> = { offers: 'light', shop: 'dark', events: 'dark', talks: 'light', treats: 'dark', forum: 'light', retreats: 'light' };

/**
 * The tone of every section that will show, in page order. The hero above the first section is dark. `overrides` fixes the
 * tone of a section that is not flexible after all (the offer funnel's sign-up is dark over a picture, else light).
 */
export function sectionTones(order: PageSectionKey[], shown: ReadonlySet<PageSectionKey>, overrides: Partial<Record<PageSectionKey, Tone>> = {}): Partial<Record<PageSectionKey, Tone>> {
  const tones: Partial<Record<PageSectionKey, Tone>> = {};
  let previous: Tone = 'dark';
  for (const key of order) {
    if (!shown.has(key)) continue;
    const tone = overrides[key] ?? FIXED_TONES[key] ?? (previous === 'dark' ? 'light' : 'dark');
    tones[key] = tone;
    previous = tone;
  }
  return tones;
}
