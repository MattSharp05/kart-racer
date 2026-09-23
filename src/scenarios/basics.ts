import { createSimState } from '../sim/state';
import type { Scenario } from './registry';

export const basicScenarios: Scenario[] = [
  {
    name: 'empty',
    group: 'Basics',
    description: 'One kart at the origin, stationary.',
    defaultSeed: 1,
    setup: (seed) => ({ state: createSimState({ seed }) }),
  },
  {
    name: 'moving',
    group: 'Basics',
    description: 'One kart already rolling forward at 8 m/s (it coasts to a stop).',
    defaultSeed: 1,
    setup: (seed) => ({ state: createSimState({ seed, karts: [{ speed: 8 }] }) }),
  },
];
