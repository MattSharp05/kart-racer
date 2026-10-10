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

/** Another person racing on this screen (MK-148): their racer, and their kart when known. */
export interface VsHuman {
  kartId: KartId;
  loadout?: Loadout;
}

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
 *
 * Local multiplayer (MK-148): `others` (P2–P4) race too, karts 1… after the player's, the
 * players spread over the back half of the grid and CPUs (none of the players' racers) filling
 * the rest. With no `others` the field is the same as a solo race's.
 */
export function vsField(
  playerKart: KartId,
  loadout: Loadout | undefined,
  seed: number,
  others: readonly VsHuman[] = [],
): RacerSlot[] | undefined {
  const rng: RngHolder = { rngState: seedRng(seed) };
  const humans: VsHuman[] = [
    { kartId: playerKart, ...(loadout ? { loadout } : {}) },
    ...others.slice(0, PLAYER_SLOTS[1] - PLAYER_SLOTS[0]),
  ];
  const taken = new Set(humans.map((h) => h.loadout?.racer ?? h.kartId));
  const pool = MK8_RACERS.map((r) => r.id)
    .filter((id) => !taken.has(id) && racers.has(id))
    .sort();
  const cpus = FIELD - humans.length;
  if (pool.length < cpus) return undefined;
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rngInt(rng, 0, i);
    [pool[i], pool[j]] = [pool[j] as string, pool[i] as string];
  }
  const humanSlots = gridSlotsFor(rng, humans.length);
  const free = Array.from({ length: FIELD }, (_, i) => i).filter((i) => !humanSlots.includes(i));
  return [
    ...humans.map((human, i): RacerSlot => ({
      kartId: human.kartId,
      controller: 'local',
      gridSlot: humanSlots[i] ?? i,
      ...(human.loadout ? { loadout: { ...human.loadout } } : {}),
    })),
    ...pool.slice(0, cpus).map((racer, i): RacerSlot => ({
      kartId: racer,
      controller: 'ai',
      gridSlot: free[i] ?? humans.length + i,
      loadout: defaultLoadout(racer),
    })),
  ];
}

/**
 * The players' grid slots: one of slots 5–8 alone (as before MK-148), else `count` of them
 * shuffled.
 */
function gridSlotsFor(rng: RngHolder, count: number): number[] {
  if (count <= 1) return [rngInt(rng, ...PLAYER_SLOTS)];
  const back = Array.from(
    { length: PLAYER_SLOTS[1] - PLAYER_SLOTS[0] + 1 },
    (_, i) => PLAYER_SLOTS[0] + i,
  );
  for (let i = back.length - 1; i > 0; i--) {
    const j = rngInt(rng, 0, i);
    [back[i], back[j]] = [back[j] as number, back[i] as number];
  }
  return back.slice(0, count);
}
