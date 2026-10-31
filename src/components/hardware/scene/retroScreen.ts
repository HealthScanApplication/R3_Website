/**
 * The R³ Retro watch screen, ported from the owner's Pod Plan artifact (`necklaceScreen`, lines ~1747-1790):
 * a pixel heart beating at the measured rate inside a circular pulse trace that spins round, each beat kicking
 * outward and the trail fading out in an ordered (Bayer) dither, as e-paper fades. Time and heart rate run along
 * the right edge, which is the upper-right edge once the case hangs as a diamond.
 *
 * Changed: a pure drawing function over a 2D context (no canvas, no texture), drawn straight in two inks (the
 * artifact drew black-on-white and then remapped every pixel via getImageData); the default scheme is the black
 * colourway's light on dark, and the white finish passes black on white (finishes.ts); the small "use" icon at the
 * top is dropped; beat timing comes from heartbeat.ts `beatPhaseAt`. All geometry is in the artifact's 200 px design
 * space, scaled to `size`.
 */
import { beatPhaseAt } from './heartbeat';

export type RetroScreenContext = Pick<CanvasRenderingContext2D,
  'fillStyle' | 'font' | 'textAlign' | 'setTransform' | 'save' | 'restore' | 'translate' | 'rotate' | 'fillRect' | 'fillText'>;

export const RETRO_BPM = 62;
export const HEART = ['..XX...XX..', '.XXXX.XXXX.', 'XXXXXXXXXXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..XXXXXXX..', '...XXXXX...', '....XXX....', '.....X.....'];
const N = 200;
/** The screen's two inks: `ink` drawn on `ground`. Default = the black colourway, light on dark. */
export type ScreenScheme = { ink: string; ground: string };
export const DEFAULT_SCREEN_SCHEME: Readonly<ScreenScheme> = Object.freeze({ ink: '#ffffff', ground: '#000000' });
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const TRAIL = 600, TRAIL_ARC = (Math.PI * 5) / 3, TRACE_R = 56;
/** Reduced motion: one fixed moment, mid-beat, so the trace shows a kick. */
const STATIC_T = 0.12;

/** The artifact's pulse shape over one beat: a small P wave, the sharp spike, a dip, then the T wave (px). */
const wave = (p: number) => (p < 0.06 ? 2 * Math.sin((p / 0.06) * Math.PI) : p < 0.1 ? 0 : p < 0.13 ? ((p - 0.1) / 0.03) * 16
  : p < 0.16 ? 16 - ((p - 0.13) / 0.03) * 22 : p < 0.19 ? -6 + ((p - 0.16) / 0.03) * 6
    : p > 0.32 && p < 0.44 ? 3 * Math.sin(((p - 0.32) / 0.12) * Math.PI) : 0);

export function drawRetroScreen(
  ctx: RetroScreenContext, size: number, timeSeconds: number, bpm = RETRO_BPM, reducedMotion = false,
  scheme: ScreenScheme = DEFAULT_SCREEN_SCHEME,
): void {
  const t = reducedMotion || !Number.isFinite(timeSeconds) ? STATIC_T : timeSeconds;
  const period = 60 / bpm, spin = Math.PI / period, k = size / N;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = scheme.ground;
  ctx.fillRect(0, 0, size, size);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = scheme.ink;
  // The heart, leaning 33°, a pixel bigger on the beat.
  const p = beatPhaseAt(t, bpm), s = p < 0.12 || (p > 0.2 && p < 0.28) ? 4 : 3;
  ctx.save();
  ctx.translate(100, 100); ctx.rotate((33 * Math.PI) / 180); ctx.translate(-100, -100);
  HEART.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') ctx.fillRect(100 - (11 * s) / 2 + x * s, 100 - (9 * s) / 2 + y * s, s, s); }));
  ctx.restore();
  // The head turns once every two beats; the trail behind it reaches back 300° and thins out.
  for (let i = 0; i < TRAIL; i++) {
    const f = i / TRAIL, back = f * TRAIL_ARC, ang = t * spin - back - Math.PI / 2;
    const r = TRACE_R + wave(beatPhaseAt(t - back / spin, bpm)) * 0.9;
    const x = Math.round(100 + Math.cos(ang) * r), y = Math.round(100 + Math.sin(ang) * r);
    if ((BAYER[y & 3][x & 3] + 0.5) / 16 < 1 - f) ctx.fillRect(x, y, 2, 2);
  }
  ctx.save();
  ctx.translate(184, 100); ctx.rotate(Math.PI / 2);
  ctx.font = '400 8px Silkscreen, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`9:41   ${Math.round(bpm)} BPM`, 0, 0);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
