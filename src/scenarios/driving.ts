import { tierIndex } from '../sim/drift';
import { vec3 } from '../sim/math';
import { createSimState } from '../sim/state';
import { tuning } from '../sim/tuning';
import type { Scenario } from './registry';

/** 10 m of clear space between the kart's edge and the wall it faces. */
const WALL_GAP = 10;
/** 35° left of straight-on, so the kart meets the −Z wall at an angle. */
const ANGLED_HIT = (35 * Math.PI) / 180;
const TIER_NAMES = { 1: 'blue', 2: 'orange', 3: 'purple' } as const;

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
            position: vec3(0, 0, -(100 - tuning.kartFront - WALL_GAP)),
            heading: 0,
            speed: 20,
          },
        ],
      }),
    }),
  },
  {
    name: 'test-pad-wall-angled',
    group: 'Driving',
    description:
      'Kart hitting a wall at 35° and 20 m/s — should slide along it, never poke through.',
    defaultSeed: 1,
    setup: (seed) => ({
      state: createSimState({
        seed,
        trackId: 'test-pad',
        karts: [
          {
            position: vec3(-20, 0, -(100 - tuning.kartFront - WALL_GAP)),
            heading: ANGLED_HIT,
            speed: 20,
          },
        ],
      }),
    }),
  },
  {
    name: 'drift-ready',
    group: 'Drift',
    description:
      'Rolling at 80% speed with open space ahead. Hold a direction + Space (or Shift) to drift; release to boost.',
    defaultSeed: 1,
    setup: (seed) => ({
      state: createSimState({
        seed,
        trackId: 'test-pad',
        karts: [{ position: vec3(0, 0, 60), speed: tuning.topSpeed[100] * 0.8 }],
      }),
    }),
  },
  ...([1, 2, 3] as const).map((tier): Scenario => ({
    name: `drift-charged-${TIER_NAMES[tier]}`,
    group: 'Drift',
    description: `Mid-drift with ${TIER_NAMES[tier]} sparks. Keep holding drift, or release it for a tier-${tier} mini-turbo.`,
    defaultSeed: 1,
    setup: (seed) => {
      const state = createSimState({
        seed,
        trackId: 'test-pad',
        karts: [{ speed: tuning.topSpeed[100] * 0.9, heading: -0.6 }],
      });
      const [kart] = state.karts;
      if (!kart) throw new Error('scenario has no kart');
      // Just past the tier threshold, drift button held.
      kart.drift = { direction: 1, charge: tuning.driftTiers[tierIndex(tier)] + 0.05, tier };
      kart.driftHeld = true;
      return { state };
    },
  })),
];
