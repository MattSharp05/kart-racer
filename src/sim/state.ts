import { vec3 } from './math';
import { seedRng } from './rng';
import type { KartState, SimState } from './types';

export interface InitialStateOptions {
  seed: number;
  karts?: Partial<KartState>[];
}

/** Builds a fresh SimState. With no karts given, places one kart at the origin. */
export function createSimState({ seed, karts = [{}] }: InitialStateOptions): SimState {
  return {
    tick: 0,
    rngState: seedRng(seed),
    phase: 'free',
    karts: karts.map((kart, id) => ({
      id,
      position: kart.position ?? vec3(),
      heading: kart.heading ?? 0,
      speed: kart.speed ?? 0,
    })),
    entities: [],
  };
}
