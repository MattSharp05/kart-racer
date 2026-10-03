// Coins (MK-109) on the synthetic MK8 test ramp: no pack needed. Like `testRamp.ts`, this module is
// in the main bundle, so the test ramp's numbers are copied as plain numbers (`coins.test.ts` keeps
// them equal to `test-ramp/layout.ts` and `route.ts`).
import { giveItem } from '../../sim/items';
import type { MeshTrackDef } from '../../sim/meshTrack';
import { routeGeometry } from '../../sim/route';
import { createSimState, type KartSpawn } from '../../sim/state';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { courseFreeDrive, onCourse } from './lib/courses';
import { MK8_STADIUM_ID } from './stadium';

export const COINS_RAMP = {
  id: 'mk8-test-ramp',
  /** The first coin line: 5 coins on straight A's centreline over this x range. */
  firstLine: { from: 18, to: 26 },
} as const;

/** Facing +X, down straight A. */
const ALONG_A = -Math.PI / 2;
/** `mk8-test-coins` starts this far before the first coin line: room to reach speed, m. */
const RUN_UP = 40;

const onA = (x: number, speed = 0): KartSpawn => ({
  position: { x, y: 0, z: 0 },
  heading: ALONG_A,
  speed,
});

/** Free drive at 150cc on the test ramp (items off), kart 0 with `coins` coins. */
function coinsState(seed: number, karts: KartSpawn[], coins = 0): SimState {
  const state = createSimState({
    seed,
    trackId: COINS_RAMP.id,
    engineClass: 150,
    itemsOn: false,
    karts,
  });
  const [player] = state.karts;
  if (player) player.coins = coins;
  return state;
}

/**
 * Free drive at speed `lead` m before a real course's first coin line on anti-gravity road (its
 * first coin line if none is), lined up with it.
 */
function beforeAntigravCoins(track: MeshTrackDef, seed: number, lead = 30): SimState {
  const { coinLines, zones } = track.route;
  const onAntigrav = coinLines.find((line) =>
    zones.some((z) => z.kind === 'antigrav' && line.from >= z.from && line.from <= z.to),
  );
  const line = onAntigrav ?? coinLines[0];
  const t = (line?.from ?? 0) - lead / routeGeometry(track.route).length;
  return courseFreeDrive(track, seed, t - Math.floor(t), STADIUM_SPEED);
}

/** `mk8-stadium-coins` starts at this speed, m/s. */
const STADIUM_SPEED = 20;

const scenarios: Scenario[] = [
  {
    name: 'mk8-test-coins',
    group: 'MK8 Mode',
    description:
      'Coins (MK-109) on the MK8 test ramp, 150cc: 40 m before a line of 5 coins down the middle of the straight (5 more on the far straight, left side). Hold accelerate: each coin you touch sparkles away and adds a little speed; taken coins come back after 10 s.',
    defaultSeed: 1,
    mk8Course: COINS_RAMP.id,
    setup: (seed) => ({
      state: coinsState(seed, [onA(COINS_RAMP.firstLine.from - RUN_UP)]),
    }),
  },
  {
    name: 'mk8-test-coins-10',
    group: 'MK8 Mode',
    description:
      'You already hold the most coins (10) on the MK8 test ramp: a higher top speed. Driving through the coin line ahead still takes the coins (sparkle) but you stay at 10.',
    defaultSeed: 1,
    mk8Course: COINS_RAMP.id,
    setup: (seed) => ({
      state: coinsState(seed, [onA(COINS_RAMP.firstLine.from - RUN_UP)], 10),
    }),
  },
  {
    name: 'mk8-test-coins-hit',
    group: 'MK8 Mode',
    description:
      'Losing coins (MK-109): you hold a green shell, a parked kart with 5 coins 12 m ahead in the test ramp’s tunnel. Use the item: the kart spins out and drops 3 coins round it; drive through them to take them (they vanish after 6 s).',
    defaultSeed: 1,
    mk8Course: COINS_RAMP.id,
    setup: (seed) => {
      const state = coinsState(seed, [onA(40), onA(52)]);
      const [player, target] = state.karts;
      if (player) giveItem(player, 'green');
      if (target) target.coins = 5;
      return { state };
    },
  },
  {
    name: 'mk8-stadium-coins',
    group: 'MK8 Mode',
    description:
      'Coins on Mario Kart Stadium (MK-109; needs the MK8 pack): driving at 20 m/s, 30 m before the coin line on the anti-gravity stretch. Hold accelerate and steer through it: the coins stand on the tilted road and sparkle away as you take them.',
    defaultSeed: 1,
    mk8Course: 'mario-kart-stadium',
    setup: onCourse(MK8_STADIUM_ID, beforeAntigravCoins),
  },
];
export default scenarios;
