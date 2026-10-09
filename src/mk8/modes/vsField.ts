// The karts of an MK8 VS Race (MK-136): the player and 7 CPU racers drawn from MK8's racers (not
// the original game's), each in their default kart, as a Grand Prix's rivals are. Seeded by the
// course and the picks, so a scenario link or a test gets the same field every time.
import { racers } from '../../content/racers';
import type { RacerSlot } from '../../sim/race/createRace';
import { rngInt, seedRng, type RngHolder } from '../../sim/rng';
import type { EngineClass } from '../../sim/tuning';
import type { KartId } from '../../sim/data/karts';
import type { Loadout } from '../../sim/types';
import { defaultLoadout } from '../content/parts';
import { MK8_RACERS } from '../content/racers';

/** Karts in a VS Race. */
const FIELD = 8;
/** The player starts somewhere in the back half of the grid (0-based slots), as in our races. */
const PLAYER_SLOTS = [4, 7] as const;

/** The seed of a VS Race's field: the course, engine class and player's racer. */
export function vsSeed(course: string, engineClass: EngineClass, racer: string): number {
  // FNV-1a, as a Grand Prix's seed (`gpSeed`; not imported: this file is in the main bundle via the
  // course scenarios, `gp/grandPrix.ts` brings every course with it).
  let h = 2166136261;
  for (const ch of `vs:${course}:${engineClass}:${racer}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The player (`playerKart`, racing `loadout` when known) plus 7 MK8 CPU racers other than the
 * player's, shuffled by `seed`, on the grid with the player in slots 5–8. Undefined while MK8's
 * racers aren't registered (MK8 Mode not opened): the race then picks its own CPUs.
 */
export function vsField(
  playerKart: KartId,
  loadout: Loadout | undefined,
  seed: number,
): RacerSlot[] | undefined {
  const rng: RngHolder = { rngState: seedRng(seed) };
  const player = loadout?.racer ?? playerKart;
  const pool = MK8_RACERS.map((r) => r.id)
    .filter((id) => id !== player && racers.has(id))
    .sort();
  if (pool.length < FIELD - 1) return undefined;
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rngInt(rng, 0, i);
    [pool[i], pool[j]] = [pool[j] as string, pool[i] as string];
  }
  const playerSlot = rngInt(rng, ...PLAYER_SLOTS);
  const others = Array.from({ length: FIELD }, (_, i) => i).filter((i) => i !== playerSlot);
  return [
    {
      kartId: playerKart,
      controller: 'local',
      gridSlot: playerSlot,
      ...(loadout ? { loadout: { ...loadout } } : {}),
    },
    ...pool.slice(0, FIELD - 1).map((racer, i): RacerSlot => ({
      kartId: racer,
      controller: 'ai',
      gridSlot: others[i] ?? i + 1,
      loadout: defaultLoadout(racer),
    })),
  ];
}
