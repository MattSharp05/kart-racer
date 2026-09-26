import { boxContact, cyclePhase } from './shapes';
import type { HazardKind, RotatorHazard } from './types';

/** A bar turning about its centre; bumps karts it sweeps into. */
const rotator: HazardKind<RotatorHazard> = {
  id: 'rotator',
  defaultEffect: 'bump',
  pose(def, ticks) {
    const turn = cyclePhase(ticks, Math.abs(def.period), def.phase);
    const heading = Math.sign(def.period) * turn * 2 * Math.PI;
    return { ...def.centre, heading, amount: 1 };
  },
  contact(def, pose, position, radius) {
    return boxContact(pose, pose.heading, def.armWidth / 2, def.armLength, position, radius);
  },
};

export default rotator;
