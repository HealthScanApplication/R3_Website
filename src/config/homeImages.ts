// The homepage's own pictures, as the optimised files scripts/make-home-images.sh makes from the PNG masters in
// src/assets. Plain URLs under /images (not imports) so index.html can preload the hero before the app has started.
// Each has a few widths for srcset, a ~200-byte blurred data URI to show while it loads, and the picture's average colour.
import { APP_MEAL_LQIP, APP_NEED_LQIP, APP_RISK_LQIP, HERO_LQIP } from './homeImagePlaceholders';

export interface HomeImage {
  src: string;
  srcSet: string;
  /** Intrinsic size of the largest file. */
  width: number;
  height: number;
  lqip: string;
  color: string;
}

const set = (base: string, widths: number[]) => widths.map((w) => `${base}-${w}.webp ${w}w`).join(', ');

export const HERO_COVER: HomeImage = {
  src: '/images/hero/cover-1440.webp',
  srcSet: set('/images/hero/cover', [960, 1440, 1920]),
  width: 1920,
  height: 1048,
  lqip: HERO_LQIP,
  color: '#7fdcd6',
};

/** The three real app screenshots (phone screens, 1290x2796 / 1126x2436 originals). */
export const APP_SHOTS = {
  need: { src: '/images/app/need-600.webp', srcSet: set('/images/app/need', [400, 600, 900]), width: 900, height: 1951, lqip: APP_NEED_LQIP, color: '#cee7df' },
  risk: { src: '/images/app/risk-600.webp', srcSet: set('/images/app/risk', [400, 600, 900]), width: 900, height: 1951, lqip: APP_RISK_LQIP, color: '#e9d4d5' },
  meal: { src: '/images/app/meal-600.webp', srcSet: set('/images/app/meal', [400, 600, 900]), width: 900, height: 1947, lqip: APP_MEAL_LQIP, color: '#c3bdb4' },
} satisfies Record<string, HomeImage>;

/** The hero preload in index.html must name exactly these two strings (src/utils/__tests__/homeImages.test.ts checks). */
export const HERO_SIZES = '100vw';
