import { hazardPose, trackHazards } from '../sim/hazards';
import { getTrack } from '../sim/track';
import type { SimState } from '../sim/types';

/** A rolling hazard is heard from this far away, m (loudest right on top of it). */
export const RUMBLE_RANGE = 70;

/**
 * How loud the rumble of rolling hazards (MK-59: snowballs, movers with `rolling`) is for kart
 * `followId`: 0 (none in range) to 1 (on top of one). Pure, from the tick like the hazards.
 */
export function rumbleLevel(state: SimState, followId: number): number {
  const me = state.karts[followId];
  if (!me) return 0;
  let level = 0;
  for (const hazard of trackHazards(getTrack(state.trackId))) {
    if (hazard.kind !== 'mover' || hazard.rolling === undefined) continue;
    const pose = hazardPose(hazard, state.tick);
    if (pose.amount === 0) continue;
    const distance = Math.hypot(pose.x - me.position.x, pose.z - me.position.z);
    level = Math.max(level, 1 - distance / RUMBLE_RANGE);
  }
  return level;
}
