// Water Park (MK-122): the pack's course with our route. Locally under `pnpm dev` with `$MK8_OUT`;
// on the site behind the MK8 password; "not installed" anywhere else.
import type { MeshTrackDef } from '../../sim/meshTrack';
import { inWater, routeGeometry } from '../../sim/route';
import type { SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { courseFreeDrive, courseFromGrid, courseRace, onCourse } from './lib/courses';

/** Water Park's track id (`src/mk8/content/courses/water-park`, MK-122). */
export const MK8_WATER_PARK_ID = 'mk8-waterpark';
/** …and its pack id, the course `main.ts` loads before these scenarios are set up. */
const WATER_PARK_PACK = 'water-park';

/** `mk8-waterpark-underwater` starts this far into the first water volume, m, at this speed. */
const UNDERWATER_LEAD = 6;
const UNDERWATER_SPEED = 15;

/** Free drive just under the water line, rolling along the chute into the pool. */
function underwater(track: MeshTrackDef, seed: number): SimState {
  const geometry = routeGeometry(track.route);
  const first = geometry.samples.find((s) => inWater(track.route, s.position));
  const t = ((first?.s ?? 0) + UNDERWATER_LEAD) / geometry.length;
  return courseFreeDrive(track, seed, t - Math.floor(t), UNDERWATER_SPEED);
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-waterpark-race',
    group: 'MK8 Mode',
    description:
      'Water Park (MK-122): a 3-lap 150cc race from the countdown, you + 7 AI with MK8 items. Needs the MK8 pack (local `pnpm dev` or the site’s password); &quality=low draws the low-texture model.',
    defaultSeed: 1,
    mk8Course: WATER_PARK_PACK,
    setup: onCourse(MK8_WATER_PARK_ID, courseRace),
  },
  {
    name: 'mk8-waterpark-free',
    group: 'MK8 Mode',
    description:
      'Water Park free drive from pole position: one kart, no race, item boxes out. The lap: up the straight through the plaza, the coaster deck onto the gravity panel, the jump into the pool, the anti-gravity wall ride round the ring, the S along the pool floor and the ramp out over the glide board. &editorRoute=1 drives the track editor’s unsaved route.',
    defaultSeed: 1,
    mk8Course: WATER_PARK_PACK,
    setup: onCourse(MK8_WATER_PARK_ID, courseFromGrid),
  },
  {
    name: 'mk8-waterpark-underwater',
    group: 'MK8 Mode',
    description:
      'Water Park underwater (MK-107 handling): rolling at 15 m/s just under the water line in the chute after the jump into the pool. Floaty, slower driving with the propeller out until the ring’s wall ride lifts you out of the water.',
    defaultSeed: 1,
    mk8Course: WATER_PARK_PACK,
    setup: onCourse(MK8_WATER_PARK_ID, underwater),
  },
];
export default scenarios;
