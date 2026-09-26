import type { Scenario } from '../../../scenarios/registry';
import { giveItem } from '../../../sim/items';
import type { SimState } from '../../../sim/types';
import { straightRace } from '../hornet-swarm/scenarios';

/** `item-ink`: the AI at the back uses its Ink Cloud this long after the start, s. */
export const INK_AFTER_SECONDS = 1;

/**
 * Three karts in a line on Sunny's main straight: an AI at the back holding an Ink Cloud it uses
 * after `INK_AFTER_SECONDS`, you in the middle and an AI in front (both get inked).
 */
export function inkRace(seed: number): SimState {
  const state = straightRace(seed, [2, 0, 1]);
  const inker = state.karts[2];
  if (inker?.ai) {
    giveItem(inker, 'ink-cloud');
    inker.ai.itemDelay = INK_AFTER_SECONDS;
    inker.ai.itemHeld = 0;
  }
  return state;
}

/** Ink Cloud (MK-68): registered from this folder (`content/items/scenarios.ts`). */
const scenarios: Scenario[] = [
  {
    name: 'item-ink',
    group: 'Items',
    description:
      'Ink Cloud (MK-68): you in the middle of 3 karts on the main straight; the AI behind uses an Ink Cloud after 1 s. You and the AI in front are inked for 4 s: ink splats over about 40% of your screen, fading at the end (a boost clears it faster), and the AI in front weaves.',
    defaultSeed: 1,
    setup: (seed) => ({ state: inkRace(seed) }),
  },
];

export default scenarios;
