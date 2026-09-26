import { tuning } from '../tuning';
import { boxContact, cyclePhase, toBoxFrame } from './shapes';
import type { HazardKind, PeriodicHazard } from './types';

/** Where in its cycle (0..1) a crusher starts to drop: it's open before, moving or closed after. */
function dropPhase(def: PeriodicHazard): number {
  return 1 - def.closedFraction - 2 * tuning.hazards.crusherMoveFraction;
}

/** How closed a crusher is (0 = open, 1 = closed) at `phase` through its cycle. */
export function crusherAmount(def: PeriodicHazard, phase: number): number {
  const move = tuning.hazards.crusherMoveFraction;
  const closedFrom = dropPhase(def);
  if (phase < closedFrom) return 0;
  if (phase < closedFrom + move) return (phase - closedFrom) / move;
  if (phase < 1 - move) return 1;
  return (1 - phase) / move;
}

/**
 * A crusher: open, drops, stays closed, rises. Once far enough down it squashes a kart whose
 * centre is under it, and bumps karts touching its sides; open, it's harmless.
 */
const periodic: HazardKind<PeriodicHazard> = {
  id: 'periodic',
  defaultEffect: 'squash',
  pose(def, ticks) {
    const amount = crusherAmount(def, cyclePhase(ticks, def.period, def.phase));
    return { ...def.centre, heading: def.heading, amount };
  },
  contact(def, pose, position, radius) {
    if (pose.amount < tuning.hazards.crusherSquashAt) return undefined;
    const local = toBoxFrame(def.centre, def.heading, position);
    const under = Math.abs(local.x) < def.halfWidth && Math.abs(local.z) < def.halfLength;
    if (under) return { nx: 0, nz: 0, depth: 0 };
    const side = boxContact(
      def.centre,
      def.heading,
      def.halfWidth,
      def.halfLength,
      position,
      radius,
    );
    return side && { ...side, effect: 'bump' };
  },
  // Seconds until it next starts to drop (0 while it's down or moving): its warning lamp (MK-62).
  secondsUntilOn(def, ticks) {
    const phase = cyclePhase(ticks, def.period, def.phase);
    return Math.max(0, dropPhase(def) - phase) * def.period;
  },
};

export default periodic;
