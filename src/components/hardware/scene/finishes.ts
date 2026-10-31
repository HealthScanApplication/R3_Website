/**
 * The R³ device finishes (pure, no three.js): White, Black and Silver. Each finish gives the ring's material, the
 * watch body and bracelet material, the watch screen's two inks, and the swatch colour and label for the picker.
 * Black is today's look (ringModel.ts, retroClipModel.ts BODY, retroScreen.ts inks); the hero stays on it.
 */
import { DEFAULT_SCREEN_SCHEME, type ScreenScheme } from './retroScreen';

export type Finish = 'white' | 'black' | 'silver';
export const FINISHES: Finish[] = ['white', 'black', 'silver'];
export const DEFAULT_FINISH: Finish = 'white';
export type { ScreenScheme };

export type MaterialParams = { color: string; metalness: number; roughness: number };
export type FinishSpec = {
  label: string;
  /** Display colour for the picker's swatch. */
  swatch: string;
  ring: MaterialParams;
  /** The watch case and bracelet (one mesh). */
  watch: MaterialParams;
  /** The watch screen: `ink` drawn on `ground`; the face around the window is `ground` too. */
  screen: ScreenScheme;
  /** A thin ring around the watch face's screen ground, only where the face and case would read as one (White). */
  bezel?: string;
};

export const FINISH_SPECS: Record<Finish, FinishSpec> = {
  white: {
    label: 'White',
    swatch: '#f2f1ec',
    ring: { color: '#f2f1ec', metalness: 0.05, roughness: 0.25 },
    watch: { color: '#f2f1ec', metalness: 0.05, roughness: 0.25 },
    screen: { ink: '#111111', ground: '#f4f2ec' },
    bezel: '#1a1a1a',
  },
  black: {
    label: 'Black',
    swatch: '#1b1c1a',
    ring: { color: '#1b1c1a', metalness: 0.9, roughness: 0.35 },
    watch: { color: '#2a2e2d', metalness: 1, roughness: 0.32 },
    screen: { ...DEFAULT_SCREEN_SCHEME },
  },
  silver: {
    label: 'Silver',
    swatch: '#c9ced0',
    ring: { color: '#c9ced0', metalness: 1, roughness: 0.3 },
    watch: { color: '#c9ced0', metalness: 1, roughness: 0.3 },
    screen: { ...DEFAULT_SCREEN_SCHEME },
  },
};

export const finishSpec = (f: Finish | undefined): FinishSpec => FINISH_SPECS[f ?? 'black'] ?? FINISH_SPECS.black;
