import { vec3 } from '../sim/math';
import { createSimState } from '../sim/state';
import { tuning } from '../sim/tuning';
import type { Scenario } from './registry';

/** 10 m of clear space between the kart's edge and the wall it faces. */
const WALL_GAP = 10;

export const drivingScenarios: Scenario[] = [
  {
    name: 'test-pad',
    group: 'Driving',
    description: 'Kart parked in the middle of the flat test pad. Drive with WASD / arrows.',
    defaultSeed: 1,
    setup: (seed) => ({ state: createSimState({ seed, trackId: 'test-pad' }) }),
  },
  {
    name: 'test-pad-wall',
    group: 'Driving',
    description: 'Kart heading straight at a wall at 20 m/s, 10 m away.',
    defaultSeed: 1,
    setup: (seed) => ({
      state: createSimState({
        seed,
        trackId: 'test-pad',
        karts: [
          {
            position: vec3(0, 0, -(100 - tuning.kartRadius - WALL_GAP)),
            heading: 0,
            speed: 20,
          },
        ],
      }),
    }),
  },
];
