import type { Vec3 } from '../math';
import { circleContact, cyclePhase } from './shapes';
import type { HazardKind, HazardPose, MoverHazard } from './types';

function segmentLength(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/** Travels its closed path at constant speed; spins out karts it runs into. */
const mover: HazardKind<MoverHazard> = {
  id: 'mover',
  defaultEffect: 'spin',
  pose(def, ticks): HazardPose {
    const { path } = def;
    const n = path.length;
    const total = path.reduce((sum, p, i) => sum + segmentLength(p, path[(i + 1) % n] ?? p), 0);
    let remaining = cyclePhase(ticks, def.period, def.phase) * total;
    for (let i = 0; i < n; i += 1) {
      const a = path[i];
      const b = path[(i + 1) % n];
      if (!a || !b) break;
      const length = segmentLength(a, b);
      if (remaining <= length || i === n - 1) {
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
  },
  contact(def, pose, position, radius) {
    return circleContact(pose.x, pose.z, def.radius, position, radius);
  },
};

export default mover;
