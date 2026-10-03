// Sweet Sweet Canyon's look and sound (MK-125): a warm, sugary late afternoon, the sun low and
// golden, pink-peach haze over the canyon, the soda lake as fizzy see-through pink water and the
// canyon's ambience (the soda's fizz). Material names from `materials.ts` (checked by
// `look.test.ts`); tune by eye against MK8 with the pack (`?scenario=mk8-canyon-race`, `&quality=low`).
import type { CourseLook } from '../types';

const look: CourseLook = {
  sun: { direction: [-0.6, 0.7, 0.4], colour: 0xffe2bf, intensity: 1.9 },
  fill: { sky: 0xffe6f0, ground: 0xc8906a, intensity: 1.2 },
  fog: { colour: 0xffd9e2, near: 240, far: 900 },
  sky: { top: 0x6aa8ec, middle: 0xbfd8f6, horizon: 0xffe0e8 },
  exposure: 1.1,
  bloom: { strength: 0.4, radius: 0.45, threshold: 0.88 },
  boostBlur: 0.8,
  water: {
    materials: ['ef_juicenear', 'ef_juicefar', 'ef_juiceBnear', 'ef_juiceBfar'],
    // The soda's own texture carries its colour: a light pink tint.
    colour: 0xffd6e4,
    opacity: 0.75,
    flow: 0.35,
    scale: 2.5,
    reflection: 0.45,
    sky: 0xffe6ee,
  },
  ambience: [{ sound: 'course/sweet-sweet-canyon/ambience', volume: 0.5 }],
};

export default look;
