/**
 * Pure necklace-flip timing (no three.js, no DOM). The clip hangs from a cord
 * and slowly turns front -> back -> front while swinging slightly.
 *
 * 12 s cycle: ease 0 -> pi over 2.5 s, hold pi for 3.5 s, ease pi -> 2pi over
 * 2.5 s, hold 2pi (front again) for 3.5 s. `yaw` is reduced modulo 2pi into
 * [0, 2pi), so the final hold reads 0 (front).
 */

const TAU = Math.PI * 2;
const PERIOD = 12;
const EASE = 2.5;
const HOLD = 3.5;
const SWING_AMPLITUDE = 0.06;
const SWING_PERIOD = 5;

/** Cosine ease: zero velocity at both ends. */
const ease = (x: number): number => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, x)))) / 2;

export function necklacePose(
  timeSeconds: number,
  reducedMotion: boolean,
): { yaw: number; swing: number } {
  if (reducedMotion || !Number.isFinite(timeSeconds)) return { yaw: 0, swing: 0 };

  const p = ((timeSeconds % PERIOD) + PERIOD) % PERIOD;
  let raw: number;
  if (p < EASE) raw = Math.PI * ease(p / EASE);
  else if (p < EASE + HOLD) raw = Math.PI;
  else if (p < 2 * EASE + HOLD) raw = Math.PI + Math.PI * ease((p - EASE - HOLD) / EASE);
  else raw = TAU;

  const yaw = raw >= TAU ? 0 : raw;
  const swing = SWING_AMPLITUDE * Math.sin((TAU * timeSeconds) / SWING_PERIOD);
  return { yaw, swing };
}
