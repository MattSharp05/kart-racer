// Water Park's look and sound (MK-125): a clear, bright day over the park, a high sun, haze far out
// over the sea, the park's lamps glowing, the pools and fountains as rippling see-through water and
// the park's ambience. Material names from `materials.ts` (checked by `look.test.ts`); tune by eye
// against MK8 with the pack (`?scenario=mk8-waterpark-race`, `&quality=low`).
import type { CourseLook } from '../types';

const look: CourseLook = {
  sun: { direction: [0.3, 1, -0.4], colour: 0xfff6e6, intensity: 2 },
  fill: { sky: 0xd8f0ff, ground: 0x6a9a8a, intensity: 1.2 },
  fog: { colour: 0xd4ecff, near: 280, far: 1000 },
  sky: { top: 0x1f7fe0, middle: 0x7cc3f4, horizon: 0xe2f4ff },
  exposure: 1.1,
  bloom: { strength: 0.35, radius: 0.4, threshold: 0.9 },
  boostBlur: 0.8,
  glow: {
    materials: [
      'Park_Streetlight',
      'park_Room_Light',
      'park_Room_Light_B',
      'park_Room_InTesuri_Light',
    ],
    intensity: 0.8,
  },
  water: {
    materials: [
      'ef_waterB',
      'ef_waterF',
      'park_CompD_Water',
      'park_CompE_Water',
      'park_Outsaide_KanranPool',
      'park_Outsaide_KanranPool5',
    ],
    // A light tint: the pack's water textures carry their own blue.
    colour: 0xc8ecff,
    opacity: 0.7,
    flow: 0.5,
    scale: 3,
    reflection: 0.5,
    sky: 0xcfeaff,
  },
  ambience: [{ sound: 'course/water-park/ambience', volume: 0.5 }],
};

export default look;
