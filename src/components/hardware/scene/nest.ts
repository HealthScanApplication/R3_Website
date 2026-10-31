/**
 * "Rings in the same centre" (pure, no three.js): the R³ Note ring nested inside the R³ Retro watch's closed
 * bracelet, concentric with the bracelet's hole, and the watch's eased yaw.
 */
export type Axis = 'x' | 'y' | 'z';
export type Vec = { x: number; y: number; z: number };
export type BoxLike = { min: Vec; max: Vec };

/** Ring outer diameter as a fraction of the bracelet's smaller inner diameter. */
export const RING_FILL = 0.6;
/**
 * Watch yaw: an eased swing about the resting three-quarter view over a 10 s period. It never comes within
 * MIN_OFF_AXIS of facing the camera, because straight on the case hides the ring nested behind it.
 */
export const REST_YAW = -0.8;
export const MIN_OFF_AXIS = 0.45;
export const WATCH_SWING = Math.abs(REST_YAW) - MIN_OFF_AXIS;
export const WATCH_PERIOD = 10;

const others = (a: Axis): [Axis, Axis] => (a === 'x' ? ['y', 'z'] : a === 'y' ? ['x', 'z'] : ['x', 'y']);
const span = (b: BoxLike, a: Axis) => b.max[a] - b.min[a];

export type Nest = {
  /** The common centre (the hole's centre), in the hole box's units. */
  centre: Vec;
  /** Scale that takes ring-box units to hole-box units. */
  scale: number;
  /** The hole's smaller inner diameter and the scaled ring's outer diameter. */
  holeInner: number;
  ringOuter: number;
  /** Radial gap between ring and bracelet at the narrowest point. */
  clearance: number;
};

/**
 * Centre the ring on the hole and size it so its outer diameter is `fill` of the hole's smaller inner diameter.
 * `hole` is the bracelet's inner hole (the axis span is the bracelet's width), `ring` the ring's own box.
 */
export function nestRing(hole: BoxLike, ring: BoxLike, holeAxis: Axis, ringAxis: Axis, fill = RING_FILL): Nest {
  const [h1, h2] = others(holeAxis), [r1, r2] = others(ringAxis);
  const holeInner = Math.min(span(hole, h1), span(hole, h2));
  const ringRaw = Math.max(span(ring, r1), span(ring, r2));
  const scale = ringRaw > 0 ? (fill * holeInner) / ringRaw : 1;
  const ringOuter = ringRaw * scale;
  const centre = {
    x: (hole.min.x + hole.max.x) / 2,
    y: (hole.min.y + hole.max.y) / 2,
    z: (hole.min.z + hole.max.z) / 2,
  };
  return { centre, scale, holeInner, ringOuter, clearance: (holeInner - ringOuter) / 2 };
}

/** The watch's yaw at time t (s): a sine swing that starts at the resting view; static under reduced motion. */
export function watchYaw(t: number, reducedMotion: boolean): number {
  if (reducedMotion) return REST_YAW;
  return REST_YAW + WATCH_SWING * Math.sin((2 * Math.PI * t) / WATCH_PERIOD);
}
