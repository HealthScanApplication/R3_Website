/**
 * Pure ECG-style heartbeat helpers (no three.js, no DOM).
 *
 * Beat anatomy over phase [0, 1), every part a compact-support cos^2 bump so
 * the baseline is exactly 0 outside the bumps and beats join cleanly:
 *   P wave  centre 0.20, half-width 0.07, +0.18   small rounded atrial bump
 *   Q dip   centre 0.41, half-width 0.025, -0.35  small dip before the spike
 *   R spike centre 0.46, half-width 0.035, +1.00  sharp QRS peak
 *   S dip   centre 0.51, half-width 0.025, -0.35  small dip after the spike
 *   T wave  centre 0.72, half-width 0.09, +0.30   rounded recovery bump
 * Everything else (including both ends of the beat) is flat 0.
 */

type Bump = readonly [centre: number, halfWidth: number, amplitude: number];

const BUMPS: readonly Bump[] = [
  [0.2, 0.07, 0.18], // P
  [0.41, 0.025, -0.35], // Q
  [0.46, 0.035, 1], // R
  [0.51, 0.025, -0.35], // S
  [0.72, 0.09, 0.3], // T
];

/** Number of beats visible across the trace width. */
const VISIBLE_BEATS = 2;

const wrap01 = (x: number): number => {
  const w = x - Math.floor(x);
  return w >= 1 ? 0 : w;
};

/** One beat, value in [-1, 1], exactly periodic in `phase`. */
export function heartbeatY(phase: number): number {
  const p = wrap01(phase);
  let y = 0;
  for (const [c, hw, amp] of BUMPS) {
    const d = Math.abs(p - c);
    if (d < hw) {
      const k = Math.cos((Math.PI / 2) * (d / hw));
      y += amp * k * k;
    }
  }
  return y;
}

/**
 * Canvas-space points for a scrolling trace. `scroll` in [0, 1) shifts the
 * trace left by that fraction of one beat. y = 0 is the top (canvas style).
 */
export function heartbeatPoints(
  width: number,
  height: number,
  samples: number,
  scroll: number,
): Array<[number, number]> {
  const n = Math.max(2, Math.floor(samples));
  const mid = height / 2;
  const amp = height * 0.45;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    pts.push([u * width, mid - heartbeatY(u * VISIBLE_BEATS + scroll) * amp]);
  }
  return pts;
}

/** Beat phase in [0, 1) at `timeSeconds` for a given beats-per-minute. */
export function beatPhaseAt(timeSeconds: number, bpm: number): number {
  return wrap01((timeSeconds * bpm) / 60);
}
