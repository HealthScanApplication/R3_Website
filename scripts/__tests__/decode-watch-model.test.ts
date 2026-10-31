// @ts-expect-error - plain .mjs script without type declarations
import { decodeModel, encodeModel, keepHead, weld } from '../decode-watch-model.mjs';
import { describe, expect, it } from 'vitest';

type Model = { positions: Float32Array; indices: Uint32Array };

// Two triangles: one inside the head filter (z > 0.3, |y| < 0.47), one on the bracelet (y = 0.9).
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

  it('keeps only head triangles and compacts to the vertices they use', () => {
    const head = keepHead(synthetic()) as Model;
    expect(Array.from(head.indices)).toEqual([0, 1, 2]);
    expect(head.positions.length).toBe(9);
    expect(head.positions[8]).toBeCloseTo(0.7, 6);
  });
});
