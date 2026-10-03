// The look ramp's look (MK-125): the synthetic test ramp under its own id (`mk8-look-ramp`,
// `registerLookRamp` in `src/mk8/courses.ts`), the course every MK8 look check runs on in CI (no
// pack there). A clear sky, its water basin as rippling water (the collision view's
// see-through material, `render/meshTrackView.ts`) and, standing in for a course's own loops, the
// Stadium crowd (silent without the pack: the ambience is checked on the player's calls).
import type { CourseLook } from '../types';

const look: CourseLook = {
  sun: { direction: [0.4, 1, 0.6], colour: 0xffffff, intensity: 1.8 },
  fill: { sky: 0xeaf4ff, ground: 0x5a7a4a, intensity: 1.1 },
  fog: { colour: 0xd8ecff, near: 150, far: 600 },
  sky: { top: 0x3d8fe0, middle: 0x9fd2f5, horizon: 0xeaf6ff },
  exposure: 1.1,
  bloom: { strength: 0.3, radius: 0.4, threshold: 0.9 },
  boostBlur: 0.8,
  water: {
    materials: ['mesh-water'],
    colour: 0x3a8ee0,
    opacity: 0.6,
    flow: 0.6,
    scale: 4,
    reflection: 0.6,
    sky: 0xcfe9ff,
  },
  ambience: [{ sound: 'course/mario-kart-stadium/ambience', volume: 0.5 }],
};

export default look;
