// Kart, drift and terrain sounds (MK-111) on the synthetic MK8 test ramp: no pack needed (the
// fixture pack's kart sounds are a synthesized sine; without a pack our synth plays).
import { createSimState } from '../../sim/state';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { TEST_RAMP } from './testRamp';

/** Mario in the Standard Kart, MK8's default build. */
const LOADOUT = {
  racer: 'mk8-mario',
  body: 'standard-kart',
  tires: 'standard-tires',
  glider: 'paper-glider',
};

/** One kart at rest on the test ramp's start line, facing along straight A (+X); free drive. */
export function mk8TestFree(seed: number): SimState {
  return createSimState({
    seed,
    trackId: TEST_RAMP.id,
    engineClass: 150,
    itemsOn: false,
    karts: [{ position: { x: 0, y: 0, z: 0 }, heading: -Math.PI / 2, loadout: LOADOUT }],
  });
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-test-free',
    group: 'MK8 Mode',
    description:
      'Free drive on the MK8 test ramp with sound on (MK-111): Mario in the Standard Kart at rest on the start line. Rev the engine, drift for the sparks, cross the dash panel, the anti-gravity wall (metal), the glide ramp and the water basin (splash) and the verges (grass); with the pack the sounds are MK8’s, else our synth’s.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: (seed) => ({ state: mk8TestFree(seed) }),
  },
];
export default scenarios;
