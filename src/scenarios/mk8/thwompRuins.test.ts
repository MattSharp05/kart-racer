import { describe, expect, it } from 'vitest';
import { TEST_THWOMP as FIXTURE, TEST_THWOMP_ID } from '../../mk8/content/courses/test-ramp/thwomp';
import { mk8Scenarios } from './index';
import { TEST_THWOMP } from './thwompRuins';

const scenario = (name: string) => {
  const found = mk8Scenarios.find((s) => s.name === name);
  if (!found) throw new Error(`no scenario ${name}`);
  return found;
};

describe('Thwomp Ruins scenarios (MK-124)', () => {
  it('use the test Thwomp’s real place (copied so the main bundle stays free of MK8 code)', () => {
    expect(TEST_THWOMP).toEqual({ id: TEST_THWOMP_ID, x: FIXTURE.centre.x, z: FIXTURE.centre.z });
  });

  it('without the pack, the course scenarios show "not installed"', () => {
    for (const name of ['mk8-ruins-race', 'mk8-ruins-free', 'mk8-ruins-thwomp', 'mk8-ruins-wall']) {
      const s = scenario(name);
      expect(s.mk8Course).toBe('thwomp-ruins');
      expect(s.setup(1)).toMatchObject({ screen: 'mk8', mk8Start: 'not-installed' });
    }
  });

  it('mk8-test-thwomp: a kart left under the Thwomp is flattened as it lands', async () => {
    const { registerTestRamp } = await import('../../mk8/content/courses/test-ramp/register');
    const { step } = await import('../../sim/step');
    const { tuning } = await import('../../sim/tuning');
    registerTestRamp();
    let state = scenario('mk8-test-thwomp').setup(1).state;
    expect(state.trackId).toBe(TEST_THWOMP_ID);
    for (let i = 0; i < 150 && state.karts[0]!.squashTimer === undefined; i += 1)
      state = step(state, []).state;
    expect(state.karts[0]!.squashTimer).toBe(tuning.mk8.squashTime);
    // 1.8 s in, give or take the drop.
    expect(state.tick).toBeGreaterThan(100);
  });
});
