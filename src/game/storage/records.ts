import { KART_IDS } from '../../sim/data/karts';
import { readJson, type KeyValueStore } from './store';

/** One record: the time, the kart it was set with and the day (absent for pre-v2 bests). */
export interface RecordEntry {
  /** Seconds. */
  time: number;
  kart: string;
  /** `YYYY-MM-DD`, local time. */
  date?: string;
}

/** A track's records for one engine class (MK-44), whatever kart set them. */
export interface TrackRecord {
  race?: RecordEntry;
  lap?: RecordEntry;
}

/** What a finished race did to the records. */
export interface RecordUpdate {
  previous: TrackRecord;
  record: TrackRecord;
  newRace: boolean;
  newLap: boolean;
}

/** A finished race, as far as records care. */
export interface FinishedRace {
  kart: string;
  raceTime: number;
  lapTimes: number[];
}

const recordKey = (trackId: string, engineClass: number) =>
  `kart-racer:records:${trackId}:${engineClass}`;

function readEntry(value: unknown): RecordEntry | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { time, kart, date } = value as Record<string, unknown>;
  if (typeof time !== 'number' || !Number.isFinite(time) || typeof kart !== 'string') {
    return undefined;
  }
  return { time, kart, ...(typeof date === 'string' ? { date } : {}) };
}

function withEntries(race: RecordEntry | undefined, lap: RecordEntry | undefined): TrackRecord {
  return { ...(race ? { race } : {}), ...(lap ? { lap } : {}) };
}

/** Today as `YYYY-MM-DD` in local time. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The records for a track and engine class (track select, results, leaderboard). The first read
 * after v2 migrates the MVP's per-kart bests: the best race and best lap across all karts.
 */
export function getRecord(store: KeyValueStore, trackId: string, engineClass: number): TrackRecord {
  const raw = store.get(recordKey(trackId, engineClass));
  if (raw !== null) {
    const stored = readJson(store, recordKey(trackId, engineClass));
    return withEntries(readEntry(stored.race), readEntry(stored.lap));
  }
  const migrated = migrateBests(store, trackId, engineClass);
  if (migrated.race || migrated.lap) setRecord(store, trackId, engineClass, migrated);
  return migrated;
}

/** Overwrites a track's records (migration). */
export function setRecord(
  store: KeyValueStore,
  trackId: string,
  engineClass: number,
  record: TrackRecord,
): void {
  store.set(recordKey(trackId, engineClass), JSON.stringify(record));
}

/** A track's records as stored key → value, for scenarios that start with saved records. */
export function recordStorage(
  trackId: string,
  engineClass: number,
  record: TrackRecord,
): Record<string, string> {
  return { [recordKey(trackId, engineClass)]: JSON.stringify(record) };
}

/** Saves a finished race's time and best lap where they beat the records; says what improved. */
export function saveRaceRecord(
  store: KeyValueStore,
  trackId: string,
  engineClass: number,
  race: FinishedRace,
  date = today(),
): RecordUpdate {
  const previous = getRecord(store, trackId, engineClass);
  const lapTime = race.lapTimes.length ? Math.min(...race.lapTimes) : undefined;
  const newRace = previous.race === undefined || race.raceTime < previous.race.time;
  const newLap =
    lapTime !== undefined && (previous.lap === undefined || lapTime < previous.lap.time);
  const record = withEntries(
    newRace ? { time: race.raceTime, kart: race.kart, date } : previous.race,
    newLap ? { time: lapTime, kart: race.kart, date } : previous.lap,
  );
  if (newRace || newLap) setRecord(store, trackId, engineClass, record);
  return { previous, record, newRace, newLap };
}

/** MVP best times, per track × kart × engine class (read only, for the v2 migration). */
export interface Bests {
  bestLap?: number;
  bestRace?: number;
}

const bestsKey = (trackId: string, kartType: string, engineClass: number) =>
  `kart-racer:bests:${trackId}:${kartType}:${engineClass}`;

export function readBests(
  store: KeyValueStore,
  trackId: string,
  kartType: string,
  engineClass: number,
): Bests {
  return readJson(store, bestsKey(trackId, kartType, engineClass)) as Bests;
}

function migrateBests(store: KeyValueStore, trackId: string, engineClass: number): TrackRecord {
  let race: RecordEntry | undefined;
  let lap: RecordEntry | undefined;
  for (const kart of KART_IDS) {
    const bests = readBests(store, trackId, kart, engineClass);
    const bestRace = readEntry({ time: bests.bestRace, kart });
    const bestLap = readEntry({ time: bests.bestLap, kart });
    if (bestRace && (!race || bestRace.time < race.time)) race = bestRace;
    if (bestLap && (!lap || bestLap.time < lap.time)) lap = bestLap;
  }
  return withEntries(race, lap);
}
