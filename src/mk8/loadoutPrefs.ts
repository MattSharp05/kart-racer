// MK8 Mode's last loadout, saved per device in the game's prefs (MK-102). The kart builder screen
// reads it to start where the player left off and saves each confirmed pick.
import { readPrefs, writePrefs } from '../game/storage/prefs';
import type { KeyValueStore } from '../game/storage/store';
import type { Loadout } from '../sim/types';
import { resolveLoadout } from './content/parts';
import { RACER_POINTS } from './content/stats';

/**
 * Racer `racer`'s loadout for the kart builder: the last saved parts (MK8 keeps your kart when you
 * change racer), or the racer's default with nothing saved. Unknown saved parts fall back.
 */
export function savedLoadout(store: KeyValueStore, racer: string): Loadout {
  return resolveLoadout(racer, readPrefs(store).mk8Loadout);
}

/** The racer the player last raced in MK8 Mode, if any (and still an MK8 racer). */
export function savedRacer(store: KeyValueStore): string | undefined {
  const racer = readPrefs(store).mk8Loadout?.racer;
  return typeof racer === 'string' && Object.hasOwn(RACER_POINTS, racer) ? racer : undefined;
}

/** Remembers `loadout` as the last one picked (the other prefs stay). */
export function saveLoadout(store: KeyValueStore, loadout: Loadout): void {
  writePrefs(store, { ...readPrefs(store), mk8Loadout: { ...loadout } });
}
