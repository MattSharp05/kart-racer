// Mario Kart Stadium (MK-105): the pack's course with our route. Locally under `pnpm dev` with
// `$MK8_OUT`; on the site behind the MK8 password; "not installed" anywhere else.
import type { Scenario } from '../registry';
import {
  courseAntigrav,
  courseFinalLap,
  courseFromGrid,
  courseRace,
  onCourse,
} from './lib/courses';

/** Mario Kart Stadium's track id (`src/mk8/content/courses/mario-kart-stadium`, MK-105). */
export const MK8_STADIUM_ID = 'mk8-stadium';
/** …and its pack id, the course `main.ts` loads before these scenarios are set up. */
const STADIUM_PACK = 'mario-kart-stadium';

const scenarios: Scenario[] = [
  {
    name: 'mk8-stadium-race',
    group: 'MK8 Mode',
    description:
      'Mario Kart Stadium (MK-105): a 3-lap 150cc race from the countdown, you + 7 AI with MK8 items. Needs the MK8 pack (local `pnpm dev` or the site’s password); &quality=low draws the low-texture model.',
    defaultSeed: 1,
    mk8Course: STADIUM_PACK,
    setup: onCourse(MK8_STADIUM_ID, courseRace),
  },
  {
    name: 'mk8-stadium-free',
    group: 'MK8 Mode',
    description:
      'Mario Kart Stadium free drive from pole position: one kart, no race, item boxes out. &editorRoute=1 drives the track editor’s unsaved route (its Test drive button).',
    defaultSeed: 1,
    mk8Course: STADIUM_PACK,
    setup: onCourse(MK8_STADIUM_ID, courseFromGrid),
  },
  {
    name: 'mk8-stadium-antigrav',
    group: 'MK8 Mode',
    description:
      'Mario Kart Stadium’s anti-gravity section: rolling at 20 m/s 25 m before the gravity panel on the bridge, then the banked climb, the U on the stadium wall and the glide board down to the dirt.',
    defaultSeed: 1,
    mk8Course: STADIUM_PACK,
    setup: onCourse(MK8_STADIUM_ID, (track, seed) => courseAntigrav(track, seed)),
  },
  {
    name: 'mk8-stadium-final-lap',
    group: 'MK8 Mode',
    description:
      'Mario Kart Stadium, final lap: the field rolling just past the line on lap 3/3 (laps of 25.4 s and 24.8 s behind), you mid-pack. Cross the line once more to finish.',
    defaultSeed: 1,
    mk8Course: STADIUM_PACK,
    setup: onCourse(MK8_STADIUM_ID, courseFinalLap),
  },
];
export default scenarios;
