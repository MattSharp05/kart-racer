// Thwomp Ruins' Thwomps (MK-124, placed on the pack in MK-128): `periodic` hazards
// (`sim/hazards/periodic.ts`, poses a pure function of the tick), drawn as Thwomps (`thwomp`).
// Four slam down on the start straight and the courtyard after it, a little off the centreline
// and out of step, so there's always a way past: each hovers, slams down onto its footprint and
// stays down a moment, then rises. Positions in the pack's units, like the route (they move with
// the course's scale); sizes in metres.
import type { PeriodicHazard } from '../../../../sim/hazards/types';

const thwomp = (
  x: number,
  y: number,
  z: number,
  heading: number,
  phase: number,
): PeriodicHazard => ({
  kind: 'periodic',
  centre: { x, y, z },
  halfWidth: 2.6,
  halfLength: 2.6,
  // Facing back down the road, at the karts coming.
  heading: heading + Math.PI,
  period: 3.6,
  closedFraction: 0.3,
  phase,
  thwomp: { lift: 5 },
});

export const thwomps: PeriodicHazard[] = [
  thwomp(35.95, 41.83, -40.34, -0.108, 0),
  thwomp(37.58, 41.96, -48.8, 0.093, 0.5),
  thwomp(33.76, 42.09, -57.35, 0.705, 0.25),
  thwomp(15.31, 42.45, -61.79, 1.706, 0.75),
];

/**
 * The course model's own Thwomps (`di_DeathDossun`): stone ones standing in the grass beside the
 * straight, in the courtyard and by the grid. Ours replace them, so they're hidden from the drawing
 * and their triangles leave the collision (`collisionHoles`, `index.ts`): karts aren't stopped by
 * what isn't drawn. Each box is a stone Thwomp's bounds from just above the grass it stands in (so
 * the grass stays), in the pack's units.
 */
export const MODEL_THWOMPS = [
  { min: { x: 11, y: 42.9, z: -70.1 }, max: { x: 13.5, y: 44.8, z: -67.3 } },
  { min: { x: 29.9, y: 42.3, z: -57.5 }, max: { x: 32.8, y: 44, z: -54.7 } },
  { min: { x: 29.3, y: 42.1, z: -43.3 }, max: { x: 32.4, y: 43.7, z: -40.8 } },
  { min: { x: 24.4, y: 48.1, z: 4 }, max: { x: 27.4, y: 50, z: 6.9 } },
];
