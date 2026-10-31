import { describe, expect, it } from 'vitest';
import { beatPhaseAt, heartbeatPoints, heartbeatY } from '../heartbeat';

const sample = (n = 1000) =>
  Array.from({ length: n }, (_, i) => ({ p: i / n, y: heartbeatY(i / n) }));

describe('heartbeatY', () => {
  it('is periodic: phase 0 and 1 give the same value', () => {
    expect(heartbeatY(0)).toBe(heartbeatY(1));
    expect(heartbeatY(0.46)).toBeCloseTo(heartbeatY(1.46), 12);
    expect(heartbeatY(0.46)).toBeCloseTo(heartbeatY(-0.54), 12);
    expect(heartbeatY(0.37)).toBeCloseTo(heartbeatY(-0.63), 12);
  });

  it('stays within [-1, 1]', () => {
    for (const { y } of sample()) {
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it('has its QRS peak (about +1) in the middle third of the beat', () => {
    const pts = sample();
    const top = pts.reduce((a, b) => (b.y > a.y ? b : a));
    expect(Math.abs(top.y - 1)).toBeLessThan(0.02);
    expect(top.p).toBeGreaterThan(1 / 3);
    expect(top.p).toBeLessThan(2 / 3);
  });

  it('dips clearly below zero around the spike', () => {
    expect(Math.min(...sample().map((s) => s.y))).toBeLessThan(-0.2);
  });

  it('has a flat baseline at the ends of the beat', () => {
    expect(Math.abs(heartbeatY(0.02))).toBeLessThan(0.05);
    expect(Math.abs(heartbeatY(0.98))).toBeLessThan(0.05);
  });
});

describe('heartbeatPoints', () => {
  it('returns `samples` points spanning 0..width with y inside [0, height]', () => {
    const pts = heartbeatPoints(300, 80, 120, 0);
    expect(pts).toHaveLength(120);
    expect(pts[0][0]).toBe(0);
    expect(pts[pts.length - 1][0]).toBeCloseTo(300, 9);
    for (const [, y] of pts) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(80);
    }
  });

  it('shifts when scroll changes', () => {
    const a = heartbeatPoints(300, 80, 120, 0);
    const b = heartbeatPoints(300, 80, 120, 0.25);
    expect(b.map((p) => p[1])).not.toEqual(a.map((p) => p[1]));
  });
});

describe('beatPhaseAt', () => {
  it('is ~0 after exactly three beats at 62 bpm', () => {
    const p = beatPhaseAt((60 / 62) * 3, 62);
    expect(Math.min(p, 1 - p)).toBeLessThan(1e-9);
  });

  it('stays in [0, 1)', () => {
    for (const t of [0, 0.3, 7.7, 1234.5, -2.2]) {
      const p = beatPhaseAt(t, 62);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
});
