// Anti-gravity (MK-99), mesh-track racing (MK-105) and gliding (MK-106) on the synthetic MK8 test ramp: no pack needed.
import { createSimState } from '../../sim/state';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { courseRace, onCourse } from './lib/courses';

/**
 * The MK8 test ramp (`src/mk8/content/courses/test-ramp/layout.ts`), copied as plain numbers: this
 * module is in the main bundle, which must not pull in MK8 code (`mk8.test.ts` keeps them equal).
 * `main.ts` registers the course before an `mk8-*` scenario is set up.
 */
export const TEST_RAMP = {
  id: 'mk8-test-ramp',
  roadHalfWidth: 7,
  tunnel: { from: 30, height: 8 },
  glide: { from: 90 },
} as const;
const { tunnel, roadHalfWidth, glide } = TEST_RAMP;
/** `mk8-test-glide` starts this far before the glide ramp: enough run-up for top speed, m. */
const GLIDE_RUN_UP = 60;

/** One kart (150cc, free drive) on the test ramp. */
function onTestRamp(
  seed: number,
  at: { x: number; y: number; z: number },
  heading: number,
  upsideDown = false,
): SimState {
  return createSimState({
    seed,
    trackId: TEST_RAMP.id,
    engineClass: 150,
    itemsOn: false,
    karts: [{ position: at, heading, ...(upsideDown ? { up: { x: 0, y: -1, z: 0 } } : {}) }],
  });
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-test-antigrav',
    group: 'MK8 Mode',
    description:
      'Anti-gravity on the MK8 test ramp, 150cc: the kart at the foot of the tunnel’s 90° anti-gravity wall (on your right, cyan). Drive up it, onto the ceiling and back down. Any kart with &kart=.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    // On the tunnel floor 4 m in, 4 m from the wall, angled 45° towards it.
    setup: (seed) => ({
      state: onTestRamp(
        seed,
        { x: tunnel.from + 4, y: 0, z: roadHalfWidth - 4 },
        (-3 * Math.PI) / 4,
      ),
    }),
  },
  {
    name: 'mk8-test-ceiling',
    group: 'MK8 Mode',
    description:
      'Upside down on the test ramp tunnel’s anti-gravity ceiling, facing along the tunnel (use &paused=1 to look first). Drive along it and down the wall.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: (seed) => ({
      state: onTestRamp(seed, { x: tunnel.from + 10, y: tunnel.height, z: 0 }, -Math.PI / 2, true),
    }),
  },
  {
    name: 'mk8-test-race',
    group: 'MK8 Mode',
    description:
      'A 3-lap 150cc race on the synthetic MK8 test ramp (MK-105, no pack needed): you + 7 AI, MK8 items, from the countdown. Mesh-track racing without Nintendo assets (CI drives it).',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onCourse(TEST_RAMP.id, courseRace),
  },
  // Gliders (MK-106) on the test ramp: no pack needed.
  {
    name: 'mk8-test-glide',
    group: 'MK8 Mode',
    description:
      'Gliding on the MK8 test ramp, 150cc: the kart 60 m before the glide ramp (purple), the gap and its void beyond it. Hold accelerate: off the ramp the glider opens; steer in the air, hold accelerate to dive (sooner, faster) or brake to float (longer). Tap drift off the lip for a trick boost.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: (seed) => ({
      state: onTestRamp(seed, { x: glide.from - GLIDE_RUN_UP, y: 0, z: 0 }, -Math.PI / 2),
    }),
  },
];
export default scenarios;
