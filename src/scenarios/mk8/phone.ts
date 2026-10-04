// MK8 on phones (MK-134): a Time Trial on its last lap with two splits under the clock, in the
// right- and left-handed touch layouts (the clock goes down the side away from the buttons), on the
// synthetic test ramp (no pack needed).
import { SETTINGS_KEY, SETTINGS_VERSION } from '../../game/storage/settings';
import type { MeshTrackDef } from '../../sim/meshTrack';
import { DT } from '../../sim/tuning';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { onRamp } from './raceScreens';
import { TEST_RAMP } from './testRamp';
import { timeTrialRace, TT_LAPS } from './vsTimeTrial';

/** Into the last lap this long, s. */
const INTO_LAP = 6.5;

/** A Time Trial racing its last lap: two laps' splits behind, a mushroom used. */
function lastLap(track: MeshTrackDef, seed: number): SimState {
  const state = timeTrialRace(track, seed);
  const done = TT_LAPS.slice(0, 2);
  const elapsed = done.reduce((a, b) => a + b, 0) + INTO_LAP;
  state.phase = 'racing';
  state.race.goTick = -Math.round(elapsed / DT);
  state.race.countdownStartTick = state.race.goTick - 1;
  for (const kart of state.karts) {
    kart.race = {
      ...kart.race,
      lap: state.race.laps,
      lapTimes: [...done],
      lapStartTick: -Math.round(INTO_LAP / DT),
    };
    kart.item.uses = 2;
  }
  return state;
}

const leftHand = { [SETTINGS_KEY]: JSON.stringify({ version: SETTINGS_VERSION, hand: 'left' }) };

const scenarios: Scenario[] = [
  {
    name: 'mk8-tt-splits',
    group: 'MK8 Mode',
    description:
      'MK8 Time Trial (MK-134) on the test ramp, lap 3 of 3 with the first two splits under the clock. On phones the clock sits on the left under the coins, clear of the touch buttons.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onRamp(lastLap, { mk8Start: 'time-trial' }),
  },
  {
    name: 'mk8-tt-left',
    group: 'MK8 Mode',
    description:
      'The same Time Trial (MK-134) in the left-handed touch layout: buttons bottom-left, steering on the right, so on phones the clock and splits move to the right under the minimap.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: (seed) => ({
      ...onRamp(lastLap, { mk8Start: 'time-trial' })(seed),
      storage: leftHand,
    }),
  },
];
export default scenarios;
