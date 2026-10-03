import { describe, expect, it } from 'vitest';
import { TEST_RAMP_ID, TEST_RAMP_LAYOUT } from '../mk8/content/courses/test-ramp';
import { TEST_RAMP } from './mk8';

describe('MK8 driving scenarios (MK-99)', () => {
  it('use the test ramp’s real layout (copied so the main bundle stays free of MK8 code)', () => {
    expect(TEST_RAMP).toEqual({
      id: TEST_RAMP_ID,
      roadHalfWidth: TEST_RAMP_LAYOUT.roadHalfWidth,
      tunnel: { from: TEST_RAMP_LAYOUT.tunnel.from, height: TEST_RAMP_LAYOUT.tunnel.height },
      glide: { from: TEST_RAMP_LAYOUT.glide.from },
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

describe('mk8-test-glide (MK-106)', () => {
  it('holding accelerate from the start, the kart glides over the gap and lands beyond it', async () => {
    const { registerTestRamp } = await import('../mk8/content/courses/test-ramp/register');
    const { step } = await import('../sim/step');
    const { NEUTRAL_INPUT } = await import('../sim/types');
    const { mk8Scenarios } = await import('./mk8');
    registerTestRamp();
    const scenario = mk8Scenarios.find((s) => s.name === 'mk8-test-glide');
    let state = scenario!.setup(1).state;
    let glided = false;
    let landedAt = -1;
    for (let i = 0; i < 600 && landedAt < 0; i += 1) {
      const r = step(state, [{ ...NEUTRAL_INPUT, throttle: 1 }]);
      state = r.state;
      if (state.karts[0]!.glide) glided = true;
      if (glided && r.events.some((e) => e.type === 'land')) landedAt = i;
      expect(r.events.some((e) => e.type === 'respawn')).toBe(false);
    }
    expect(glided).toBe(true);
    expect(state.karts[0]!.position.x).toBeGreaterThan(TEST_RAMP_LAYOUT.gap.to);
  });
});
