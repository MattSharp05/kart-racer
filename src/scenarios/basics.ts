import { createSimState } from '../sim/state';
import type { Scenario } from './registry';

export const basicScenarios: Scenario[] = [
  {
    name: 'empty',
    group: 'Basics',
    description: 'One placeholder kart at the origin, stationary.',
    defaultSeed: 1,
    setup: (seed) => ({ state: createSimState({ seed }) }),
  },
  {
    name: 'moving',
    group: 'Basics',
    description: 'One placeholder kart already moving forward.',
    defaultSeed: 1,
    setup: (seed) => ({ state: createSimState({ seed, karts: [{ speed: 8 }] }) }),
  },
];
