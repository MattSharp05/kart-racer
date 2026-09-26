import { wrapAngleDelta } from '../math';

/**
 * Largest heading change per metre along a path over the next `horizon` metres, checking 3 points
 * `step` apart at a time; `point(d)` is the path's point `d` m ahead.
 */
export function curvatureAlong(
  point: (d: number) => { x: number; z: number },
  horizon: number,
  step = CURVATURE_STEP,
): number {
  let max = 0;
  for (let d = 0; d < horizon; d += step) {
    const a = point(d);
    const b = point(d + step);
    const c = point(d + 2 * step);
    const h1 = Math.atan2(b.x - a.x, b.z - a.z);
    const h2 = Math.atan2(c.x - b.x, c.z - b.z);
    max = Math.max(max, Math.abs(wrapAngleDelta(h2 - h1)) / step);
  }
  return max;
}

/** Spacing of the curvature checks along the line ahead, m. */
const CURVATURE_STEP = 6;
