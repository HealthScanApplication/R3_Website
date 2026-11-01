// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loopHole, parseWatchModel } from '../retroClipModel';

// The decoder returns the artifact's model units; buildRetroWatch scales them by S = 38 mm per unit.
const S = 38;
const ASSET = resolve(__dirname, '../../../../../public/models/r3-clip-watch.bin');

describe('loopHole on the real r3-clip-watch.bin', () => {
  const buf = readFileSync(ASSET);
  const { positions } = parseWatchModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  const h = loopHole(positions);
  const mm = { y: (h.max.y - h.min.y) * S, z: (h.max.z - h.min.z) * S, cy: ((h.min.y + h.max.y) / 2) * S, cz: ((h.min.z + h.max.z) / 2) * S };

  it('measures a plausible hole', () => {
    // Front-to-back (Z, under the case back to the clasp side) is the hole's narrow side, the one that sizes the
    // ring: a wrist is ~45-60 mm deep. Top-to-bottom (Y) is the long side of the oval loop, ~60-70 mm.
    // Measured 2026-10-31: Y 65.4 mm, Z 45.9 mm, centre (y 0.0, z -1.9) mm.
    expect(mm.z).toBeGreaterThan(44);
    expect(mm.z).toBeLessThan(60);
    expect(mm.y).toBeGreaterThan(mm.z);
    expect(mm.y).toBeLessThan(75);
  });

  it('centres the hole near the model origin', () => {
    // The watch is symmetric top/bottom (Y extents ±0.95 units, so a lug or clasp skew would show as |cy| > 0) and
    // the loop sits around z = 0 (case front +0.77, bracelet back -0.74). 4 mm (~0.1 unit, about one link's
    // thickness) is well under the ~12 mm clearance between the nested ring and the bracelet.
    expect(Math.abs(mm.cy)).toBeLessThan(4);
    expect(Math.abs(mm.cz)).toBeLessThan(4);
  });
});
