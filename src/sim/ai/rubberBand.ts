import { raceProgress } from '../race';
import type { TrackGeometry } from '../splineTrack';
import { tuning } from '../tuning';
import type { KartState, SimState } from '../types';

/**
 * Rubber-banding (MK-15): the AI's top-speed multiplier from its gap to the player (with several
 * humans, the best-placed one, MK-38). Behind → up to +8%, ahead → up to −10%, linear in the gap
 * and capped; exactly 1 in the AI's final 200 m, before the race, or without a human player.
 * Deterministic: sim state only.
 */
export function rubberBandScale(kart: KartState, state: SimState, geometry: TrackGeometry): number {
  const cfg = tuning.ai;
  if (!state.race.rubberBand || state.phase !== 'racing') return 1;
  const player = leadingHuman(state);
  if (!player) return 1;
  if (kart.race.finishTick !== undefined || player.race.finishTick !== undefined) return 1;
  const t = geometry.project(kart.position).t;
  const progress = raceProgress(kart, t);
  const remaining = (state.race.laps - progress) * geometry.length;
  if (remaining <= cfg.rubberBandFinalMetres) return 1;
  const playerProgress = raceProgress(player, geometry.project(player.position).t);
  const gap = (progress - playerProgress) * geometry.length; // + = AI ahead
  const f = Math.min(1, Math.abs(gap) / cfg.rubberBandFar);
  return gap < 0 ? 1 + cfg.rubberBandBoost * f : 1 - cfg.rubberBandBrake * f;
}

/** The best-placed kart driven by a person (`local` or `remote`), if any. */
function leadingHuman(state: SimState): KartState | undefined {
  for (const id of state.positions) {
    const kart = state.karts[id];
    if (kart && kart.controller !== 'ai') return kart;
  }
  return undefined;
}
