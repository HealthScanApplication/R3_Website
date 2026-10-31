// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RING_FILL, REST_YAW, WATCH_SWING, MIN_OFF_AXIS, WATCH_PERIOD, nestRing, watchYaw } from '../nest';

// The bracelet's hole (mm, hole axis X): 38 wide, 41 tall inner, 65 deep inner, centred off the origin.
const hole = { min: { x: -19, y: -20.5, z: -34 }, max: { x: 19, y: 20.5, z: 31 } };
// A unit ring whose hole axis is its Y (thin) axis: outer diameter 1, width 0.3.
const ring = { min: { x: -0.5, y: -0.15, z: -0.5 }, max: { x: 0.5, y: 0.15, z: 0.5 } };

describe('nestRing', () => {
  it('puts the ring on the hole centre (concentric)', () => {
    const n = nestRing(hole, ring, 'x', 'y');
    expect(n.centre).toEqual({ x: 0, y: 0, z: -1.5 });
  });

  it('scales the ring outer diameter to the fill fraction of the hole\'s smaller inner diameter', () => {
    const n = nestRing(hole, ring, 'x', 'y');
    expect(RING_FILL).toBeGreaterThanOrEqual(0.55);
    expect(RING_FILL).toBeLessThanOrEqual(0.65);
    expect(n.holeInner).toBe(41);
    expect(n.ringOuter).toBeCloseTo(41 * RING_FILL, 9);
    expect(n.scale).toBeCloseTo(41 * RING_FILL, 9);   // the unit ring's outer diameter is 1
    for (const f of [0.55, 0.65]) {
      const m = nestRing(hole, ring, 'x', 'y', f);
      expect(m.ringOuter / m.holeInner).toBeCloseTo(f, 9);
    }
  });

  it('leaves clearance all round, even while the ring turns in any direction (bounding sphere inside the hole)', () => {
    const n = nestRing(hole, ring, 'x', 'y');
    expect(n.clearance).toBeGreaterThan(0);
    expect(n.clearance).toBeCloseTo((41 - 41 * RING_FILL) / 2, 9);
    const sphere = (Math.hypot(1, 0.3) / 2) * n.scale;
    expect(sphere).toBeLessThan(n.holeInner / 2);
  });

  it('reads the right axes whatever the box order', () => {
    // Same hole with its axis along Z instead.
    const zHole = { min: { x: -20.5, y: -32.5, z: -19 }, max: { x: 20.5, y: 32.5, z: 19 } };
    const zRing = { min: { x: -0.1, y: -0.5, z: -0.5 }, max: { x: 0.1, y: 0.5, z: 0.5 } };
    const n = nestRing(zHole, zRing, 'z', 'x');
    expect(n.holeInner).toBe(41);
    expect(n.scale).toBeCloseTo(41 * RING_FILL, 9);
  });
});

describe('watchYaw', () => {
  it('starts at the resting three-quarter view and is static under reduced motion', () => {
    expect(watchYaw(0, false)).toBeCloseTo(REST_YAW, 9);
    for (const t of [0, 3, 50]) expect(watchYaw(t, true)).toBe(REST_YAW);
    expect(Math.abs(REST_YAW)).toBeGreaterThan(0.3);
    expect(Math.abs(REST_YAW)).toBeLessThanOrEqual(0.85);
  });

  it('eases about the resting view and never turns straight on, so the case never hides the ring', () => {
    expect(WATCH_PERIOD).toBe(10);
    expect(WATCH_SWING).toBeGreaterThan(0.25);
    expect(Math.abs(REST_YAW) - WATCH_SWING).toBeCloseTo(MIN_OFF_AXIS, 9);
    expect(MIN_OFF_AXIS).toBeGreaterThanOrEqual(0.4);
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < 20; t += 0.01) {
      const y = watchYaw(t, false);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
      expect(watchYaw(t + WATCH_PERIOD, false)).toBeCloseTo(y, 9);
      // Eased: the step per 10 ms never jumps.
      expect(Math.abs(watchYaw(t + 0.01, false) - y)).toBeLessThan(0.01);
      // Never within MIN_OFF_AXIS of facing the camera.
      expect(Math.abs(y)).toBeGreaterThanOrEqual(MIN_OFF_AXIS - 1e-9);
    }
    expect(hi).toBeCloseTo(REST_YAW + WATCH_SWING, 3);
    expect(lo).toBeCloseTo(REST_YAW - WATCH_SWING, 3);
  });
});
