// Sweet Sweet Canyon (MK-123): the pack's course with our route. Locally under `pnpm dev` with
// `$MK8_OUT`; on the site behind the MK8 password; "not installed" anywhere else.
import type { MeshTrackDef } from '../../sim/meshTrack';
import { routeGeometry } from '../../sim/route';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import {
  courseAntigrav,
  courseFreeDrive,
  courseFromGrid,
  courseRace,
  onCourse,
} from './lib/courses';

/** Sweet Sweet Canyon's track id (`src/mk8/content/courses/sweet-sweet-canyon`, MK-123). */
export const MK8_CANYON_ID = 'mk8-canyon';
/** …and its pack id, the course `main.ts` loads before these scenarios are set up. */
const CANYON_PACK = 'sweet-sweet-canyon';

/** The glide scenario starts this far before the glide zone, rolling at `GLIDE_SPEED`, m and m/s. */
const GLIDE_LEAD = 30;
const GLIDE_SPEED = 20;
/** The soda scenario starts this far before the anti-gravity zone (the gravity panel), m. */
const SODA_LEAD = 45;

/** Free drive into the tunnel's mouth: `GLIDE_LEAD` m before the glide ramp, at speed. */
function courseGlide(track: MeshTrackDef, seed: number): SimState {
  const zone = track.route.zones.find((z) => z.kind === 'glide');
  const t =
    (zone?.kind === 'glide' ? zone.from : 0) - GLIDE_LEAD / routeGeometry(track.route).length;
  return courseFreeDrive(track, seed, t - Math.floor(t), GLIDE_SPEED);
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-canyon-race',
    group: 'MK8 Mode',
    description:
      'Sweet Sweet Canyon (MK-123): a 3-lap 150cc race from the countdown, you + 7 AI with MK8 items. Needs the MK8 pack (local `pnpm dev` or the site’s password); &quality=low draws the low-texture model.',
    defaultSeed: 1,
    mk8Course: CANYON_PACK,
    setup: onCourse(MK8_CANYON_ID, courseRace),
  },
  {
    name: 'mk8-canyon-free',
    group: 'MK8 Mode',
    description:
      'Sweet Sweet Canyon free drive from pole position: one kart, no race, item boxes out. &editorRoute=1 drives the track editor’s unsaved route (its Test drive button).',
    defaultSeed: 1,
    mk8Course: CANYON_PACK,
    setup: onCourse(MK8_CANYON_ID, courseFromGrid),
  },
  {
    name: 'mk8-canyon-glide',
    group: 'MK8 Mode',
    description:
      'Sweet Sweet Canyon’s glide: rolling at 20 m/s through the wafer tunnel’s mouth onto the glide board, then the long glide over the soda lake up to the giant cake’s deck.',
    defaultSeed: 1,
    mk8Course: CANYON_PACK,
    setup: onCourse(MK8_CANYON_ID, courseGlide),
  },
  {
    name: 'mk8-canyon-soda',
    group: 'MK8 Mode',
    description:
      'Sweet Sweet Canyon’s soda lake: rolling down the spiral round the giant cake into the soda (underwater), onto the gravity panel and up the twisting anti-gravity candy ribbons.',
    defaultSeed: 1,
    mk8Course: CANYON_PACK,
    setup: onCourse(MK8_CANYON_ID, (track, seed) => courseAntigrav(track, seed, SODA_LEAD)),
  },
];
export default scenarios;
