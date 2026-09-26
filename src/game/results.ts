import type { RaceStanding } from '../net/protocol';
import { kartDef } from '../sim/data/karts';
import { raceResults, raceTime } from '../sim/raceFlow';
import type { SimState } from '../sim/types';
import type { RecordLineView } from '../ui/screens/results';
import { saveRaceRecord, type RecordUpdate } from './storage/records';
import type { KeyValueStore } from './storage/store';
import { PROFILE_COLOURS } from './profile';

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

/** A line of the online results (MK-55): also the racer, and whether a person drove it. */
export interface OnlineResultLine extends ResultLine {
  /** The racer's name (the kart), shown next to a person's nickname. */
  racer: string;
  /** Driven by a person (host or client), not the AI: highlighted in their colour. */
  human: boolean;
  /** CSS colour of a person's line. */
  colour?: string;
}

/** A human's colour: the lobby's (`colours[kartId]`), else one of the profile swatches by kart. */
export function playerColour(colours: readonly string[] | undefined, kartId: number): string {
  const swatch = PROFILE_COLOURS[kartId % PROFILE_COLOURS.length] ?? PROFILE_COLOURS[0];
  return colours?.[kartId] || swatch.hex;
}

/**
 * The online results screen's rows (MK-55): the host's final `standings` once it sent them (the
 * same on every device), else this device's live standings (finish times are the host's already;
 * the order of karts still racing is this device's prediction).
 */
export function onlineResultLines(
  state: SimState,
  standings: readonly RaceStanding[] | null,
  localKartId: number,
  colours?: readonly string[],
): OnlineResultLine[] {
  const rows = standings
    ? standings.map(({ kartId, finishTick }, i) => ({
        kartId,
        position: i + 1,
        ...(finishTick !== undefined ? { time: raceTime(state, finishTick) } : {}),
      }))
    : raceResults(state);
  return rows.map((row) => {
    const kart = state.karts[row.kartId];
    const racer = kart ? kartDef(kart.kartType).name : '?';
    const human = kart !== undefined && kart.controller !== 'ai';
    return {
      position: row.position,
      name: kart?.name ?? racer,
      racer,
      you: row.kartId === localKartId,
      human,
      ...(human ? { colour: playerColour(colours, row.kartId) } : {}),
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
