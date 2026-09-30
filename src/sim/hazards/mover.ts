import type { Vec3 } from '../math';
import { circleContact, cyclePhase } from './shapes';
import type { HazardKind, HazardPose, MoverHazard } from './types';

function segmentLength(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/** A mover's segment lengths and their total, measured once per def (paths are immutable data). */
const measured = new WeakMap<MoverHazard, { lengths: number[]; total: number }>();
function measure(def: MoverHazard) {
  let m = measured.get(def);
  if (!m) {
    const { path } = def;
    // An open path doesn't join its end back to the start.
    const segments = def.activeFraction !== undefined ? path.length - 1 : path.length;
    const lengths: number[] = [];
    for (let i = 0; i < segments; i += 1) {
      const a = path[i];
      const b = path[(i + 1) % path.length];
      lengths.push(a && b ? segmentLength(a, b) : 0);
    }
    m = { lengths, total: lengths.reduce((sum, l) => sum + l, 0) };
    measured.set(def, m);
  }
  return m;
}

/** Pose `distance` m along `path`'s segments (their `lengths`; the last one may wrap to the start). */
function along(path: Vec3[], lengths: number[], distance: number): HazardPose {
  let remaining = distance;
  for (let i = 0; i < lengths.length; i += 1) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    if (!a || !b) break;
    const length = lengths[i] ?? 0;
    if (remaining <= length || i === lengths.length - 1) {
      const f = length > 0 ? Math.min(1, remaining / length) : 0;
      return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        z: a.z + (b.z - a.z) * f,
        heading: Math.atan2(-(b.x - a.x), -(b.z - a.z)),
        amount: 1,
      };
    }
    remaining -= length;
  }
  const first = path[0] ?? { x: 0, y: 0, z: 0 };
  return { ...first, heading: 0, amount: 1 };
}

/**
 * Travels its path at constant speed; spins out karts it runs into. A closed path loops forever;
 * an open one (`activeFraction`, MK-59) is travelled once per period, and in between the mover is
 * parked at its end, switched off (`amount` 0: no contact, not drawn).
 */
const mover: HazardKind<MoverHazard> = {
  id: 'mover',
  defaultEffect: 'spin',
  pose(def, ticks): HazardPose {
    const { path, activeFraction } = def;
    const { lengths, total } = measure(def);
    const cycle = cyclePhase(ticks, def.period, def.phase);
    if (activeFraction === undefined) return along(path, lengths, cycle * total);
    if (cycle >= activeFraction) return { ...along(path, lengths, total), amount: 0 };
    return along(path, lengths, (cycle / activeFraction) * total);
  },
  contact(def, pose, position, radius) {
    if (pose.amount === 0) return undefined;
    return circleContact(pose.x, pose.z, def.radius, position, radius);
  },
};

export default mover;
