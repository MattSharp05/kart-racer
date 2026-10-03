import { itemSets } from '../../content/items';
import type { KartId } from '../data/karts';
import { headingOf } from '../math';
import { routeGeometry } from '../route';
import { rngRange, seedRng, type RngHolder } from '../rng';
import { createSimState, type KartSpawn } from '../state';
import { getTrack, trackGeometry } from '../track';
import { tuning, type EngineClass } from '../tuning';
import type { AiState, KartController, Loadout, SimState } from '../types';

/** One racer in a race: kart `i` of the state comes from `racers[i]` (MK-38). */
export interface RacerSlot {
  /** Which kart they drive (stats + model). */
  kartId: KartId;
  controller: KartController;
  /** Display name (online nicknames). */
  name?: string;
  /** Index into the track's grid slots; default: the racer's own index (pole first). */
  gridSlot?: number;
  /** MK8 Mode's kart parts (MK-102). */
  loadout?: Loadout;
}

export interface CreateRaceOptions {
  trackId: string;
  racers: readonly RacerSlot[];
  engineClass: EngineClass;
  /** Item boxes on the track (the lobby's items on/off). */
  itemsOn: boolean;
  seed: number;
  laps?: number;
  /** A registered item set (MK-103: `mk8`, with its slot count); default the original game's. */
  itemSet?: string;
  /**
   * Setup randomness (AI personalities). Defaults to a stream derived from `seed`; callers that
   * already drew from that stream (grid shuffle, kart picks) pass it on so the draws continue.
   */
  rng?: RngHolder;
}

/** The setup RNG stream for `seed` (separate from the sim's own RNG in `SimState`). */
export function raceSetupRng(seed: number): RngHolder {
  return { rngState: seedRng(seed * 7919 + 13) };
}

/**
 * Builds the initial state of a race (MK-38, ADR 0007): racers on the track's grid slots in
 * countdown, AI drivers with seeded personalities, rubber-banding when any AI is racing.
 */
export function createRace({
  trackId,
  racers,
  engineClass,
  itemsOn,
  seed,
  laps,
  itemSet,
  rng = raceSetupRng(seed),
}: CreateRaceOptions): SimState {
  const track = getTrack(trackId);
  if (track.kind === 'arena') throw new Error(`createRace: ${trackId} is not a race track`);
  // Mesh tracks (MK-105): the grid is on the route, each kart on the road's own up there.
  const place =
    track.kind === 'spline'
      ? (t: number, lateral: number): KartSpawn => {
          const geometry = trackGeometry(track);
          return { position: geometry.pointAt(t, lateral), heading: geometry.headingAt(t) };
        }
      : (t: number, lateral: number): KartSpawn => {
          const frame = routeGeometry(track.route).frameAt(t, lateral);
          return { position: frame.position, heading: headingOf(frame.tangent, 0), up: frame.up };
        };
  const slots = (track.kind === 'spline' ? track.gridSlots : track.route.gridSlots) ?? [];
  const state = createSimState({
    seed,
    trackId,
    phase: 'countdown',
    engineClass,
    itemsOn,
    ...(laps !== undefined ? { laps } : {}),
    ...(itemSet !== undefined ? { itemSet, itemSlots: itemSets.get(itemSet).slots } : {}),
    karts: racers.map((racer, i) => {
      const slot = slots[racer.gridSlot ?? i];
      if (!slot) throw new Error(`createRace: ${trackId} has no grid slot ${racer.gridSlot ?? i}`);
      return {
        kartType: racer.kartId,
        controller: racer.controller,
        ...(racer.name !== undefined ? { name: racer.name } : {}),
        ...(racer.loadout ? { loadout: racer.loadout } : {}),
        ...place(slot.t, slot.lateral),
      };
    }),
  });
  const ai = tuning.ai;
  const skillMin = engineClass >= ai.sharpClass ? ai.skillMin150 : ai.skillMin;
  for (const kart of state.karts) {
    if (kart.controller !== 'ai') continue;
    kart.ai = aiDriver(rng, skillMin, ai.skillMax, ai.lineOffsetMax);
  }
  if (state.karts.some((kart) => kart.controller === 'ai')) state.race.rubberBand = true;
  return state;
}

function aiDriver(rng: RngHolder, skillMin: number, skillMax: number, offsetMax: number): AiState {
  return {
    lineOffset: rngRange(rng, -offsetMax, offsetMax),
    skill: rngRange(rng, skillMin, skillMax),
    aggression: rngRange(rng, 0, 1),
    stuckTime: 0,
    recoverTime: 0,
  };
}
