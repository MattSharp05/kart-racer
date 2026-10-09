// Sweet Sweet Canyon (MK-123): the Mushroom Cup's third course. Its geometry and collision come from
// the pack (`models/courses/sweet-sweet-canyon/`, ADR 0009); the route (centreline, AI line, gates,
// grid, item boxes, coins, the glide, the soda lake and the anti-gravity candy) and the material
// map are ours (`route.ts`, `materials.ts`, both in the track editor's format:
// /dev/track-editor.html?course=sweet-sweet-canyon).
//
// The lap: north up the start straight, the banked right-hander into the wafer tunnel's hairpin,
// off the glide board at its mouth across the soda lake to the giant cake (the glide is carried to
// the deck: its zone's `landing`, MK-123), down the spiral round the cake into the soda, along the
// lake floor onto the gravity panel, up the twisting candy ribbons out of the water (anti-gravity;
// the second ribbon crosses the first and drives too), the U through the sugar fields and down the
// step onto the straight. Its collision is built from the course model with this `materials.ts` as
// the course loads (MK-123 round 2, `collisionFromModel`): the deployed pack's `collision.bin` came
// from MK-93's guesses (the soda's surface solid road, the road under it water, the "…Blight" roads
// left out), so the pack works as it is, without a rebuild.
import type { Mk8CourseContent } from '../types';
import look from './look';
import { materials } from './materials';
import { route } from './route';

const canyon: Mk8CourseContent = {
  packId: 'sweet-sweet-canyon',
  trackId: 'mk8-canyon',
  name: 'Sweet Sweet Canyon',
  route,
  // MK8's caustics volume over the soda lake: invisible in the game, a pink box here.
  hiddenMaterials: ['CausticsArea3'],
  collisionFromModel: materials,
  look,
};

export default canyon;
