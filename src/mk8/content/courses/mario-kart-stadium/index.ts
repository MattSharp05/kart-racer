// Mario Kart Stadium (MK-105): the Mushroom Cup's first course. Its geometry and collision come from
// the pack (`models/courses/mario-kart-stadium/`, ADR 0009); the route (centreline, AI line, gates,
// grid, item boxes, coins, the anti-gravity zone) and the material map are ours (`route.ts`,
// `materials.ts`, both in the track editor's format: /dev/track-editor.html?course=mario-kart-stadium).
//
// The lap: north up the start straight under the bridge, the colourful hairpin with its dash
// panels, back west over the bridge onto the gravity panel, the banked anti-gravity climb and the
// U on the stadium wall, down off the glide board onto the dirt straight, round the last bend.
import type { Mk8CourseContent } from '../types';
import look from './look';
import { route } from './route';

const stadium: Mk8CourseContent = {
  packId: 'mario-kart-stadium',
  trackId: 'mk8-stadium',
  name: 'Mario Kart Stadium',
  route,
  // The baked shadow layer lost its texture in the conversion: it would draw as grey patches.
  hiddenMaterials: ['fc_StaticShadow'],
  look,
};

export default stadium;
