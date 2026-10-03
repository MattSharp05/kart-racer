// Mario Kart Stadium's look and sound (MK-125): a bright, clear afternoon over the stadium, warm sun
// from the south-west, light haze far out, the stadium lights and screens glowing, and the crowd.
// No water on this course. Tune by eye against MK8 (`?scenario=mk8-stadium-race`, `&quality=low`).
import type { CourseLook } from '../types';

const look: CourseLook = {
  sun: { direction: [-0.45, 1, 0.35], colour: 0xfff1dc, intensity: 2 },
  fill: { sky: 0xdcefff, ground: 0x7a9a5a, intensity: 1.15 },
  fog: { colour: 0xd6ecff, near: 260, far: 950 },
  sky: { top: 0x2a84e0, middle: 0x86c4f2, horizon: 0xe4f3ff },
  exposure: 1.1,
  reflections: 0.35,
  bloom: { strength: 0.35, radius: 0.4, threshold: 0.9 },
  boostBlur: 0.8,
  glow: {
    materials: [
      'fc_StadiumLight',
      'fc_ScrollingLight',
      'fc_Enkei_RedLight',
      'fc_signboard_Emm',
      'fc_TV_MKTV',
      'fc_TV_capture',
    ],
    intensity: 0.8,
  },
  ambience: [{ sound: 'course/mario-kart-stadium/ambience', volume: 0.5 }],
};

export default look;
