// Thwomp Ruins (MK-124): the pack's course with our route and Thwomps. Locally under `pnpm dev`
// with `$MK8_OUT`; on the site behind the MK8 password; "not installed" anywhere else. Plus the
// test ramp's Thwomp (`mk8-test-thwomp`, no pack: CI's Thwomp e2e).
import type { MeshTrackDef } from '../../sim/meshTrack';
import { routeGeometry } from '../../sim/route';
import { createSimState } from '../../sim/state';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import {
  courseAntigrav,
  courseFreeDrive,
  courseFromGrid,
  courseRace,
  onCourse,
} from './lib/courses';

/** Thwomp Ruins' track id (`src/mk8/content/courses/thwomp-ruins`, MK-124). */
export const MK8_RUINS_ID = 'mk8-ruins';
/** …and its pack id, the course `main.ts` loads before these scenarios are set up. */
const RUINS_PACK = 'thwomp-ruins';

/**
 * The test ramp's Thwomp copy (`src/mk8/content/courses/test-ramp/thwomp.ts`), as plain numbers:
 * this module is in the main bundle, which must not pull in MK8 code (`thwompRuins.test.ts` keeps
 * them equal). `main.ts` registers the track before an `mk8-*` scenario is set up.
 */
export const TEST_THWOMP = { id: 'mk8-test-thwomp', x: -20, z: 0 } as const;
/** The test ramp's id: its Thwomp scenario loads the ramp (and so its Thwomp copy). */
const TEST_RAMP_ID = 'mk8-test-ramp';

/** `mk8-ruins-thwomp` starts this far before the first Thwomp, m, rolling at this speed, m/s. */
const THWOMP_LEAD = 35;
const THWOMP_SPEED = 15;

/** Free drive towards the Thwomps: `THWOMP_LEAD` m before the first Thwomp on the lap. */
function intoTheHall(track: MeshTrackDef, seed: number): SimState {
  const geometry = routeGeometry(track.route);
  const first = Math.min(
    ...(track.hazards ?? []).map((h) =>
      h.kind === 'periodic' ? geometry.project(h.centre).s : Infinity,
    ),
  );
  const s = (Number.isFinite(first) ? first : 0) - THWOMP_LEAD;
  const t = s / geometry.length;
  return courseFreeDrive(track, seed, t - Math.floor(t), THWOMP_SPEED);
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-ruins-race',
    group: 'MK8 Mode',
    description:
      'Thwomp Ruins (MK-124, traced on the pack in MK-128): a 3-lap 150cc race from the countdown on the start grid, you + 7 AI with MK8 items, Thwomps slamming on the straight. Needs the MK8 pack (local `pnpm dev` or the site’s password); &quality=low draws the low-texture model.',
    defaultSeed: 1,
    mk8Course: RUINS_PACK,
    setup: onCourse(MK8_RUINS_ID, courseRace),
  },
  {
    name: 'mk8-ruins-free',
    group: 'MK8 Mode',
    description:
      'Thwomp Ruins free drive from pole position: one kart, no race, item boxes out. The lap: up the start straight past the Thwomps, across the courtyard into the temple hall, down through the flooded channel (underwater), the anti-gravity tunnel and spiral, off the glide board and back onto the straight. &editorRoute=1 drives the track editor’s unsaved route.',
    defaultSeed: 1,
    mk8Course: RUINS_PACK,
    setup: onCourse(MK8_RUINS_ID, courseFromGrid),
  },
  {
    name: 'mk8-ruins-thwomp',
    group: 'MK8 Mode',
    description:
      'Thwomp Ruins’ Thwomps: rolling at 15 m/s up the start straight, 35 m before the first of four. They hover, slam down beside the line and rise out of step: keep to the line or time your way past, or get flattened (stopped and squashed for 1.5 s).',
    defaultSeed: 1,
    mk8Course: RUINS_PACK,
    setup: onCourse(MK8_RUINS_ID, intoTheHall),
  },
  {
    name: 'mk8-ruins-wall',
    group: 'MK8 Mode',
    description:
      'Thwomp Ruins’ anti-gravity section: rolling 25 m before the tunnel out of the flooded channel, then the spiral up round the rock to the glide board.',
    defaultSeed: 1,
    mk8Course: RUINS_PACK,
    setup: onCourse(MK8_RUINS_ID, (track, seed) => courseAntigrav(track, seed, 25)),
  },
  {
    name: 'mk8-test-thwomp',
    group: 'MK8 Mode',
    description:
      'A Thwomp on the synthetic MK8 test ramp (MK-124, no pack needed): your kart parked under it. It slams down 1.8 s in: drive out from under it, or stay and be flattened (stopped and squashed for 1.5 s).',
    defaultSeed: 1,
    mk8Course: TEST_RAMP_ID,
    setup: (seed) => ({
      state: createSimState({
        seed,
        trackId: TEST_THWOMP.id,
        engineClass: 150,
        itemsOn: false,
        // Facing along straight E (+X), towards the start line.
        karts: [{ position: { x: TEST_THWOMP.x, y: 0, z: TEST_THWOMP.z }, heading: -Math.PI / 2 }],
      }),
    }),
  },
];
export default scenarios;
