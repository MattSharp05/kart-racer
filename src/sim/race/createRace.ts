import type { KartId } from '../data/karts';
import { rngRange, seedRng, type RngHolder } from '../rng';
import { createSimState } from '../state';
import { getTrack, trackGeometry } from '../track';
import { tuning, type EngineClass } from '../tuning';
import type { AiState, KartController, SimState } from '../types';

/** One racer in a race: kart `i` of the state comes from `racers[i]` (MK-38). */
export interface RacerSlot {
  /** Which kart they drive (stats + model). */
  kartId: KartId;
  controller: KartController;
  /** Display name (online nicknames). */
  name?: string;
  /** Index into the track's grid slots; default: the racer's own index (pole first). */
  gridSlot?: number;
}

export interface CreateRaceOptions {
  trackId: string;
  racers: readonly RacerSlot[];
  engineClass: EngineClass;
  /** Item boxes on the track (the lobby's items on/off). */
  itemsOn: boolean;
  seed: number;
  laps?: number;
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
  rng = raceSetupRng(seed),
}: CreateRaceOptions): SimState {
  const track = getTrack(trackId);
  if (track.kind !== 'spline') throw new Error(`createRace: ${trackId} is not a race track`);
  const geometry = trackGeometry(track);
  const slots = track.gridSlots ?? [];
  const state = createSimState({
    seed,
    trackId,
    phase: 'countdown',
    engineClass,
    itemsOn,
    ...(laps !== undefined ? { laps } : {}),
    karts: racers.map((racer, i) => {
      const slot = slots[racer.gridSlot ?? i];
      if (!slot) throw new Error(`createRace: ${trackId} has no grid slot ${racer.gridSlot ?? i}`);
      return {
        kartType: racer.kartId,
        controller: racer.controller,
        ...(racer.name !== undefined ? { name: racer.name } : {}),
        position: geometry.pointAt(slot.t, slot.lateral),
        heading: geometry.headingAt(slot.t),
      };
    }),
  });
  const ai = tuning.ai;
  const skillMin = engineClass === 150 ? ai.skillMin150 : ai.skillMin;
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
