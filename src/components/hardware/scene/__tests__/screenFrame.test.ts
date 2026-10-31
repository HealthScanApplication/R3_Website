// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { heartbeatY } from '../heartbeat';
import { BEAT_RING, SCREEN_PX, drawScreen, screenFrameAt, traceRect, type ScreenContext } from '../heroScene';

type Seg = { kind: 'line'; pts: Array<[number, number]> } | { kind: 'arc'; cx: number; cy: number; r: number };
type Stroke = { seg: Seg[]; style: string; width: number; alpha: number; blur: number };

/** A stub 2D context that records every stroked path with the state it was stroked with. */
function recorder() {
  const strokes: Stroke[] = [];
  const fills: Array<{ x: number; y: number; w: number; h: number; style: string }> = [];
  let path: Seg[] = [];
  const stack: Array<Record<string, unknown>> = [];
  const ctx = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1, shadowBlur: 0, shadowColor: 'transparent',
    lineJoin: 'miter', lineCap: 'butt',
    save() { stack.push({ ...this }); },
    restore() { Object.assign(this, stack.pop()); },
    fillRect(x: number, y: number, w: number, h: number) { fills.push({ x, y, w, h, style: String(this.fillStyle) }); },
    beginPath() { path = []; },
    moveTo(x: number, y: number) { path.push({ kind: 'line', pts: [[x, y]] }); },
    lineTo(x: number, y: number) {
      const last = path[path.length - 1];
      if (last && last.kind === 'line') last.pts.push([x, y]); else path.push({ kind: 'line', pts: [[x, y]] });
    },
    arc(cx: number, cy: number, r: number) { path.push({ kind: 'arc', cx, cy, r }); },
    stroke() {
      strokes.push({ seg: path, style: String(this.strokeStyle), width: this.lineWidth, alpha: this.globalAlpha, blur: this.shadowBlur });
    },
  };
  return { ctx: ctx as unknown as ScreenContext, strokes, fills };
}

const MINT = /^#c7d99f$/i;
const lineStrokes = (s: Stroke[]) => s.filter(x => x.seg.some(g => g.kind === 'line') && x.alpha > 0);
const ringStrokes = (s: Stroke[]) => s.filter(x => x.seg.some(g => g.kind === 'arc') && x.alpha > 0);
const UV = { u0: 0.28, v0: 0.14, u1: 0.72, v1: 0.235 };

describe('traceRect', () => {
  it('maps the clip\'s visible lower band to canvas pixels (flipY: canvas y = (1 - v) × 256)', () => {
    expect(SCREEN_PX).toBe(256);
    expect(traceRect(UV)).toEqual({ x0: 72, y0: 196, x1: 184, y1: 220 });
  });
});

describe('drawScreen', () => {
  it('paints the near-black background over the whole canvas', () => {
    const { ctx, fills } = recorder();
    drawScreen(ctx, { scroll: 0, pulse: 0 }, UV);
    expect(fills[0]).toEqual({ x: 0, y: 0, w: 256, h: 256, style: '#05070a' });
  });

  it('strokes the ECG only inside the lower band, in mint, with a glow', () => {
    for (const scroll of [0, 0.13, 0.46, 0.77]) {
      const { ctx, strokes } = recorder();
      drawScreen(ctx, { scroll, pulse: 0 }, UV);
      const traces = lineStrokes(strokes);
      expect(traces.length).toBeGreaterThanOrEqual(1);
      for (const s of traces) {
        expect(s.style).toMatch(MINT);
        expect(s.width).toBeGreaterThanOrEqual(2);
        expect(s.width).toBeLessThanOrEqual(4);
        expect(s.blur).toBeGreaterThan(0);
        const pts = s.seg.flatMap(g => (g.kind === 'line' ? g.pts : []));
        expect(pts.length).toBe(96);
        for (const [x, y] of pts) {
          expect(x).toBeGreaterThanOrEqual(72); expect(x).toBeLessThanOrEqual(184);
          expect(y).toBeGreaterThanOrEqual(196); expect(y).toBeLessThanOrEqual(220);
        }
        // The trace spans the band's full width and its spike rises well above the baseline.
        expect(Math.min(...pts.map(p => p[0]))).toBeCloseTo(72, 6);
        expect(Math.max(...pts.map(p => p[0]))).toBeCloseTo(184, 6);
        expect(Math.min(...pts.map(p => p[1]))).toBeLessThan(200);
      }
    }
  });

  it('draws nothing outside the trace band and the beat annulus', () => {
    const { ctx, strokes } = recorder();
    drawScreen(ctx, { scroll: 0.3, pulse: 1 }, UV);
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) for (const g of s.seg) {
      if (g.kind === 'arc') continue;
      for (const [x, y] of g.pts) expect(x >= 72 && x <= 184 && y >= 196 && y <= 220).toBe(true);
    }
  });

  it('strokes the beat ring inside the annulus between the button and the dots, alpha = pulse', () => {
    const { ctx, strokes } = recorder();
    drawScreen(ctx, { scroll: 0, pulse: 0.8 }, UV);
    const rings = ringStrokes(strokes);
    expect(rings.length).toBe(1);
    const [s] = rings;
    expect(s.style).toMatch(MINT);
    expect(s.alpha).toBeCloseTo(0.8, 6);
    expect(s.blur).toBeGreaterThan(0);
    for (const g of s.seg) {
      if (g.kind !== 'arc') throw new Error('the ring path must only hold arcs');
      expect(g.cx).toBe(128); expect(g.cy).toBe(128);
      expect(g.r - s.width / 2).toBeGreaterThanOrEqual(BEAT_RING.inner);
      expect(g.r + s.width / 2).toBeLessThanOrEqual(BEAT_RING.outer);
    }
    expect(BEAT_RING).toMatchObject({ cx: 128, cy: 128, inner: 69, outer: 97 });
  });

  it('draws no ring when the pulse is zero', () => {
    const { ctx, strokes } = recorder();
    drawScreen(ctx, { scroll: 0, pulse: 0 }, UV);
    expect(ringStrokes(strokes)).toHaveLength(0);
  });
});

describe('screenFrameAt', () => {
  const BPM = 62;
  const timeAtPhase = (phase: number) => (phase * 60) / BPM;

  it('scrolls with the beat phase and flashes the ring with max(0, heartbeatY)', () => {
    const spike = screenFrameAt(timeAtPhase(0.46), false);
    expect(spike.scroll).toBeCloseTo(0.46, 6);
    expect(spike.pulse).toBeCloseTo(1, 6);
    const between = screenFrameAt(timeAtPhase(0.05), false);
    expect(between.pulse).toBe(0);
    const dip = screenFrameAt(timeAtPhase(0.41), false); // Q dip: heartbeatY < 0, clamped
    expect(heartbeatY(0.41)).toBeLessThan(0);
    expect(dip.pulse).toBe(0);
    expect(screenFrameAt(timeAtPhase(1.3), false).scroll).toBeCloseTo(0.3, 6);
  });

  it('returns one static, visible frame under reduced motion whatever the time', () => {
    const a = screenFrameAt(0, true);
    expect(a.pulse).toBeGreaterThan(0.2);
    for (const t of [0.4, 3.3, 100]) expect(screenFrameAt(t, true)).toEqual(a);
    const { ctx, strokes } = recorder();
    drawScreen(ctx, a, UV);
    expect(lineStrokes(strokes).length).toBeGreaterThanOrEqual(1);
    expect(ringStrokes(strokes)).toHaveLength(1);
  });
});
