import type { Scenario } from '../../../scenarios/registry';
import { giveItem } from '../../../sim/items';
import type { SimState } from '../../../sim/types';
import { straightRace } from '../hornet-swarm/scenarios';

/** The AI ahead holds its item this long before it would use it, s (longer than the pull). */
const HOLD_SECONDS = 30;

/**
 * You at the back of 2 karts on Sunny's main straight holding a Magnet, an AI `GAP` m (15) ahead
 * holding a Mushroom it won't use for a while.
 */
export function magnetRace(seed: number): SimState {
  const state = straightRace(seed, [0, 1]);
  const [you, rival] = state.karts;
  if (you) giveItem(you, 'magnet');
  if (rival?.ai) {
    giveItem(rival, 'mushroom');
    rival.ai.itemDelay = HOLD_SECONDS;
    rival.ai.itemHeld = 0;
  }
  return state;
}

/** Magnet (MK-68): registered from this folder (`content/items/scenarios.ts`). */
const scenarios: Scenario[] = [
  {
    name: 'item-magnet',
    group: 'Items',
    description:
      'Magnet (MK-68): behind an AI 15 m ahead on the main straight, holding a Magnet; the AI holds a Mushroom. Use it: magnet field lines round your kart, you are pulled towards the AI (faster as you close in), and on contact you take its Mushroom and the pull ends. It lasts 4 s at most.',
    defaultSeed: 1,
    setup: (seed) => ({ state: magnetRace(seed) }),
  },
];

export default scenarios;
