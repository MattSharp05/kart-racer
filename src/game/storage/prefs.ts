import { readJson, type KeyValueStore } from './store';

/** Last kart and engine class picked in the menus. */
export interface Prefs {
  kart?: string;
  engineClass?: number;
}

const PREFS_KEY = 'kart-racer:prefs';

export function readPrefs(store: KeyValueStore): Prefs {
  return readJson(store, PREFS_KEY) as Prefs;
}

export function writePrefs(store: KeyValueStore, prefs: Prefs): void {
  store.set(PREFS_KEY, JSON.stringify(prefs));
}
