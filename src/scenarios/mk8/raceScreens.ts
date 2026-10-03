// MK8 Mode's pause menu and race results (MK-121) on the synthetic test ramp (no pack needed): a
// race on its final lap, paused, and a scripted finish shown as VS results and as Grand Prix
// standings. The scenario's `mk8Start` names the MK8 mode the results are for.
import { DT } from '../../sim/tuning';
import type { MeshTrackDef } from '../../sim/meshTrack';
import type { SimState } from '../../sim/types';
import type { Scenario, ScenarioSetup } from '../registry';
import { courseFinalLap, onCourse } from './lib/courses';
import { TEST_RAMP } from './testRamp';

/** The field, kart by kart: MK8 racers, so the results show their icons with a pack. */
export const FIELD = [
  'mk8-mario',
  'mk8-luigi',
  'mk8-peach',
  'mk8-daisy',
  'mk8-yoshi',
  'mk8-toad',
  'mk8-koopa-troopa',
  'mk8-bowser',
];
/** The scripted finishing order (kart ids): you (kart 0) third. */
export const FINISH_ORDER = [3, 5, 0, 1, 7, 2, 6, 4];
/** The winner's race time, and each place's gap to the one before, s. */
const WINNER_TIME = 78.412;
const GAPS = [0.731, 1.204, 0.388, 2.15, 0.906, 1.47, 3.022];

/** The final-lap race with the MK8 field. */
export function finalLap(track: MeshTrackDef, seed: number): SimState {
  const state = courseFinalLap(track, seed);
  state.karts.forEach((kart, i) => {
    kart.kartType = FIELD[i] ?? kart.kartType;
    delete kart.name;
  });
  return state;
}

/** The race over, everyone across the line in `FINISH_ORDER`. */
const finished = finishedIn(FINISH_ORDER);

/** The race over, everyone across the line in `order` (kart ids; MK-130's Grand Prix races). */
export function finishedIn(
  order: readonly number[],
): (track: MeshTrackDef, seed: number) => SimState {
  return (track, seed) => finishedRace(track, seed, order);
}

function finishedRace(track: MeshTrackDef, seed: number, order: readonly number[]): SimState {
  const state = finalLap(track, seed);
  state.phase = 'finished';
  let time = WINNER_TIME;
  order.forEach((kartId, place) => {
    const kart = state.karts[kartId];
    if (!kart) return;
    if (place > 0) time += GAPS[place - 1] ?? 1;
    kart.race = {
      ...kart.race,
      lap: state.race.laps + 1,
      finishTick: state.race.goTick + Math.round(time / DT),
    };
  });
  state.tick = (state.karts[order[order.length - 1] ?? 0]?.race.finishTick ?? 0) + 1;
  state.positions = [...order];
  return state;
}

/** `build` on the test ramp, with `extra` (its screen or MK8 mode) once the ramp is there. */
export function onRamp(
  build: (track: MeshTrackDef, seed: number) => SimState,
  extra: Partial<ScenarioSetup>,
): (seed: number) => ScenarioSetup {
  return (seed) => {
    const setup = onCourse(TEST_RAMP.id, build)(seed);
    return setup.screen === 'mk8' ? setup : { ...setup, ...extra };
  };
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-ui-pause',
    group: 'MK8 Mode',
    description:
      "MK8 pause menu (MK-121) over a race's final lap on the test ramp (no pack): Continue, Restart, Quit with the pulsing frame, the pause sound. Continue (or Esc / B) plays the unpause sound and the race goes on; Quit opens MK8 Mode's title.",
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onRamp(finalLap, { screen: 'paused' }),
  },
  {
    name: 'mk8-ui-results',
    group: 'MK8 Mode',
    description:
      'MK8 race results for a VS race (MK-121) on the test ramp: the 8 rows slide in in the finishing order (you 3rd, yellow) with the race times, then Next course / Retry / Quit at the side. Enter skips the animation.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onRamp(finished, { mk8Start: 'vs' }),
  },
  {
    name: 'mk8-ui-standings',
    group: 'MK8 Mode',
    description:
      'MK8 Grand Prix results (MK-121), race 1 of the Mushroom Cup: the rows slide in, then each gains its points (+15, +12, +10…) counting up into its total and the rows re-sort into the standings. Next race / Quit at the side.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onRamp(finished, { mk8Start: 'grand-prix' }),
  },
];
export default scenarios;
