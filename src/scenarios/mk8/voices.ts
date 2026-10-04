// Racer voices (MK-110) on the synthetic MK8 test ramp: no pack needed (the fixture pack's voice
// lines are a synthesized sine; without a pack the lines are asked for but silent).
import { createSimState } from '../../sim/state';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { TEST_RAMP } from './testRamp';

/** Heading along the test ramp's straight A (+X). */
const ALONG_A = -Math.PI / 2;
/** The player rolls in from here at this speed: over the dash panel (x 10–14), m and m/s. */
const PLAYER_FROM = { x: -8, speed: 22 };
/** A banana on the player's line in the tunnel, m along A. */
const BANANA_X = 65;
/** Luigi starts this far above the road over the gap (x 100–120): he falls into the void, m. */
const DROP = { x: 104, height: 4 };

const mk8Loadout = (racer: string) => ({
  racer,
  body: 'standard-kart',
  tires: 'standard-tires',
  glider: 'paper-glider',
});

/**
 * The player (Mario) rolling over the dash panel (a boost line), into a banana (a hit line), while
 * Luigi drops off the end of the glide ramp into the void close by (a fall line): three voice lines
 * in the first few seconds, no input needed.
 */
export function mk8VoicesScene(seed: number): SimState {
  const state = createSimState({
    seed,
    trackId: TEST_RAMP.id,
    engineClass: 150,
    itemsOn: false,
    karts: [
      {
        position: { x: PLAYER_FROM.x, y: 0, z: 0 },
        heading: ALONG_A,
        speed: PLAYER_FROM.speed,
        kartType: 'maple',
        loadout: mk8Loadout('mk8-mario'),
      },
      {
        controller: 'ai',
        position: { x: DROP.x, y: DROP.height, z: 0 },
        heading: ALONG_A,
        kartType: 'maple',
        loadout: mk8Loadout('mk8-luigi'),
      },
    ],
  });
  const banana = { x: BANANA_X, y: 0, z: 0 };
  state.entities.push({
    id: 1000,
    kind: 'banana',
    position: banana,
    from: banana,
    flightTimer: 0,
    ownerId: -1,
    ownerImmune: 0,
  });
  return state;
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-voices',
    group: 'MK8 Mode',
    description:
      'Racer voices (MK-110) on the MK8 test ramp, no input needed: Mario (you) rolls over the dash panel (boost line) into a banana (hit line) while Luigi drops into the void past the glide ramp ahead (fall line). With the pack, each racer says their MK8 line; voices of other karts fade out over 60 m.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: (seed) => ({ state: mk8VoicesScene(seed) }),
  },
];
export default scenarios;
