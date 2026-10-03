// Our five unique items MK8-style (MK-115), close up on Sunny Circuit's main straight.
import { MK8_ITEM_SET } from '../../mk8/content/items/id';
import { createSimState } from '../../sim/state';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { holdOurs, OUR_ITEMS, useNow } from './lib/ourItems';
import { spawn } from './lib/sunny';

/**
 * Short of the item boxes: a row of five karts 10 m ahead of the player holding the Oil Slick,
 * Hornet Swarm, Bubble Shield, Magnet and Phase (the last three in use), an Oil Slick dropped by
 * the first and a Hornet Swarm setting off from the second.
 */
export function mk8OursLineup(seed: number): SimState {
  const row = -42;
  const state = createSimState({
    seed,
    trackId: 'sunny-circuit',
    karts: [spawn(row - 10, 0), ...OUR_ITEMS.map((_, i) => spawn(row, (i - 2) * 3.2))],
    itemSet: MK8_ITEM_SET,
    itemSlots: 2,
  });
  state.positions = state.karts.map((_, i) => state.karts.length - 1 - i);
  useNow(state, 1, 'oil-slick');
  useNow(state, 2, 'hornet-swarm');
  holdOurs(state, 1);
  return state;
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-items-ours',
    group: 'MK8 Mode',
    description:
      'Our five unique items MK8-style (MK-115), close up: five karts 10 m ahead holding an Oil Slick, Hornet Swarm, Bubble Shield, Magnet and Phase over their drivers (the last three in use: a starry bubble, glowing field loops under a red horseshoe, a violet haze); an Oil Slick puddle and three hornets. Drawn MK8-style with the MK8 pack (our original looks without one).',
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8OursLineup(seed) }),
  },
];
export default scenarios;
