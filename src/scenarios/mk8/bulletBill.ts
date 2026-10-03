// Bullet Bill (MK-120) on the synthetic MK8 test ramp (no pack needed): a race with the player last
// holding one, and the same race mid-ride.
import { MK8_ITEM_SET } from '../../mk8/content/items/id';
import { createSimState, type KartSpawn } from '../../sim/state';
import { TICK_RATE, tuning } from '../../sim/tuning';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { onCourse } from './lib/courses';
import { TEST_RAMP } from './testRamp';

/**
 * Bullet Bill's item (and effect) id and its effect's data layout (metres round the lap, metres
 * right of the centreline), copied as plain values: this module is in the main bundle, which must
 * not pull in MK8 code (`src/mk8/content/items/bullet-bill/sim.test.ts` keeps them in step).
 */
export const BULLET_ITEM = 'bullet-bill';

/** Heading along +X (the test ramp's straights A and E). */
const EAST = -Math.PI / 2;
/** A kart parked on straight A/E at `x`, `lateral` m right of the centreline (+Z there). */
const parked = (x: number, lateral = 0): KartSpawn => ({
  position: { x, y: 0, z: lateral },
  heading: EAST,
});

/**
 * An 8-kart race on the test ramp (150cc, MK8 items), the player last at x = −30 on straight E
 * holding a Bullet Bill. Four karts are parked in its path on the centreline (x −10 and 10, 50 in
 * the tunnel, 130 past the gap), one beside it out of its reach (x 20, 6 m left) and two far ahead
 * round turn B. `trackId`: another course built on the test ramp (unit tests).
 */
export function mk8Bullet(seed: number, trackId: string = TEST_RAMP.id): SimState {
  const state = createSimState({
    seed,
    trackId,
    engineClass: 150,
    phase: 'racing',
    itemSet: MK8_ITEM_SET,
    itemSlots: 2,
    karts: [
      parked(-30, 3),
      parked(-10),
      parked(10),
      parked(50),
      parked(130),
      parked(20, -6),
      { position: { x: 160, y: 0, z: 80 }, heading: Math.PI / 2 },
      { position: { x: 120, y: 0, z: 80 }, heading: Math.PI / 2 },
    ],
  });
  const player = state.karts[0];
  if (player) {
    player.item.held = BULLET_ITEM;
    player.item.uses = 1;
  }
  return state;
}

/**
 * The same race a second into the ride: the player is the bullet at x = 18 on straight A, on the AI
 * line, with the kart at x = 10 just spun out behind it and the rest ahead.
 */
export function mk8BulletRide(seed: number): SimState {
  const state = mk8Bullet(seed);
  const player = state.karts[0];
  if (!player) return state;
  const x = 18;
  player.item.held = null;
  player.item.uses = 0;
  player.position = { x, y: 0, z: 0 };
  player.speed = tuning.topSpeed[state.engineClass] * tuning.mk8.bulletSpeed;
  player.effects.push({
    kind: BULLET_ITEM,
    ticksLeft: Math.round((tuning.mk8.bulletTime - 1) * TICK_RATE),
    by: -1,
    data: [x, 0],
  });
  for (const id of [1, 2]) {
    const kart = state.karts[id];
    if (kart) kart.spinTimer = tuning.spinSeconds;
  }
  return state;
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-item-bullet',
    group: 'MK8 Mode',
    description: `Bullet Bill (MK-120) on the MK8 test ramp (no pack needed): you're last, holding one. Press the item button: for ${tuning.mk8.bulletTime} s your kart is a bullet riding the route by itself (steering and items do nothing), through the tunnel, over the gap, spinning out the four karts parked on its line and missing the one 6 m to the side. Then you drive on with a small boost, on the road past the gap.`,
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onCourse(TEST_RAMP.id, (_track, seed) => mk8Bullet(seed)),
  },
  {
    name: 'mk8-item-bullet-ride',
    group: 'MK8 Mode',
    description:
      'Bullet Bill (MK-120) mid-ride on the MK8 test ramp: your kart is drawn as the bullet, a second in, two spun-out karts behind it and the rest ahead on its line (use &paused=1 to look first).',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onCourse(TEST_RAMP.id, (_track, seed) => mk8BulletRide(seed)),
  },
];
export default scenarios;
