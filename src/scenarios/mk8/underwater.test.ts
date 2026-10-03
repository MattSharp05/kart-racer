import { describe, expect, it } from 'vitest';
import { TEST_RAMP_ID, TEST_RAMP_LAYOUT as L } from '../../mk8/content/courses/test-ramp';
import { WATER_RAMP } from './underwater';

describe('underwater scenarios (MK-107)', () => {
  it('use the test ramp’s real layout (copied so the main bundle stays free of MK8 code)', () => {
    expect(WATER_RAMP).toEqual({
      id: TEST_RAMP_ID,
      turnRadius: L.turnRadius,
      water: { from: L.water.from, to: L.water.to, depth: L.water.depth },
    });
  });
});
