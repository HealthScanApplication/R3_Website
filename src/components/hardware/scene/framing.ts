/**
 * Camera framing math (pure, no three.js): how far a perspective camera on the box's axis must stand so a box of
 * the given size stays in view at the container's aspect ratio. Narrower aspect => the camera pulls back.
 */
export type BoxSize = { x: number; y: number; z: number };

export function frameDistance(size: BoxSize, aspect: number, fovDeg: number, margin = 1.15): number {
  const a = Number.isFinite(aspect) && aspect > 0 ? Math.min(Math.max(aspect, 0.3), 4) : 1;
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const byHeight = size.y / 2 / t;
  const byWidth = size.x / 2 / (t * a);
  // Measured to the box's front face, so add half its depth to reach its centre.
  return Math.max(byHeight, byWidth) * margin + size.z / 2;
}
