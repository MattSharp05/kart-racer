import { describe, expect, it } from 'vitest';
import stadium from './content/courses/mario-kart-stadium';
import waterPark from './content/courses/water-park';
import { MK8_COURSE_SCALE } from './content/courses';
import { scaleLook } from './courses';

describe('course looks at the courses’ scale (MK-105 revisit)', () => {
  it('pushes the fog and placed sounds out with the course, and leaves colours and light alone', () => {
    const look = stadium.look!;
    const placed = {
      ...look,
      ambience: [
        ...look.ambience,
        { sound: look.ambience[0]!.sound, volume: 1, at: [1, 2, 3] as const, radius: 10 },
      ],
    };
    const big = scaleLook(placed, MK8_COURSE_SCALE);
    expect(big.fog).toEqual(
      look.fog && { ...look.fog, near: look.fog.near * 3, far: look.fog.far * 3 },
    );
    expect(big.ambience.at(-1)).toMatchObject({ at: [3, 6, 9], radius: 30 });
    expect(big.ambience[0]).toEqual(look.ambience[0]);
    expect({ ...big, fog: undefined, ambience: [] }).toEqual({
      ...placed,
      fog: undefined,
      ambience: [],
    });
    expect(scaleLook(look, 1)).toBe(look);
  });

  it('makes water ripples as big on the course, drifting as fast across it', () => {
    const water = waterPark.look!.water!;
    expect(scaleLook(waterPark.look!, 3).water).toEqual({
      ...water,
      scale: water.scale * 3,
      flow: water.flow * 3,
    });
  });
});
