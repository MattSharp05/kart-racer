import { readJson, type KeyValueStore } from './store';

/** Last kart, engine class and track picked in the menus. */
export interface Prefs {
  kart?: string;
  engineClass?: number;
  /** MK-50. */
  track?: string;
}

const PREFS_KEY = 'kart-racer:prefs';

export function readPrefs(store: KeyValueStore): Prefs {
  return readJson(store, PREFS_KEY) as Prefs;
}

export function writePrefs(store: KeyValueStore, prefs: Prefs): void {
  store.set(PREFS_KEY, JSON.stringify(prefs));
}
