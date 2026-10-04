// Thwomp Ruins (MK-124): the Mushroom Cup's fourth course. Its geometry and collision come from the
// pack (`models/courses/thwomp-ruins/`, ADR 0009); the route (centreline, AI line, gates, grid,
// item boxes, coins, the anti-gravity wall and the sunken passage's water), the material map
// (`route.ts`, `materials.ts`, the track editor's format: /dev/track-editor.html?course=thwomp-ruins)
// and the Thwomps (`thwomps.ts`) are ours.
//
// The lap: north up the start straight, right into the Thwomp hall (four Thwomps slamming out of
// step), right up the curved anti-gravity wall, down into the sunken passage (underwater) and
// right back onto the straight. MK-124 was built without the pack, so the route is a draft until
// it's traced on the real mesh (README.md).
import type { Mk8CourseContent } from '../types';
import { route } from './route';
import { thwomps } from './thwomps';

const ruins: Mk8CourseContent = {
  packId: 'thwomp-ruins',
  trackId: 'mk8-ruins',
  name: 'Thwomp Ruins',
  route,
  hazards: thwomps,
};

export default ruins;
