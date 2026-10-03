import { describe, expect, it } from 'vitest';
import { TEST_RAMP_ID, TEST_RAMP_LAYOUT as L } from '../../mk8/content/courses/test-ramp';
import { SPIN_BOOST_RAMP } from './spinBoost';

describe('spin boost scenarios (MK-108)', () => {
  it('use the test ramp’s real layout (copied so the main bundle stays free of MK8 code)', () => {
    expect(SPIN_BOOST_RAMP).toEqual({
      id: TEST_RAMP_ID,
      roadHalfWidth: L.roadHalfWidth,
      tunnel: { from: L.tunnel.from },
      wallBumper: { x: L.wallBumper.x, height: L.wallBumper.height },
    });
  });
});
