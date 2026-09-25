import { readJson, type KeyValueStore } from './store';

/** Best times per track × kart × engine class (same keys as before MK-37). */
export interface Bests {
  bestLap?: number;
  bestRace?: number;
}

export interface BestsUpdate extends Bests {
  newBestLap: boolean;
  newBestRace: boolean;
}

const key = (trackId: string, kartType: string, engineClass: number) =>
  `kart-racer:bests:${trackId}:${kartType}:${engineClass}`;

export function readBests(
  store: KeyValueStore,
  trackId: string,
  kartType: string,
  engineClass: number,
): Bests {
  return readJson(store, key(trackId, kartType, engineClass)) as Bests;
}

/** Saves the best lap and best race time for this track + kart + engine class; says what improved. */
export function recordBests(
  store: KeyValueStore,
  trackId: string,
  kartType: string,
  engineClass: number,
  lapTimes: number[],
  raceTime: number,
): BestsUpdate {
  const previous = readBests(store, trackId, kartType, engineClass);
  const lap = lapTimes.length ? Math.min(...lapTimes) : undefined;
  const newBestLap =
    lap !== undefined && (previous.bestLap === undefined || lap < previous.bestLap);
  const newBestRace = previous.bestRace === undefined || raceTime < previous.bestRace;
  const bests: Bests = {
    ...(newBestLap
      ? { bestLap: lap }
      : previous.bestLap !== undefined
        ? { bestLap: previous.bestLap }
        : {}),
    bestRace: newBestRace ? raceTime : previous.bestRace,
  };
  store.set(key(trackId, kartType, engineClass), JSON.stringify(bests));
  return { ...bests, newBestLap, newBestRace };
}
