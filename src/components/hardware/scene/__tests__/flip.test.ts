import { describe, expect, it } from 'vitest';
import { necklacePose } from '../flip';

const TAU = Math.PI * 2;

describe('necklacePose', () => {
  it('starts at the front', () => {
    expect(necklacePose(0, false).yaw).toBe(0);
  });

  it('reaches the back (pi) at 2.5 s and holds through 6 s', () => {
    expect(Math.abs(necklacePose(2.5, false).yaw - Math.PI)).toBeLessThan(1e-9);
    expect(Math.abs(necklacePose(4, false).yaw - Math.PI)).toBeLessThan(1e-9);
    expect(Math.abs(necklacePose(6, false).yaw - Math.PI)).toBeLessThan(1e-9);
  });

  it('is front again (0 modulo 2pi) from 8.5 s to the end of the cycle', () => {
    for (const t of [8.5, 10, 11.99]) {
      const y = necklacePose(t, false).yaw;
      expect(Math.min(y, TAU - y)).toBeLessThan(1e-9);
    }
  });

  it('is periodic with a 12 s period', () => {
    for (const t of [0.4, 1.7, 3, 7.1, 9.3]) {
      expect(necklacePose(t + 12, false).yaw).toBeCloseTo(necklacePose(t, false).yaw, 9);
      expect(necklacePose(t + 120, false).swing).toBeCloseTo(
        0.06 * Math.sin((TAU * (t + 120)) / 5),
        9,
      );
    }
  });

  it('is always finite and in [0, 2pi), including negative and huge times', () => {
    for (const t of [-100.3, -0.001, 0, 5.5, 11.999, 12, 1e6 + 0.37, 1e9]) {
      const y = necklacePose(t, false).yaw;
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(TAU);
    }
  });

  it('eases: near-zero velocity at the start of the transition', () => {
    expect(Math.abs(necklacePose(0.05, false).yaw)).toBeLessThan(0.02);
    expect(Math.abs(necklacePose(2.45, false).yaw - Math.PI)).toBeLessThan(0.02);
  });

  it('is monotonic through the first half-turn', () => {
    let prev = -1;
    for (let t = 0; t <= 2.5; t += 0.05) {
      const y = necklacePose(t, false).yaw;
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it('swing is a bounded pendulum of 0.06 rad', () => {
    for (let t = 0; t < 20; t += 0.37) {
      const s = necklacePose(t, false).swing;
      expect(Math.abs(s)).toBeLessThanOrEqual(0.06 + 1e-12);
    }
    expect(necklacePose(1.25, false).swing).toBeCloseTo(0.06, 9);
  });

  it('returns a still pose under reduced motion', () => {
    for (const t of [0, 1.3, 2.5, 7, 100]) {
      expect(necklacePose(t, true)).toEqual({ yaw: 0, swing: 0 });
    }
  });
});
