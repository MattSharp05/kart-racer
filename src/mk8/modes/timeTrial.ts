// MK8 Time Trial (MK-131): one kart against the clock on any course, no item boxes, three
// mushrooms to start with; the best race and lap per course and engine class are saved on this
// device (the game's records store, under the MK8 course's own key) and show on the course cards.
// Pure apart from the store it is handed.
import {
  getRecord,
  saveRaceRecord,
  type RecordUpdate,
  type TrackRecord,
} from '../../game/storage/records';
import type { KeyValueStore } from '../../game/storage/store';
import type { KartId } from '../../sim/data/karts';
import type { RacerSlot } from '../../sim/race/createRace';
import { raceTime } from '../../sim/raceFlow';
import { tuning } from '../../sim/tuning';
import type { Loadout, SimState } from '../../sim/types';
import type { Mk8CourseKey } from '../content/cups';

/** The item a Time Trial starts with. */
export const TIME_TRIAL_ITEM = 'triple-mushroom';

/** A Time Trial's grid: the player alone, on pole. */
export function timeTrialField(playerKart: KartId, loadout?: Loadout): RacerSlot[] {
  return [
    {
      kartId: playerKart,
      controller: 'local',
      gridSlot: 0,
      ...(loadout ? { loadout: { ...loadout } } : {}),
    },
  ];
}

/**
 * A Time Trial on a fresh race: marked as one (the HUD's timer), the item boxes out, and every
 * kart holding the Triple Mushrooms with all three uses.
 */
export function applyTimeTrial(state: SimState): void {
  state.timeTrial = true;
  state.entities = state.entities.filter((e) => e.kind !== 'itemBox');
  for (const kart of state.karts) {
    kart.item.held = TIME_TRIAL_ITEM;
    kart.item.uses = tuning.mk8.timeTrial.mushrooms;
    kart.item.roulette = 0;
  }
}

/** The records store's key for an MK8 course (apart from our own tracks' ids). */
export const recordTrack = (course: Mk8CourseKey): string => `mk8:${course}`;

/** A course's Time Trial records at an engine class. */
export function courseRecord(
  store: KeyValueStore,
  course: Mk8CourseKey,
  engineClass: number,
): TrackRecord {
  return getRecord(store, recordTrack(course), engineClass);
}

/** The kart's race time so far (or at the finish), s; 0 before the start. */
export function raceClock(state: SimState, kartId: number): number {
  return raceTime(state, state.karts[kartId]?.race.finishTick ?? state.tick);
}

/**
 * Saves a finished Time Trial (kart `kartId`'s race time and best lap) where it beats the course's
 * records; undefined when the kart hasn't finished.
 */
export function saveTimeTrial(
  store: KeyValueStore,
  course: Mk8CourseKey,
  state: SimState,
  kartId: number,
  racer: string,
): RecordUpdate | undefined {
  const kart = state.karts[kartId];
  if (kart?.race.finishTick === undefined) return undefined;
  return saveRaceRecord(store, recordTrack(course), state.engineClass, {
    kart: racer,
    raceTime: raceClock(state, kartId),
    lapTimes: kart.race.lapTimes,
  });
}
