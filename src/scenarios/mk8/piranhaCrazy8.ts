// The Piranha Plant, coin item and Crazy 8 (MK-126) on Sunny Circuit's main straight, past the item
// boxes. This module is in the main bundle, so the items' ids and Crazy 8's uses are copied as plain
// values (`src/mk8/content/items/piranhaCrazy8.test.ts` keeps them in step).
import { MK8_ITEM_SET } from '../../mk8/content/items/id';
import { nextEntityId } from '../../sim/items/banana';
import { createSimState, type KartSpawn } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { fromBoxes, spawn, sunny } from './lib/sunny';

export const MK126_ITEMS = { piranha: 'piranha-plant', coin: 'coin', crazy8: 'crazy-8' } as const;
/** Crazy 8's uses: one press to bring the ring out, then one per item left on it. */
export const CRAZY8_USES = 7;

/** A race on Sunny Circuit with MK8's items (the `mk8` set, two slots), kart 0 holding `item`. */
function holding(seed: number, karts: KartSpawn[], item: string, uses: number): SimState {
  const state = createSimState({
    seed,
    trackId: 'sunny-circuit',
    karts,
    itemSet: MK8_ITEM_SET,
    itemSlots: 2,
  });
  // Set directly: MK8's own items register once the race has loaded MK8 Mode, after this setup.
  const player = state.karts[0];
  if (player) {
    player.item.held = item;
    player.item.uses = uses;
  }
  return state;
}

/**
 * The Piranha Plant: the player holding one, 20 m past the item boxes. Ahead of it: a banana 4 m
 * on (1.5 m left), a loose coin 11 m on (1.5 m right) and a kart parked 22 m on, in a line it
 * drives into; the banana's owner is parked far behind.
 */
export function mk8Piranha(seed: number): SimState {
  const state = holding(
    seed,
    [spawn(20, 0), spawn(42, 0.5), spawn(-30, 4)],
    MK126_ITEMS.piranha,
    1,
  );
  state.positions = [1, 0, 2];
  const banana = sunny.pointAt(fromBoxes(24), -1.5);
  state.entities.push({
    id: nextEntityId(state),
    kind: 'banana',
    position: banana,
    from: banana,
    flightTimer: 0,
    ownerId: 2,
    ownerImmune: 0,
  });
  // A coin the kart behind dropped (Sunny Circuit has no coin lines): there for a minute.
  state.coins = [
    { id: 0, position: sunny.pointAt(fromBoxes(31), 1.5), respawnTimer: 0, life: 60, ownerId: 2 },
  ];
  for (const kart of state.karts) kart.coins = 0;
  return state;
}

/** The coin item: the player holding one, with 3 coins. */
export function mk8CoinItem(seed: number): SimState {
  const state = holding(seed, [spawn(20, 0)], MK126_ITEMS.coin, 1);
  const player = state.karts[0];
  if (player) player.coins = 3;
  return state;
}

/**
 * Crazy 8: the player in 2nd holding one, 20 m past the item boxes, the leader parked 30 m ahead
 * (the red shell's target).
 */
export function mk8Crazy8(seed: number): SimState {
  const state = holding(seed, [spawn(20, 0), spawn(50, 0)], MK126_ITEMS.crazy8, CRAZY8_USES);
  state.positions = [1, 0];
  for (const kart of state.karts) kart.coins = 0;
  return state;
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-item-piranha',
    group: 'MK8 Mode',
    description: `Piranha Plant (MK-126): press the item button and the plant comes out in front of the kart for ${tuning.mk8.piranhaTime} s. Drive on: it lunges at the banana ahead (eaten), the loose coin (+1 coin) and the parked kart (spins out), each lunge a small boost; then the slot empties.`,
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8Piranha(seed) }),
  },
  {
    name: 'mk8-item-coin',
    group: 'MK8 Mode',
    description:
      'Coin item (MK-126): the player holds a coin with 3 coins; press the item button: 5 coins (never more than 10), with the pickup sound and sparkle.',
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8CoinItem(seed) }),
  },
  {
    name: 'mk8-item-crazy8',
    group: 'MK8 Mode',
    description:
      'Crazy 8 (MK-126): the player in 2nd holds one. First press: eight items circle the kart; the Star and coin go off at once. Each next press uses the next one: banana, green shell, red shell (at the leader 30 m ahead), mushroom, Bob-omb, Blooper; the HUD shows the next item; the slot empties after the last.',
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8Crazy8(seed) }),
  },
];
export default scenarios;
