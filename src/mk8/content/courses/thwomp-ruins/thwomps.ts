// Thwomp Ruins' Thwomps (MK-124): `periodic` hazards (`sim/hazards/periodic.ts`, poses a pure
// function of the tick), drawn as Thwomps (`thwomp`). Four over the hall's floor, two to a side,
// out of step so there's always a way through: each hovers, slams down onto its footprint and stays
// down a moment, then rises. Positions are the draft route's hall (`route.ts`); move them onto the
// real Thwomps' spots when the route is traced on the pack.
import type { PeriodicHazard } from '../../../../sim/hazards/types';

/** The hall's floor runs east (+X) at z = −135; the route's right there is +Z. */
const HALL_Z = -135;
/** Thwomps sit this far either side of the hall's centreline, m. */
const OFFSET = 1.5;

const thwomp = (x: number, side: -1 | 1, phase: number): PeriodicHazard => ({
  kind: 'periodic',
  centre: { x, y: 0, z: HALL_Z + side * OFFSET },
  halfWidth: 2.6,
  halfLength: 2.6,
  // Facing back down the hall, at the karts coming.
  heading: Math.PI / 2,
  period: 3.6,
  closedFraction: 0.3,
  phase,
  thwomp: { lift: 5 },
});

export const thwomps: PeriodicHazard[] = [
  thwomp(65, -1, 0),
  thwomp(79, 1, 0.5),
  thwomp(93, -1, 0.25),
  thwomp(107, 1, 0.75),
];
