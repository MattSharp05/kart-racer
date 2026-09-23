import type { KartId } from './data/karts';
import { forwardFromHeading, scale, vec3 } from './math';
import { seedRng } from './rng';
import type { EngineClass } from './tuning';
import { DT, tuning } from './tuning';
import type { KartState, RacePhase, SimState } from './types';

export interface KartSpawn {
  kartType?: KartId;
  position?: KartState['position'];
  heading?: number;
  /** Initial forward speed, m/s. */
  speed?: number;
}

export interface InitialStateOptions {
  seed: number;
  /** `free` = free drive (no race); `countdown` = a race that starts with 3-2-1-GO. */
  phase?: RacePhase;
  laps?: number;
  trackId?: string;
  engineClass?: EngineClass;
  karts?: KartSpawn[];
}

/** Builds a fresh SimState. With no karts given, places one kart at the origin facing −Z. */
export function createSimState({
  seed,
  phase = 'free',
  laps = tuning.raceLaps,
  trackId = 'test-pad',
  engineClass = 100,
  karts = [{}],
}: InitialStateOptions): SimState {
  return {
    tick: 0,
    rngState: seedRng(seed),
    phase,
    trackId,
    engineClass,
    karts: karts.map((spawn, id) => {
      const heading = spawn.heading ?? 0;
      const speed = spawn.speed ?? 0;
      return {
        id,
        kartType: spawn.kartType ?? 'maple',
        position: spawn.position ?? vec3(),
        velocity: scale(forwardFromHeading(heading), speed),
        heading,
        speed,
        grounded: true,
        drift: { direction: 0, charge: 0, tier: 0 },
        driftHeld: false,
        boostTimer: 0,
        airTime: 0,
        trick: 'none',
        race: {
          lap: 0,
          nextCheckpoint: 0,
          lastT: -1,
          lapStartTick: 0,
          lapTimes: [],
          wrongWayTime: 0,
          wrongWay: false,
          stallTimer: 0,
        },
      };
    }),
    entities: [],
    positions: karts.map((_, id) => id),
    race: {
      laps,
      countdownStartTick: 0,
      goTick: phase === 'countdown' ? Math.round(tuning.countdownSeconds / DT) : 0,
    },
  };
}
