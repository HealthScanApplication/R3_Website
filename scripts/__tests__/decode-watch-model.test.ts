// @ts-expect-error - plain .mjs script without type declarations
import { decodeModel, encodeModel, keepFull, weld } from '../decode-watch-model.mjs';
import { describe, expect, it } from 'vitest';

type Model = { positions: Float32Array; indices: Uint32Array };

// Two triangles: one on the head (z > 0.3, |y| < 0.47), one on the bracelet (y = 0.9), plus an unused vertex.
const synthetic = (): Model => ({
  positions: new Float32Array([
    0, 0, 0.5, 0.2, 0, 0.6, 0, 0.2, 0.7, // head
    0, 0.9, 0.5, 0.2, 0.9, 0.6, 0, 0.95, 0.7, // bracelet
    -0.5, -0.4, 0.4, // unused head vertex
  ]),
  indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
});

describe('decode-watch-model', () => {
  it('round-trips positions (within quantisation) and indices through the binary format', () => {
    const m = synthetic();
    const out = decodeModel(encodeModel(m)) as Model;
    expect(Array.from(out.indices)).toEqual(Array.from(m.indices));
    expect(out.positions.length).toBe(m.positions.length);
    out.positions.forEach((v, i) => expect(v).toBeCloseTo(m.positions[i], 4));
  });

  it('decodes an odd vertex count (indices padded to 4 bytes)', () => {
    const m = { positions: new Float32Array([0, 0, 0, 1, 1, 1, 2, 0, 1]), indices: new Uint32Array([0, 1, 2]) };
    const bytes = encodeModel(m) as Uint8Array;
    const out = decodeModel(bytes) as Model;
    expect(Array.from(out.indices)).toEqual([0, 1, 2]);
    expect(out.positions[6]).toBeCloseTo(2, 4);
  });

  it('writes Uint16 indices for small meshes and Uint32 for > 65535 vertices', () => {
    const small = encodeModel(synthetic()) as Uint8Array;
    const hl = new DataView(small.buffer).getUint32(0, true);
    expect(JSON.parse(new TextDecoder().decode(small.subarray(4, 4 + hl))).iw).toBe(2);
    const n = 65536, big = { positions: new Float32Array(n * 3).map((_, i) => i), indices: new Uint32Array([0, 1, 65535]) };
    const out = decodeModel(encodeModel(big)) as Model;
    expect(Array.from(out.indices)).toEqual([0, 1, 65535]);
  });

  it('welds vertices on a grid and drops collapsed triangles', () => {
    const m = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0.0001, 0, 0, 1, 1, 0]), indices: new Uint32Array([0, 1, 2, 3, 1, 4, 0, 3, 1]) };
    const w = weld(m, 0.001) as Model;
    expect(w.positions.length).toBe(12);
    expect(Array.from(w.indices)).toEqual([0, 1, 2, 0, 1, 3]);
  });

  it('full mode keeps the bracelet triangles as well as the head (and compacts away unused vertices)', () => {
    const full = keepFull(synthetic()) as Model;
    expect(full.indices.length).toBe(6);
    expect(full.positions.length).toBe(18);
    const ys = Array.from({ length: 6 }, (_, i) => full.positions[i * 3 + 1]);
    expect(Math.max(...ys)).toBeCloseTo(0.95, 5);   // the bracelet triangle survived
  });

  it('full mode decimates to the triangle budget', () => {
    // A 20 x 20 grid of quads (800 triangles) brought down to <= 200.
    const n = 21, pos: number[] = [], idx: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pos.push(i / 20, j / 20, Math.sin(i / 3) * 0.05);
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i; idx.push(a, a + 1, a + n, a + 1, a + n + 1, a + n); }
    const out = keepFull({ positions: new Float32Array(pos), indices: new Uint32Array(idx) }, 200) as Model;
    expect(out.indices.length / 3).toBeLessThanOrEqual(200);
    expect(out.indices.length / 3).toBeGreaterThan(50);
  });
});
