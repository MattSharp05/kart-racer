import { kartDef } from '../sim/data/karts';
import { raceResults, raceTime } from '../sim/raceFlow';
import type { SimState } from '../sim/types';
import type { RecordLineView } from '../ui/screens/results';
import { saveRaceRecord, type RecordUpdate } from './storage/records';
import type { KeyValueStore } from './storage/store';

/** One line of the results screen. */
export interface ResultLine {
  position: number;
  name: string;
  /** The local player's line (highlighted, and the "You finished …" title). */
  you: boolean;
  /** Race time, s; absent while still racing. */
  time?: number;
}

/** The results screen's rows, leader first, with `localKartId`'s row marked as yours (MK-38). */
export function resultLines(state: SimState, localKartId: number): ResultLine[] {
  return raceResults(state).map((row) => {
    const kart = state.karts[row.kartId];
    return {
      position: row.position,
      name: kart ? (kart.name ?? kartDef(kart.kartType).name) : '?',
      you: row.kartId === localKartId,
      ...(row.time !== undefined ? { time: row.time } : {}),
    };
  });
}

/**
 * Saves `kartId`'s finished race to the track records (MK-44). Local and online races alike: the
 * caller reports the local kart's `finish` event, whoever ran the sim.
 */
export function recordFinish(
  store: KeyValueStore,
  state: SimState,
  kartId: number,
): RecordUpdate | undefined {
  const kart = state.karts[kartId];
  if (!kart || kart.race.finishTick === undefined) return undefined;
  return saveRaceRecord(store, state.trackId, state.engineClass, {
    kart: kart.kartType,
    raceTime: raceTime(state, kart.race.finishTick),
    lapTimes: kart.race.lapTimes,
  });
}

/** The results screen's record lines: race then lap, each flagged if this race set it. */
export function recordLines(update: RecordUpdate): RecordLineView[] {
  const lines: RecordLineView[] = [];
  const add = (label: string, key: 'race' | 'lap', isNew: boolean) => {
    const entry = update.record[key];
    if (!entry) return;
    const previous = update.previous[key]?.time;
    lines.push({
      label,
      time: entry.time,
      isNew,
      ...(isNew && previous !== undefined ? { previous } : {}),
    });
  };
  add('Race record', 'race', update.newRace);
  add('Lap record', 'lap', update.newLap);
  return lines;
}
