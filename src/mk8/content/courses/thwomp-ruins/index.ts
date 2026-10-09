// Thwomp Ruins (MK-124): the Mushroom Cup's fourth course. Its geometry and collision come from the
// pack (`models/courses/thwomp-ruins/`, ADR 0009); the route (centreline, AI line, gates, grid,
// item boxes, coins, the anti-gravity wall and the sunken passage's water), the material map
// (`route.ts`, `materials.ts`, the track editor's format: /dev/track-editor.html?course=thwomp-ruins)
// and the Thwomps (`thwomps.ts`) are ours.
//
// The lap (traced on the pack's collision in MK-128): north up the start straight past the
// Thwomps, west across the courtyard into the temple and round its hall, down into the flooded
// channel (underwater), the anti-gravity tunnel and the spiral up round the rock, then off the
// glide board over the gap and back onto the straight. The pack's materials (`materials.ts` is
// still empty) guess the channel's road and walls as water (like Water Park's: `waterIsRoad`),
// the ramps out of the water and off the jump on the straight as wall (`wallIsRoad`), and the
// trick ramps (`di_Jump`) as glide boards (`glideZonesOnly`).
import type { Mk8CourseContent } from '../types';
import { route } from './route';
import { MODEL_THWOMPS, thwomps } from './thwomps';

const ruins: Mk8CourseContent = {
  packId: 'thwomp-ruins',
  trackId: 'mk8-ruins',
  name: 'Thwomp Ruins',
  route,
  // The course model's own (stone) Thwomps: ours (`thwomps.ts`) replace them.
  hiddenMaterials: ['di_DeathDossun'],
  collisionHoles: MODEL_THWOMPS,
  surfaceRules: { waterIsRoad: true, wallIsRoad: true, glideZonesOnly: true },
  hazards: thwomps,
};

export default ruins;
