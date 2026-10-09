import type { Loadout } from '../../sim/types';
import { readJson, type KeyValueStore } from './store';

/** Last kart, engine class and track picked in the menus. */
export interface Prefs {
  kart?: string;
  engineClass?: number;
  /** MK-50. */
  track?: string;
  /** MK8 Mode's last racer and kart parts (MK-102; read through `mk8/loadoutPrefs.ts`). */
  mk8Loadout?: Partial<Loadout>;
  /** People racing on this screen (MK-144), 1–4. */
  players?: number;
  /** P2–P4's last racers (MK-144). */
  otherKarts?: string[];
  /** Two players' split-screen (MK-145): `stacked` (default) or `side` by side. */
  split?: string;
}

export const PREFS_KEY = 'kart-racer:prefs';

export function readPrefs(store: KeyValueStore): Prefs {
  return readJson(store, PREFS_KEY) as Prefs;
}

export function writePrefs(store: KeyValueStore, prefs: Prefs): void {
  store.set(PREFS_KEY, JSON.stringify(prefs));
}
