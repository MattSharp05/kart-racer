// MK8 course look and ambience (MK-125) on the look ramp, the synthetic test ramp with a course look
// (no pack needed; `registerLookRamp` in `src/mk8/courses.ts`): the start line, the water basin and
// a boost. Add `&quality=low` to see the low-quality look (no post-processing). Mario Kart
// Stadium's own look is on `mk8-stadium-race` (needs the pack).
import { createSimState } from '../../sim/state';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { courseRace, onCourse } from './lib/courses';

/** The look ramp's track id (`LOOK_RAMP_ID`: this module is in the main bundle, no MK8 code). */
export const LOOK_RAMP_ID = 'mk8-look-ramp';

/** Straight C runs back along −X at this z; its water basin's far end, m (test ramp layout). */
const STRAIGHT_C_Z = 80;
const WATER_END_X = 100;
/** The water scenario starts this far before the basin, rolling at `WATER_SPEED`. */
const WATER_LEAD = 12;
const WATER_SPEED = 8;
/** The boost scenario: rolling down the start straight, a mushroom's worth of boost left. */
const BOOST_X = -30;
const BOOST_SPEED = 22;
const BOOST_SECONDS = 1.5;
/** Headings along the straights (heading 0 faces −Z). */
const ALONG_PLUS_X = -Math.PI / 2;
const ALONG_MINUS_X = Math.PI / 2;

/** One kart (150cc, free drive) on the test ramp at `x`, `z`, rolling at `speed`. */
function rolling(seed: number, x: number, z: number, heading: number, speed: number): SimState {
  return createSimState({
    seed,
    trackId: LOOK_RAMP_ID,
    engineClass: 150,
    itemsOn: false,
    karts: [{ position: { x, y: 0, z }, heading, speed }],
  });
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-test-look-start',
    group: 'MK8 Mode',
    description:
      'MK8 course look (MK-125) on the test ramp’s start line, no pack needed: the course sky, sun and haze, bloom and ACES tone mapping; the crowd loop starts with the race and stops on pause. &quality=low: same light and sky, no post-processing.',
    defaultSeed: 1,
    mk8Course: LOOK_RAMP_ID,
    setup: onCourse(LOOK_RAMP_ID, courseRace),
  },
  {
    name: 'mk8-test-look-water',
    group: 'MK8 Mode',
    description:
      'MK8 water shading (MK-125) on the test ramp: rolling slowly into the water basin. The water is see-through and its ripples drift; at full quality it reflects the sky.',
    defaultSeed: 1,
    mk8Course: LOOK_RAMP_ID,
    setup: onCourse(LOOK_RAMP_ID, (_, seed) =>
      rolling(seed, WATER_END_X + WATER_LEAD, STRAIGHT_C_Z, ALONG_MINUS_X, WATER_SPEED),
    ),
  },
  {
    name: 'mk8-test-look-boost',
    group: 'MK8 Mode',
    description:
      'Boost motion blur (MK-125) on the test ramp: rolling down the start straight with 1.5 s of boost. At full quality the screen edges blur outwards (under the usual speed lines); no blur at &quality=low or with reduced motion.',
    defaultSeed: 1,
    mk8Course: LOOK_RAMP_ID,
    setup: onCourse(LOOK_RAMP_ID, (_, seed) => {
      const state = rolling(seed, BOOST_X, 0, ALONG_PLUS_X, BOOST_SPEED);
      const [kart] = state.karts;
      if (kart) kart.boostTimer = BOOST_SECONDS;
      return state;
    }),
  },
];
export default scenarios;
