import { cyclePhase } from './shapes';
import type { HazardKind, ZoneEffectHazard } from './types';

/** An area that is on for part of each period, changing grip (and, drawn, visibility) inside. */
const zoneEffect: HazardKind<ZoneEffectHazard> = {
  id: 'zoneEffect',
  defaultEffect: 'bump',
  pose(def, ticks) {
    const on = cyclePhase(ticks, def.period, def.phase) < def.activeFraction;
    return { ...def.centre, heading: 0, amount: on ? 1 : 0 };
  },
  grip(def, pose, position) {
    if (pose.amount === 0) return 1;
    const inside = Math.hypot(position.x - def.centre.x, position.z - def.centre.z) <= def.radius;
    return inside ? def.grip : 1;
  },
  secondsUntilOn(def, ticks) {
    const phase = cyclePhase(ticks, def.period, def.phase);
    return phase < def.activeFraction ? 0 : (1 - phase) * def.period;
  },
  warning: (def) => def.warning,
};

export default zoneEffect;
