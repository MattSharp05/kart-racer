// MK-92 spike, question 4: can `heading` stay the kart's state with forward = heading rotated
// into the plane perpendicular to `up` (ADR 0011 as proposed)? The rotation used here takes +Y to
// `up` by the shortest arc. With up = +Y it is exactly the identity, so the result is
// bit-identical to the sim's `forwardFromHeading`; but the shortest arc is undefined at
// up = −Y, so a heading-based frame flips when a kart drives upside down (see frame.test.ts).
import { forwardFromHeading } from '../../sim/math';
import type { V3 } from './vec';

/** Row-major 3×3 rotation taking +Y to unit `up` along the shortest arc (Rodrigues). */
export function rotationFromUp(up: V3): number[] {
  // v = Y × up, c = Y · up; R = I + [v]× + [v]×² / (1 + c).
  const [x, y, z] = up;
  const vx = z;
  const vz = -x;
  const k = 1 / (1 + y);
  return [1 - vz * vz * k, -vz, vx * vz * k, vz, y, -vx, vx * vz * k, vx, 1 - vx * vx * k];
}

/** Forward for a heading on a surface with normal `up`: the sim's forward, rotated by the arc. */
export function forwardOnSurface(heading: number, up: V3): V3 {
  const f = forwardFromHeading(heading);
  const r = rotationFromUp(up);
  const at = (i: number) => r[i] ?? 0;
  return [
    at(0) * f.x + at(1) * f.y + at(2) * f.z,
    at(3) * f.x + at(4) * f.y + at(5) * f.z,
    at(6) * f.x + at(7) * f.y + at(8) * f.z,
  ];
}
