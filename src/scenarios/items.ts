import { giveItem } from '../sim/items';
import { createSimState } from '../sim/state';
import { sunnyCircuit } from '../content/tracks/sunny-circuit/sim';
import { trackGeometry } from '../sim/track';
import type { Scenario } from './registry';

const sunny = trackGeometry(sunnyCircuit);

/**
 * The item framework's worked example (MK-52): the player on Sunny Circuit's main straight holding
 * the dev-only Test kit (3 uses), with a kart parked 30 m ahead to one side and one 12 m behind.
 */
export function itemFrameworkTest(seed: number) {
  const t = 0.02;
  const at = (metres: number) => t + metres / sunny.length;
  const state = createSimState({
    seed,
    trackId: 'sunny-circuit',
    karts: [
      { position: sunny.pointAt(t, 0), heading: sunny.headingAt(t) },
      { position: sunny.pointAt(at(30), 3), heading: sunny.headingAt(at(30)), kartType: 'boulder' },
      {
        position: sunny.pointAt(at(-12), -2),
        heading: sunny.headingAt(at(-12)),
        kartType: 'pixie',
      },
    ],
  });
  // Kart 1 is ahead in the race (the bolt chases the kart one place ahead).
  state.positions = [1, 0, 2];
  const [kart] = state.karts;
  if (kart) giveItem(kart, 'test-kit');
  return state;
}

export const itemScenarios: Scenario[] = [
  {
    name: 'item-framework-test',
    group: 'Items',
    description:
      'Dev only: the Test kit (MK-52 item framework example, 3 uses). Use 1: a homing bolt; 2: a boomerang that comes back; 3: a shield on you plus an ink puddle behind you.',
    defaultSeed: 1,
    setup: (seed) => ({ state: itemFrameworkTest(seed) }),
  },
];
