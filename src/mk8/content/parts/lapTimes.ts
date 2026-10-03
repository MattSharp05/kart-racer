// Lap times of MK8 loadouts (MK-102): one AI kart alone on a track (fixed skill, on the racing
// line, no items, no rubber-banding), so only the loadout's physics set the time. Used by the
// weight-class balance test.
import { createRace } from '../../../sim/race/createRace';
import { step } from '../../../sim/step';
import type { EngineClass } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type Loadout } from '../../../sim/types';

/** Most seconds a lap may take before the run gives up. */
const MAX_LAP_SECONDS = 180;
const TICKS_PER_SECOND = 60;

/** Seconds each lap of a solo AI race in `loadout` took (the first includes the standing start). */
export function soloLapTimes(
  loadout: Loadout,
  { trackId = 'sunny-circuit', engineClass = 150 as EngineClass, laps = 2, skill = 1 } = {},
): number[] {
  let state = createRace({
    trackId,
    racers: [{ kartId: 'maple', controller: 'ai', loadout }],
    engineClass,
    itemsOn: false,
    seed: 1,
    laps,
  });
  state.race.rubberBand = false;
  const [kart] = state.karts;
  if (kart?.ai) Object.assign(kart.ai, { skill, lineOffset: 0, aggression: 0 });
  const maxTicks = MAX_LAP_SECONDS * TICKS_PER_SECOND * (laps + 1);
  for (let i = 0; i < maxTicks && state.karts[0]?.race.finishTick === undefined; i += 1)
    state = step(state, [NEUTRAL_INPUT]).state;
  return state.karts[0]?.race.lapTimes ?? [];
}
