import { describe, expect, it } from 'vitest';
import { creatorCredit, creditInitial, drawCredit, measureCredit, splitCredit } from '../postCredit';

/** A canvas context that records what is drawn and in which order; text is 0.5 × its font size wide per character. */
function recorder() {
  const log: Array<[string, ...unknown[]]> = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === 'measureText') return (text: string) => ({ width: text.length * Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10) * 0.5 });
      return prop in state ? state[prop] : (...args: unknown[]) => { log.push([prop, ...args]); };
    },
    set: (_t, prop: string, value) => { state[prop] = value; log.push([`set:${prop}`, value]); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}
const fills = (log: Array<[string, ...unknown[]]>) => log.filter(([k]) => k === 'set:fillStyle').map(([, v]) => String(v));
const texts = (log: Array<[string, ...unknown[]]>) => log.filter(([k]) => k === 'fillText').map(([, t]) => String(t));
const picture = (w: number, h: number) => ({ image: { naturalWidth: w, naturalHeight: h } as unknown as HTMLImageElement, fit: 'cover' as const });

describe('creatorCredit', () => {
  it('says "From @handle" and does not repeat the name when the Guardian has a page handle', () => {
    const credit = creatorCredit("Barbara O'Neill", '@barbara-oneill');
    expect(credit).toBe('From @barbara-oneill');
    expect(credit.toLowerCase()).not.toContain('neill o');
    expect(credit).not.toMatch(/guidance|·/i);
  });

  it('falls back to the name when there is no handle to say it for them', () => {
    expect(creatorCredit("Barbara O'Neill", null)).toBe("Guidance by Barbara O'Neill");
    expect(creatorCredit("Barbara O'Neill", '   ')).toBe("Guidance by Barbara O'Neill");
  });

  it('credits nobody when there is no creator, even with a handle', () => {
    expect(creatorCredit('', '@x')).toBe('');
    expect(creatorCredit('   ', '@x')).toBe('');
    expect(creatorCredit(undefined, '@x')).toBe('');
  });
});

describe('splitCredit and creditInitial', () => {
  it('splits the quiet lead from the name or handle', () => {
    expect(splitCredit('From @barbara-oneill')).toEqual({ lead: 'From', name: '@barbara-oneill' });
    expect(splitCredit("Guidance by Barbara O'Neill")).toEqual({ lead: 'Guidance by', name: "Barbara O'Neill" });
    expect(splitCredit('Barbara')).toEqual({ lead: '', name: 'Barbara' });
  });

  it('takes the initial from the handle or name, never from "From"', () => {
    expect(creditInitial('From @barbara-oneill')).toBe('B');
    expect(creditInitial("Guidance by Barbara O'Neill")).toBe('B');
    expect(creditInitial('Barbara')).toBe('B');
  });
});

describe('measureCredit', () => {
  it('has no pill without a credit', () => {
    expect(measureCredit(recorder().ctx, '', 1)).toBeNull();
    expect(measureCredit(recorder().ctx, '  ', 1)).toBeNull();
  });

  it('makes the picture more than twice the old 34 px and the pill wrap it', () => {
    const box = measureCredit(recorder().ctx, 'From @barbara-oneill', 1)!;
    expect(box.face).toBeGreaterThanOrEqual(68);
    expect(box.h).toBeGreaterThan(box.face);
    expect(box.w).toBeGreaterThan(box.face + box.leadW);
  });

  it('scales with the frame', () => {
    const one = measureCredit(recorder().ctx, 'From @barbara-oneill', 1)!;
    const half = measureCredit(recorder().ctx, 'From @barbara-oneill', 0.5)!;
    expect(half.face).toBeCloseTo(one.face / 2);
    expect(half.w).toBeCloseTo(one.w / 2, 0);
  });

  it('shrinks its text rather than run wider than the column', () => {
    const wide = measureCredit(recorder().ctx, 'From @a-very-long-guardian-handle-that-goes-on-and-on', 1)!;
    const fitted = measureCredit(recorder().ctx, 'From @a-very-long-guardian-handle-that-goes-on-and-on', 1, 600)!;
    expect(wide.w).toBeGreaterThan(600);
    expect(fitted.w).toBeLessThanOrEqual(600 + 0.001);
    expect(fitted.size).toBeLessThan(wide.size);
  });
});

describe('drawCredit', () => {
  const draw = (credit: string, pic: ReturnType<typeof picture> | null) => {
    const { ctx, log } = recorder();
    const box = measureCredit(ctx, credit, 1)!;
    drawCredit(ctx, credit, box, 100, 200, pic);
    return { log, box };
  };

  it('draws a black pill, not a white strip', () => {
    const { log } = draw('From @barbara-oneill', picture(400, 400));
    const first = fills(log)[0];
    expect(first).toMatch(/^rgba\(11,12,9/);
    expect(fills(log).some((f) => /255,\s*255,\s*255/.test(f) && /rgba/.test(f))).toBe(false);
  });

  it('puts the picture on a light tile first, so a transparent portrait stays readable on black', () => {
    const { log } = draw('From @barbara-oneill', picture(400, 400));
    const tile = log.findIndex(([k, v]) => k === 'set:fillStyle' && v === '#F5F2EA');
    const image = log.findIndex(([k]) => k === 'drawImage');
    const clip = log.findIndex(([k]) => k === 'clip');
    expect(tile).toBeGreaterThan(-1);
    expect(tile).toBeLessThan(clip);
    expect(clip).toBeLessThan(image);
  });

  it('keeps the top of a tall portrait, where the face is', () => {
    const { log, box } = draw('From @barbara-oneill', picture(400, 800));
    const [, , dx, dy, dw, dh] = log.find(([k]) => k === 'drawImage')! as unknown as [string, unknown, number, number, number, number];
    expect(dw).toBeCloseTo(box.face);
    expect(dh).toBeCloseTo(box.face * 2);
    expect(dy).toBeCloseTo(200 + box.h / 2 - box.face / 2); // the circle's top
    expect(dx).toBeCloseTo(100 + box.pad);
  });

  it('shows the initial in a light circle when there is no picture', () => {
    const { log } = draw('From @barbara-oneill', null);
    expect(log.some(([k]) => k === 'drawImage')).toBe(false);
    expect(texts(log)).toContain('B');
  });

  it('writes "From" then the handle as typed, once, without the name or an upper-cased copy', () => {
    const { log } = draw('From @barbara-oneill', picture(10, 10));
    expect(texts(log)).toEqual(['From ', '@barbara-oneill']);
  });

  it('writes the name alone after the lead when there is no handle', () => {
    const { log } = draw("Guidance by Barbara O'Neill", picture(10, 10));
    expect(texts(log)).toEqual(['Guidance by ', "Barbara O'Neill"]);
  });
});
