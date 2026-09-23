import type { SplinePoint, SplineTrackDef } from '../../splineTrack';

const STRAIGHT_HALF = 60;
const RADIUS = 40;
const WIDTH = 14;
const HILL_HEIGHT = 3;
const STEP = 10;

/**
 * Flat oval (two 120 m straights, two 40 m-radius bends) with a gentle hill on the back straight.
 * Anticlockwise from above: starts at (40, 0, 60) heading −Z, turns left. Used to prove the track system (MK-9).
 */
function ovalPoints(): SplinePoint[] {
  const points: SplinePoint[] = [];
  const add = (x: number, z: number, y = 0) => points.push({ x, y, z, width: WIDTH });

  for (let z = STRAIGHT_HALF; z > -STRAIGHT_HALF; z -= STEP) add(RADIUS, z);
  for (let a = 0; a < Math.PI; a += Math.PI / 8) {
    add(RADIUS * Math.cos(a), -STRAIGHT_HALF - RADIUS * Math.sin(a));
  }
  for (let z = -STRAIGHT_HALF; z < STRAIGHT_HALF; z += STEP) {
    const progress = (z + STRAIGHT_HALF) / (2 * STRAIGHT_HALF);
    add(-RADIUS, z, HILL_HEIGHT * Math.sin(progress * Math.PI));
  }
  for (let a = Math.PI; a < 2 * Math.PI; a += Math.PI / 8) {
    add(RADIUS * Math.cos(a), STRAIGHT_HALF - RADIUS * Math.sin(a));
  }
  return points;
}

export const testOval: SplineTrackDef = {
  id: 'test-oval',
  name: 'Test Oval',
  kind: 'spline',
  points: ovalPoints(),
  offroadWidth: 6,
  wallGaps: [],
  surfaceZones: [],
  checkpoints: [0, 0.25, 0.5, 0.75],
};
