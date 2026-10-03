import { describe, expect, it } from 'vitest';
import { TEST_RAMP_ID, TEST_RAMP_LAYOUT } from '../mk8/content/courses/test-ramp';
import { TEST_RAMP } from './mk8';

describe('MK8 driving scenarios (MK-99)', () => {
  it('use the test ramp’s real layout (copied so the main bundle stays free of MK8 code)', () => {
    expect(TEST_RAMP).toEqual({
      id: TEST_RAMP_ID,
      roadHalfWidth: TEST_RAMP_LAYOUT.roadHalfWidth,
      tunnel: { from: TEST_RAMP_LAYOUT.tunnel.from, height: TEST_RAMP_LAYOUT.tunnel.height },
    });
  });
});
