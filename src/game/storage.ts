/** Tiny key/value store so the game works (and tests run) with or without localStorage. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, string>();
  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/** localStorage when it works (private mode and some embeds throw), otherwise in-memory. */
export function browserStore(): KeyValueStore {
  try {
    const probe = '__kart_racer_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return {
      get: (key) => {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      set: (key, value) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          // Storage full or blocked: bests just aren't remembered.
        }
      },
    };
  } catch {
    return new MemoryStore();
  }
}

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
  try {
    const raw = store.get(key(trackId, kartType, engineClass));
    const parsed = raw ? (JSON.parse(raw) as Bests) : {};
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
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

export interface Prefs {
  kart?: string;
  engineClass?: number;
}

const PREFS_KEY = 'kart-racer:prefs';

/** Last kart and engine class picked in the menus. */
export function readPrefs(store: KeyValueStore): Prefs {
  try {
    const raw = store.get(PREFS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Prefs) : {};
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function writePrefs(store: KeyValueStore, prefs: Prefs): void {
  store.set(PREFS_KEY, JSON.stringify(prefs));
}

const MUTED_KEY = 'kart-racer:muted';

/** Sound on/off (MK-26). */
export function readMuted(store: KeyValueStore): boolean {
  return store.get(MUTED_KEY) === '1';
}

export function writeMuted(store: KeyValueStore, muted: boolean): void {
  store.set(MUTED_KEY, muted ? '1' : '0');
}
