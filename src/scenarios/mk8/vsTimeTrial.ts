// MK8 VS Race and Time Trial (MK-131): the VS settings screen, Time Trials on Mario Kart Stadium
// (needs the pack) and on the synthetic test ramp (no pack: CI's e2e), a finished Time Trial that
// beats the saved records and one that doesn't, and the course cards with a saved best.
import { recordStorage, type TrackRecord } from '../../game/storage/records';
import { MK8_ITEM_SET } from '../../mk8/content/items/id';
import { applyTimeTrial, recordTrack, timeTrialField } from '../../mk8/modes/timeTrial';
import type { MeshTrackDef } from '../../sim/meshTrack';
import { createRace } from '../../sim/race/createRace';
import { DT } from '../../sim/tuning';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { onCourse } from './lib/courses';
import { openMk8 } from './lib/menus';
import { onRamp } from './raceScreens';
import { MK8_STADIUM_ID } from './stadium';
import { TEST_RAMP } from './testRamp';

/** Time Trials are 3 laps at 150cc (MK8's). */
const LAPS = 3;
const ENGINE_CLASS = 150;
/** The scripted Time Trial's laps, s: 1:18.400 in all (a whole number of ticks), the best lap 24.800. */
export const TT_LAPS = [25.4, 24.8, 28.2];
export const TT_TIME = TT_LAPS.reduce((a, b) => a + b, 0);
/** Mushrooms left after the scripted run (two used). */
const USES_LEFT = 1;

/** A Time Trial from the countdown: you alone (as Mario), three mushrooms, no item boxes. */
export function timeTrialRace(track: MeshTrackDef, seed: number): SimState {
  const state = createRace({
    trackId: track.id,
    racers: timeTrialField('maple'),
    engineClass: ENGINE_CLASS,
    itemsOn: true,
    seed,
    laps: LAPS,
    itemSet: MK8_ITEM_SET,
  });
  applyTimeTrial(state);
  for (const kart of state.karts) kart.kartType = 'mk8-mario';
  return state;
}

/** The Time Trial over: across the line after `TT_LAPS`. */
function finishedTimeTrial(track: MeshTrackDef, seed: number): SimState {
  const state = timeTrialRace(track, seed);
  state.phase = 'finished';
  const kart = state.karts[0];
  if (kart) {
    const finishTick = state.race.goTick + Math.round(TT_TIME / DT);
    kart.race = { ...kart.race, lap: LAPS + 1, lapTimes: [...TT_LAPS], finishTick };
    kart.item.uses = USES_LEFT;
    state.tick = finishTick + 1;
  }
  return state;
}

/** Mario Kart Stadium's records at 150cc, saved (the courses' records key, MK-131). */
function stadiumRecords(race: number, lap: number): Record<string, string> {
  const record: TrackRecord = {
    race: { time: race, kart: 'mk8-luigi', date: '2026-10-01' },
    lap: { time: lap, kart: 'mk8-luigi', date: '2026-10-01' },
  };
  return recordStorage(recordTrack('stadium'), ENGINE_CLASS, record);
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-vs-settings',
    group: 'MK8 Mode',
    description:
      'MK8 VS Race settings (MK-131): Class, Items (normal / none / mushrooms, shells or bananas only) and CPU (easy / normal / hard). Up/Down pick a row, Left/Right or the ◀ ▶ arrows change it, OK goes on to the cups with those rules (Back returns to the kart builder).',
    defaultSeed: 1,
    setup: openMk8('vs-settings'),
  },
  {
    name: 'mk8-tt-stadium',
    group: 'MK8 Mode',
    description:
      'MK8 Time Trial on Mario Kart Stadium (MK-131) from the countdown: you alone, no item boxes, Triple Mushrooms in the slot; the clock and lap splits under the minimap. Finish for the results, saved records and "New record!". Needs the MK8 pack.',
    defaultSeed: 1,
    mk8Course: 'mario-kart-stadium',
    setup: (seed) => {
      const setup = onCourse(MK8_STADIUM_ID, timeTrialRace)(seed);
      // Without the pack it stays the "not installed" (or password) screen.
      return setup.screen === 'mk8' ? setup : { ...setup, mk8Start: 'time-trial' };
    },
  },
  {
    name: 'mk8-tt-ramp',
    group: 'MK8 Mode',
    description:
      'MK8 Time Trial (MK-131) on the synthetic test ramp (no pack needed): you alone from the countdown, no item boxes, Triple Mushrooms (3 uses), the clock and lap splits under the minimap.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onRamp(timeTrialRace, { mk8Start: 'time-trial' }),
  },
  {
    name: 'mk8-tt-new-record',
    group: 'MK8 Mode',
    description:
      'A finished MK8 Time Trial (MK-131), 1:18.400 with a 0:24.800 best lap, over saved Mario Kart Stadium records of 1:20.000 and 0:25.000: "New record!", the lap splits and both new bests; they are saved and show on the course card. Retry / Quit.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: (seed) => ({
      ...onRamp(finishedTimeTrial, { mk8Start: 'time-trial' })(seed),
      storage: stadiumRecords(80, 25),
    }),
  },
  {
    name: 'mk8-tt-slower',
    group: 'MK8 Mode',
    description:
      'A finished MK8 Time Trial (MK-131), 1:18.400, slower than the saved records (1:15.000, best lap 0:24.000): no "New record!", the old bests stay.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: (seed) => ({
      ...onRamp(finishedTimeTrial, { mk8Start: 'time-trial' })(seed),
      storage: stadiumRecords(75, 24),
    }),
  },
  {
    name: 'mk8-tt-courses',
    group: 'MK8 Mode',
    description:
      'MK8 Time Trial course select (MK-131) with a saved 150cc best of 1:15.000 on Mario Kart Stadium: its card shows "Best 1:15.000", the others "Best —"; Thwomp Ruins says "Not installed" until it is drivable.',
    defaultSeed: 1,
    setup: (seed) => ({ ...openMk8('tt-course')(seed), storage: stadiumRecords(75, 24) }),
  },
];
export default scenarios;
