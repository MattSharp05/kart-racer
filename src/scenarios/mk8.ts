import { LAYOUT as TEST_RAMP_LAYOUT, TEST_RAMP_ID } from '../mk8/content/courses/test-ramp/layout';
import { tracks } from '../content/tracks';
import { headingOf } from '../sim/math';
import { routeGeometry } from '../sim/route';
import { createSimState } from '../sim/state';
import type { SimState } from '../sim/types';
import { attractMode } from './menus';
import type { Scenario, ScenarioSetup } from './registry';

/** The anti-gravity checkpoint on the real course (MK-99): local pack only. */
export const MK8_STADIUM_SCENARIO = 'mk8-stadium-antigrav';
/** Mario Kart Stadium's collision as a dev course (`src/mk8/scenarioCourses.ts` registers it). */
export const MK8_STADIUM_DEV_ID = 'mk8-dev-stadium';

const { tunnel, roadHalfWidth } = TEST_RAMP_LAYOUT;

/** One kart (150cc, free drive) on the test ramp. `main.ts` registers the course first. */
function onTestRamp(
  seed: number,
  at: { x: number; y: number; z: number },
  heading: number,
  upsideDown = false,
): SimState {
  return createSimState({
    seed,
    trackId: TEST_RAMP_ID,
    engineClass: 150,
    itemsOn: false,
    karts: [{ position: at, heading, ...(upsideDown ? { up: { x: 0, y: -1, z: 0 } } : {}) }],
  });
}

/** One kart on Stadium's dev course at its start, or "pack not installed" when it isn't loaded. */
function onStadium(seed: number): ScenarioSetup {
  if (!tracks.has(MK8_STADIUM_DEV_ID))
    return { state: attractMode(seed), screen: 'mk8NotInstalled' };
  const def = tracks.get(MK8_STADIUM_DEV_ID).def;
  if (def.kind !== 'mesh') throw new Error(`${MK8_STADIUM_DEV_ID} isn't a mesh track`);
  const frame = routeGeometry(def.route).frameAt(0);
  return {
    state: createSimState({
      seed,
      trackId: MK8_STADIUM_DEV_ID,
      engineClass: 150,
      itemsOn: false,
      karts: [{ position: frame.position, heading: headingOf(frame.tangent, 0), up: frame.up }],
    }),
  };
}

/**
 * MK8 Mode (MK-97). The pack is local only (ADR 0009): `mk8-mode` loads it under `pnpm dev` with a
 * built pack, and shows "MK8 pack not installed" anywhere else (previews, production, CI).
 */
export const mk8Scenarios: Scenario[] = [
  {
    name: 'mk8-entry',
    group: 'MK8 Mode',
    description: 'The title with the MK8 Mode button (NEW badge) selected: Enter opens MK8 Mode.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8Entry' }),
  },
  {
    name: 'mk8-loading',
    group: 'MK8 Mode',
    description: "MK8 Mode's loading screen held at 50 % (nothing is fetched).",
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8Loading' }),
  },
  {
    name: 'mk8-not-installed',
    group: 'MK8 Mode',
    description:
      'The "MK8 pack not installed" screen with the commands to build the pack, and Back.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8NotInstalled' }),
  },
  {
    name: 'mk8-mode',
    group: 'MK8 Mode',
    description:
      'MK8 Mode as the title button opens it: loads the pack (progress bar), then the placeholder screen; "not installed" without a local pack.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8' }),
  },
  // Anti-gravity (MK-99) on the synthetic test ramp: no pack needed.
  {
    name: 'mk8-test-antigrav',
    group: 'MK8 Mode',
    description:
      'Anti-gravity on the MK8 test ramp, 150cc: the kart at the foot of the tunnel’s 90° anti-gravity wall (on your right, cyan). Drive up it, onto the ceiling and back down. Any kart with &kart=.',
    defaultSeed: 1,
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
    setup: (seed) => ({
      state: onTestRamp(seed, { x: tunnel.from + 10, y: tunnel.height, z: 0 }, -Math.PI / 2, true),
    }),
  },
  {
    name: MK8_STADIUM_SCENARIO,
    group: 'MK8 Mode',
    description:
      'Mario Kart Stadium’s real collision mesh (local pack, `pnpm dev` only; "not installed" elsewhere). &at=x,y,z&yaw=deg picks the start; &antigrav=road makes all road anti-gravity (automatic while no material is mapped to it).',
    defaultSeed: 1,
    setup: onStadium,
  },
];
