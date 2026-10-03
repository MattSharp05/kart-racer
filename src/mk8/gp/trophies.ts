// MK8 Grand Prix trophies (MK-130): the best trophy won in each cup at each engine class, saved per
// device under its own key (the game's prefs stay as they are). The cup select shows them.
import { readJson, type KeyValueStore } from '../../game/storage/store';
import type { Trophy } from './grandPrix';

export const TROPHIES_KEY = 'kart-racer:mk8-trophies';

/** Best first. */
const RANK: readonly Trophy[] = ['gold', 'silver', 'bronze'];

type Saved = Record<string, Record<string, Trophy>>;

function read(store: KeyValueStore): Saved {
  const raw = readJson(store, TROPHIES_KEY) as Record<string, unknown>;
  const saved: Saved = {};
  for (const [cup, classes] of Object.entries(raw)) {
    if (!classes || typeof classes !== 'object') continue;
    const kept: Record<string, Trophy> = {};
    for (const [cc, trophy] of Object.entries(classes as Record<string, unknown>)) {
      if (RANK.includes(trophy as Trophy)) kept[cc] = trophy as Trophy;
    }
    saved[cup] = kept;
  }
  return saved;
}

/** The best trophy won in `cup` at `engineClass`, if any. */
export function savedTrophy(
  store: KeyValueStore,
  cup: string,
  engineClass: number,
): Trophy | undefined {
  return read(store)[cup]?.[String(engineClass)];
}

/** Saves `trophy` for `cup` at `engineClass` unless a better one is saved; returns the best. */
export function saveTrophy(
  store: KeyValueStore,
  cup: string,
  engineClass: number,
  trophy: Trophy,
): Trophy {
  const saved = read(store);
  const before = saved[cup]?.[String(engineClass)];
  const best = before && RANK.indexOf(before) <= RANK.indexOf(trophy) ? before : trophy;
  saved[cup] = { ...saved[cup], [String(engineClass)]: best };
  store.set(TROPHIES_KEY, JSON.stringify(saved));
  return best;
}
