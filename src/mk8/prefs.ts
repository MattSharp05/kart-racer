// MK8 Mode's remembered picks (MK-117): the last racer chosen on the character select. Kept under
// their own key: the original game's prefs are rewritten whole on every race, which would drop
// MK8's.
import type { KeyValueStore } from '../game/storage/store';
import { readJson } from '../game/storage/store';

export interface Mk8Prefs {
  /** The racer id last confirmed on the character select (`mk8-luigi`). */
  racer?: string;
}

export const MK8_PREFS_KEY = 'kart-racer:mk8-prefs';

export function readMk8Prefs(store: KeyValueStore): Mk8Prefs {
  const json = readJson(store, MK8_PREFS_KEY);
  return typeof json.racer === 'string' ? { racer: json.racer } : {};
}

export function writeMk8Prefs(store: KeyValueStore, prefs: Mk8Prefs): void {
  store.set(MK8_PREFS_KEY, JSON.stringify({ ...readMk8Prefs(store), ...prefs }));
}
