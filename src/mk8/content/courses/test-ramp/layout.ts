// `mk8-test-ramp` (MK-98): a small synthetic mesh course for unit tests and the next MK8 tickets
// (no Nintendo asset). One loop, driven clockwise seen from above:
//
//   A  straight along +X (z = 0) from the start line: a dash panel, a tunnel whose right side is a
//      90° anti-gravity wall and whose roof is an anti-gravity ceiling, a glide ramp, then a gap
//      over a void floor
//   B  flat 180° turn            C  straight back along −X (z = 2R) through a water basin
//   D  flat 180° turn            E  the last 40 m along +X back to the start line
//
// Road 14 m wide in 3.5 m strips, 4 m verges, 1.5 m walls along both outer edges. On the straights
// every vertex sits on a whole metre of x, so tests can aim rays exactly at edges and vertices.
import type { Vec3 } from '../../../../sim/math';

export const TEST_RAMP_ID = 'mk8-test-ramp';

export const LAYOUT = {
  /** Straights A and C run over this x range (A from 0, its first 40 m are E). */
  straightFrom: -40,
  straightTo: 160,
  turnRadius: 40,
  roadHalfWidth: 7,
  verge: 4,
  wallHeight: 1.5,
  /** Road strip edges across, m from the centreline (positive = right). */
  laterals: [-11, -7, -3.5, 0, 3.5, 7, 11] as readonly number[],
  /** Dash panel on A: x range and half width. */
  boost: { from: 10, to: 14, halfWidth: 2 },
  /** Tunnel on A: right wall (lateral +7) and ceiling are anti-gravity. */
  tunnel: { from: 30, to: 60, height: 8 },
  /** Glide ramp on A: the road rises `rise` m over the range, surface `glide`. */
  glide: { from: 90, to: 100, rise: 3 },
  /** Gap on A: no road; a void floor at `voidY` under it. */
  gap: { from: 100, to: 120, voidY: -20, margin: 5 },
  /** Water basin on C (x range): the road dips `depth` m, ramps `slope` m long at each end. */
  water: { from: 60, to: 100, depth: 3, slope: 10 },
  /** A boost bumper beside the road on A. */
  bumper: { x: 140, lateral: -5, radius: 1 },
} as const;

const R = LAYOUT.turnRadius;
const A_LENGTH = LAYOUT.straightTo; // x 0 → 160
const TURN = Math.PI * R;
const C_LENGTH = LAYOUT.straightTo - LAYOUT.straightFrom;
/** Lap length along the centreline, m. */
export const LAP_LENGTH = A_LENGTH + TURN + C_LENGTH + TURN - LAYOUT.straightFrom;

/** Lap fraction of a distance from the start line. */
export const tOf = (s: number): number => s / LAP_LENGTH;
/** Lap fraction of a point on straight A at `x` (0 ≤ x ≤ 160) or E (x < 0). */
export const tOnA = (x: number): number => tOf(x >= 0 ? x : LAP_LENGTH + x);
/** Lap fraction of a point on straight C at `x`. */
export const tOnC = (x: number): number => tOf(A_LENGTH + TURN + (LAYOUT.straightTo - x));

export interface CentreFrame {
  position: Vec3;
  /** Unit driving direction and right (XZ; the course is flat apart from heights). */
  tangent: Vec3;
  right: Vec3;
  section: 'A' | 'B' | 'C' | 'D' | 'E';
}

/** Centreline at distance `s` from the start line (heights 0; features add their own). */
export function centreAt(s: number): CentreFrame {
  const u = ((s % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH;
  const straight = (x: number, z: number, dir: 1 | -1, section: 'A' | 'C' | 'E'): CentreFrame => ({
    position: { x, y: 0, z },
    tangent: { x: dir, y: 0, z: 0 },
    right: { x: 0, y: 0, z: dir },
    section,
  });
  if (u < A_LENGTH) return straight(u, 0, 1, 'A');
  if (u < A_LENGTH + TURN) {
    const phi = (u - A_LENGTH) / R;
    return {
      position: { x: LAYOUT.straightTo + R * Math.sin(phi), y: 0, z: R - R * Math.cos(phi) },
      tangent: { x: Math.cos(phi), y: 0, z: Math.sin(phi) },
      right: { x: -Math.sin(phi), y: 0, z: Math.cos(phi) },
      section: 'B',
    };
  }
  if (u < A_LENGTH + TURN + C_LENGTH)
    return straight(LAYOUT.straightTo - (u - A_LENGTH - TURN), 2 * R, -1, 'C');
  const v = u - A_LENGTH - TURN - C_LENGTH;
  if (v < TURN) {
    const phi = v / R;
    return {
      position: { x: LAYOUT.straightFrom - R * Math.sin(phi), y: 0, z: R + R * Math.cos(phi) },
      tangent: { x: -Math.cos(phi), y: 0, z: -Math.sin(phi) },
      right: { x: Math.sin(phi), y: 0, z: -Math.cos(phi) },
      section: 'D',
    };
  }
  return straight(LAYOUT.straightFrom + (v - TURN), 0, 1, 'E');
}

/** Road height on straight A at `x` (the glide ramp; 0 elsewhere). */
export function heightOnA(x: number): number {
  const { glide } = LAYOUT;
  if (x <= glide.from || x >= LAYOUT.gap.to) return 0;
  return glide.rise * Math.min(1, (x - glide.from) / (glide.to - glide.from));
}

/** Road height on straight C at `x` (the water basin; 0 elsewhere). */
export function heightOnC(x: number): number {
  const { from, to, depth, slope } = LAYOUT.water;
  if (x <= from || x >= to) return 0;
  return -depth * Math.min(1, (x - from) / slope, (to - x) / slope);
}
