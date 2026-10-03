// Sweet Sweet Canyon's look and sound (MK-123, MK-125's format): a warm, hazy afternoon over the
// sweets, low sun from the west behind the giant cake, pink haze far out, and the soda lake: a
// see-through strawberry soda with slow ripples. Tune by eye against MK8
// (`?scenario=mk8-canyon-race`, `&quality=low`).
import type { CourseLook } from '../types';

const look: CourseLook = {
  sun: { direction: [-0.6, 0.85, -0.25], colour: 0xffe6c8, intensity: 1.9 },
  fill: { sky: 0xffe4f0, ground: 0xb88a6a, intensity: 1.2 },
  fog: { colour: 0xf6d6e4, near: 220, far: 800 },
  sky: { top: 0x4f9ee8, middle: 0xa9d2f4, horizon: 0xfbe2ec },
  exposure: 1.05,
  reflections: 0.3,
  bloom: { strength: 0.3, radius: 0.4, threshold: 0.9 },
  boostBlur: 0.8,
  water: {
    materials: ['ef_juicenear', 'ef_juicefar', 'ef_juiceBnear', 'ef_juiceBfar'],
    colour: 0xf28fb3,
    opacity: 0.7,
    flow: 0.25,
    scale: 6,
  },
  ambience: [{ sound: 'course/sweet-sweet-canyon/ambience', volume: 0.45 }],
};

export default look;
