// Anti-gravity spin boost scenarios (MK-108) on the synthetic MK8 test ramp: no pack needed. Like
// `testRamp.ts`, this module is in the main bundle, so the test ramp's numbers are copied as plain
// numbers (`spinBoost.test.ts` keeps them equal to `test-ramp/layout.ts`).
import { createSimState, type KartSpawn } from '../../sim/state';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';

export const SPIN_BOOST_RAMP = {
  id: 'mk8-test-ramp',
  /** The tunnel's anti-gravity wall is at z = this (facing −Z). */
  roadHalfWidth: 7,
  tunnel: { from: 30 },
  wallBumper: { x: 70, height: 4 },
} as const;

const { roadHalfWidth: WALL_Z, tunnel, wallBumper } = SPIN_BOOST_RAMP;
/** Facing +X, down straight A through the tunnel. */
const ALONG_A = -Math.PI / 2;
/** Standing on the tunnel's anti-gravity wall. */
const ON_WALL = { x: 0, y: 0, z: -1 };

function onWall(x: number, y: number, speed: number): KartSpawn {
  return { position: { x, y, z: WALL_Z }, heading: ALONG_A, speed, up: ON_WALL };
}

function wallState(seed: number, karts: KartSpawn[]): SimState {
  return createSimState({
    seed,
    trackId: SPIN_BOOST_RAMP.id,
    engineClass: 150,
    itemsOn: false,
    karts,
  });
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-test-spinboost',
    group: 'MK8 Mode',
    description:
      'Spin boost (MK-108): you at full speed on the test ramp tunnel’s anti-gravity wall, about to bump a slower kart 6 m ahead. Hold throttle: both karts spin and boost (blue hover wheels and glow trail on the wall). Use &paused=1 to look first.',
    defaultSeed: 1,
    mk8Course: SPIN_BOOST_RAMP.id,
    setup: (seed) => ({
      state: wallState(seed, [onWall(tunnel.from + 2, 5, 26), onWall(tunnel.from + 8, 5, 12)]),
    }),
  },
  {
    name: 'mk8-test-bumper',
    group: 'MK8 Mode',
    description:
      'Boost bumper (MK-108): you on the test ramp tunnel’s anti-gravity wall, about to glance off the bumper on it 12 m ahead (1.2 m to one side): a bounce and a spin boost. The bumper beside the road after the gap (x 140) is plain road: a bounce, no boost.',
    defaultSeed: 1,
    mk8Course: SPIN_BOOST_RAMP.id,
    setup: (seed) => ({
      state: wallState(seed, [onWall(wallBumper.x - 12, wallBumper.height + 1.2, 24)]),
    }),
  },
];
export default scenarios;
