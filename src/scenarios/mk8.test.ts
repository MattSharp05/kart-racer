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

describe('MK8 course scenarios (MK-99, MK-105)', () => {
  it('lists exactly the scenarios that drive an MK8 course', async () => {
    const { mk8Scenarios, MK8_COURSE_SCENARIOS } = await import('./mk8');
    const onCourse = mk8Scenarios
      .filter((s) => s.name.startsWith('mk8-stadium-') || s.name.startsWith('mk8-test-'))
      .map((s) => s.name);
    expect([...MK8_COURSE_SCENARIOS].sort()).toEqual(onCourse.sort());
  });
});
