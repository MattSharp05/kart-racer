// Water Park (MK-122): the Mushroom Cup's second course. Its geometry and collision come from the
// pack (`models/courses/water-park/`, ADR 0009); the route (centreline, AI line, gates, grid, item
// boxes, coins, the anti-gravity stretch, the water volumes and the glide board) and the material
// map are ours (`route.ts`, `materials.ts`, both in the track editor's format:
// /dev/track-editor.html?course=water-park).
//
// The lap: north up the start straight through the round plaza, east along the coaster road onto
// the gravity panel, down the anti-gravity chute into the pool, along its floor under the twisted
// ring (scenery) and through the banked twist, the S-bend along the pool floor, up the ramp out of
// the water over the glide board, back onto the start straight.
import type { Mk8CourseContent } from '../types';
import look from './look';
import { route } from './route';

/** Materials the pack has twice, the second as `<name>.001` (MK-122: checked mesh for mesh). */
const DUPLICATES = [
  'Park_Streetlight',
  'park_Coaster_RoadMetal_In',
  'park_CompC_Room',
  'park_Hotel_Iwa00_2',
  'park_Hotel_IwaFace',
  'park_Outsaide_Glass_C',
  'park_Outsaide_Grass',
  'park_Outsaide_Grass_Fog',
  'park_Outsaide_MetalYel3',
  'park_Outsaide_MetalYelB',
  'park_Outsaide_MetalYelC',
  'park_Outside_Block',
  'park_Room_Cha',
  'park_Room_InTesuri',
  'park_Room_WallMetal2',
  'park_Room_WallMetal_C',
  'park_Room_WallMetal_CC',
  'park_Water_Hei02',
  'park_Water_Hei02_naka',
  'park_Water_Hei_Dokan',
  'park_Water_Kanban',
  'park_Water_Road',
  'park_Water_RoadMetal_B_In',
  'park_Water_RoadMetal_C_In',
  'park_Water_RoadMetal_IN',
  'park_Zevra',
];

const waterPark: Mk8CourseContent = {
  packId: 'water-park',
  trackId: 'mk8-waterpark',
  name: 'Water Park',
  route,
  hiddenMaterials: [
    // Lost their textures in the conversion and draw as white sheets: an effect volume over the
    // whole pool, the sea round the island and a static box.
    'CausticsArea1',
    'ef_sea',
    'park_SeitekiBox',
    // Exact copies of other meshes (same geometry and material, `.001` from the conversion):
    // 59k triangles drawn twice for nothing.
    ...DUPLICATES.map((name) => `${name}.001`),
  ],
  // A pack built from MK-93's name guesses calls every `park_Water_*` material water: the
  // underwater road and its walls (`materials.ts` maps them properly for the next build).
  surfaceRules: { waterIsRoad: true },
  look,
};

export default waterPark;
