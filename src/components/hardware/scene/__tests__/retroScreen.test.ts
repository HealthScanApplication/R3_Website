import { describe, expect, it } from 'vitest';
import { HEART, RETRO_BPM, drawRetroScreen, type RetroScreenContext } from '../retroScreen';

type Call = { op: string; args: unknown[]; fill: string; depth: number };

function stub() {
  const calls: Call[] = [];
  let depth = 0;
  const ctx = {
    fillStyle: '' as string,
    font: '',
    textAlign: 'start' as CanvasTextAlign,
    setTransform: (...a: unknown[]) => calls.push({ op: 'setTransform', args: a, fill: String(ctx.fillStyle), depth }),
    save: () => { depth++; },
    restore: () => { depth--; },
    translate: (...a: unknown[]) => calls.push({ op: 'translate', args: a, fill: String(ctx.fillStyle), depth }),
    rotate: (...a: unknown[]) => calls.push({ op: 'rotate', args: a, fill: String(ctx.fillStyle), depth }),
    fillRect: (...a: unknown[]) => calls.push({ op: 'fillRect', args: a, fill: String(ctx.fillStyle), depth }),
    fillText: (...a: unknown[]) => calls.push({ op: 'fillText', args: a, fill: String(ctx.fillStyle), depth }),
  };
  return { ctx: ctx as unknown as RetroScreenContext, calls };
}

const heartCells = HEART.join('').split('').filter(c => c === 'X').length;

describe('drawRetroScreen', () => {
  it('fills black e-paper, then draws the pixel heart in white ink', () => {
    const { ctx, calls } = stub();
    drawRetroScreen(ctx, 200, 0.3, RETRO_BPM, false);
    const rects = calls.filter(c => c.op === 'fillRect');
    expect(rects[0]).toMatchObject({ args: [0, 0, 200, 200], fill: '#000000' });
    // The heart is drawn inside a save/rotate block (depth 1), one square per X cell.
    const heart = rects.filter(c => c.depth === 1);
    expect(heart.length).toBe(heartCells);
    heart.forEach(c => expect(c.fill).toBe('#ffffff'));
  });

  it('keeps the circular pulse trace inside the screen, around the heart', () => {
    for (const t of [0, 0.2, 0.47, 1.3, 7.9]) {
      const { ctx, calls } = stub();
      drawRetroScreen(ctx, 200, t, RETRO_BPM, false);
      const dots = calls.filter(c => c.op === 'fillRect' && c.depth === 0).slice(1);
      expect(dots.length).toBeGreaterThan(50);
      dots.forEach(c => {
        const [x, y] = c.args as number[];
        const r = Math.hypot(x - 100, y - 100);
        expect(r).toBeGreaterThan(40);
        expect(r).toBeLessThan(80);
      });
    }
  });

  it('scales to the canvas size', () => {
    const { ctx, calls } = stub();
    drawRetroScreen(ctx, 400, 0.3, RETRO_BPM, false);
    expect(calls.find(c => c.op === 'fillRect')!.args).toEqual([0, 0, 400, 400]);
    expect(calls[0]).toMatchObject({ op: 'setTransform', args: [1, 0, 0, 1, 0, 0] });
    expect(calls.some(c => c.op === 'setTransform' && c.args[0] === 2)).toBe(true);
  });

  it('writes the time and heart rate along the edge', () => {
    const { ctx, calls } = stub();
    drawRetroScreen(ctx, 200, 0, 62, false);
    expect(calls.find(c => c.op === 'fillText')!.args[0]).toMatch(/9:41\s+62 BPM/);
  });

  it('spins and beats with time, but draws one identical frame under reduced motion', () => {
    const frame = (t: number, reduced: boolean) => { const s = stub(); drawRetroScreen(s.ctx, 200, t, RETRO_BPM, reduced); return JSON.stringify(s.calls); };
    expect(frame(0.1, false)).not.toBe(frame(0.6, false));
    expect(frame(0.1, true)).toBe(frame(0.6, true));
    expect(frame(3.7, true)).toBe(frame(0, true));
  });
});
