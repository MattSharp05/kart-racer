// Underwater (MK-107) on the synthetic MK8 test ramp's water basin: no pack needed. Like
// `testRamp.ts`, this module is in the main bundle, so the test ramp's numbers are copied as plain
// numbers (`underwater.test.ts` keeps them equal to `test-ramp/layout.ts`).
import { createSimState } from '../../sim/state';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';

export const WATER_RAMP = {
  id: 'mk8-test-ramp',
  /** Straight C runs along −X at z = 2 × turn radius. */
  turnRadius: 40,
  /** The basin: x range, and its floor `depth` m below the road. */
  water: { from: 60, to: 100, depth: 3 },
} as const;

const { turnRadius, water } = WATER_RAMP;
/** Facing −X, down straight C. */
const ALONG_C = Math.PI / 2;

function onC(seed: number, x: number, y: number, speed: number): SimState {
  return createSimState({
    seed,
    trackId: WATER_RAMP.id,
    engineClass: 150,
    itemsOn: false,
    karts: [{ position: { x, y, z: 2 * turnRadius }, heading: ALONG_C, speed }],
  });
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-test-water',
    group: 'MK8 Mode',
    description:
      'Underwater (MK-107): you on the test ramp, rolling towards its water basin. Drive in: a splash, the propeller comes out, bubbles trail, the screen turns blue with caustics once the camera is under; the kart is slower, hops (drift button) float higher and longer. Drive out the far side: another splash.',
    defaultSeed: 1,
    mk8Course: WATER_RAMP.id,
    setup: (seed) => ({ state: onC(seed, water.to + 30, 0, 15) }),
  },
  {
    name: 'mk8-test-water-under',
    group: 'MK8 Mode',
    description:
      'Underwater (MK-107): you parked on the floor of the test ramp’s water basin, the camera under the surface: blue tint and caustics, bubbles and the propeller. Use &paused=1 for a still look.',
    defaultSeed: 1,
    mk8Course: WATER_RAMP.id,
    setup: (seed) => ({
      state: onC(seed, (water.from + water.to) / 2 - 5, -water.depth, 0),
    }),
  },
];
export default scenarios;
