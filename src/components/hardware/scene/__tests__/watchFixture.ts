import * as THREE from 'three';
// @ts-expect-error - plain .mjs script without type declarations
import { encodeModel } from '../../../../../scripts/decode-watch-model.mjs';

/**
 * A tiny stand-in for the full R³ Retro watch, in the artifact's model units: a box case (x ±0.5, |y| < 0.45,
 * z 0.53..0.77) on a closed bracelet loop (a torus of radius 0.75, tube 0.1, about the X axis, centred at
 * z = -0.05 and stretched 1.0 wide along X).
 */
export function watchBytes(): ArrayBuffer {
  const parts = [
    new THREE.BoxGeometry(1.0, 0.9, 0.24, 2, 2, 1).translate(0, 0, 0.65),
    new THREE.TorusGeometry(0.75, 0.1, 12, 48).rotateY(Math.PI / 2).scale(5, 1, 1).translate(0, 0, -0.05),
  ];
  const pos: number[] = [], idx: number[] = [];
  for (const g of parts) {
    const base = pos.length / 3;
    pos.push(...(g.attributes.position.array as Float32Array));
    for (const i of g.index!.array as ArrayLike<number>) idx.push(base + i);
    g.dispose();
  }
  const u = encodeModel({ positions: new Float32Array(pos), indices: new Uint32Array(idx) }) as Uint8Array;
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}
