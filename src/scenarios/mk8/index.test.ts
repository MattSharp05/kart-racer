import { describe, expect, it } from 'vitest';
import { TEST_RAMP_ID, TEST_RAMP_LAYOUT } from '../../mk8/content/courses/test-ramp';
import { mk8Scenarios } from './index';
import { TEST_RAMP } from './testRamp';

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
  it('name the course of exactly the scenarios that drive one', () => {
    // MK-121's pause and results scenarios and MK-130's Grand Prix race on the test ramp too,
    // and MK-129's all-items race.
    const onRamp = [
      'mk8-ui-pause',
      'mk8-ui-results',
      'mk8-ui-standings',
      'mk8-race-all-items',
      'mk8-online-race-2p',
      'mk8-voices',
    ];
    const onCourse = mk8Scenarios
      .filter(
        (s) =>
          /^mk8-(local-|stadium-|waterpark-|canyon-|ruins-|gp-|test-|item-bullet|hud-|tt-(?!courses))/.test(
            s.name,
          ) || onRamp.includes(s.name),
      )
      .map((s) => s.name);
    const withCourse = mk8Scenarios.filter((s) => s.mk8Course !== undefined).map((s) => s.name);
    expect(withCourse.sort()).toEqual(onCourse.sort());
  });
});

describe('mk8-test-glide (MK-106)', () => {
  it('holding accelerate from the start, the kart glides over the gap and lands beyond it', async () => {
    const { registerTestRamp } = await import('../../mk8/content/courses/test-ramp/register');
    const { step } = await import('../../sim/step');
    const { NEUTRAL_INPUT } = await import('../../sim/types');
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

describe('MK8 scenario groups (MK-142)', () => {
  it('collects every group file, each scenario in the MK8 Mode group', () => {
    expect(mk8Scenarios.length).toBeGreaterThanOrEqual(MK8_SCENARIO_NAMES.length);
    // Online races (MK-132) are listed under Online, with host and client links.
    const offline = mk8Scenarios.filter((s) => !s.name.startsWith('mk8-online-'));
    expect(new Set(offline.map((s) => s.group))).toEqual(new Set(['MK8 Mode']));
  });

  it('keeps every scenario name tickets link to', () => {
    const names = new Set(mk8Scenarios.map((s) => s.name));
    for (const name of MK8_SCENARIO_NAMES) expect(names, name).toContain(name);
  });
});

/** The MK8 scenario names before MK-142 split the file: links on tickets use them. */
const MK8_SCENARIO_NAMES = [
  'mk8-entry',
  'mk8-loading',
  'mk8-not-installed',
  'mk8-password',
  'mk8-mode',
  'mk8-test-antigrav',
  'mk8-test-ceiling',
  'mk8-test-race',
  'mk8-test-glide',
  'mk8-stadium-race',
  'mk8-stadium-free',
  'mk8-stadium-antigrav',
  'mk8-stadium-final-lap',
  'mk8-items-lineup',
  'mk8-two-slots',
  'mk8-item-triple-red',
  'mk8-item-triple-green',
  'mk8-item-triple-banana',
  'mk8-item-triple-mushroom',
  'mk8-item-golden',
  'mk8-item-spiny',
  'mk8-item-horn-vs-spiny',
  'mk8-item-bobomb',
  'mk8-item-fire-flower',
  'mk8-loadout-heavy',
  'mk8-loadout-light',
  'mk8-ui-kit',
  'mk8-ui-title',
  'mk8-ui-mode',
  'mk8-ui-char',
  'mk8-ui-kart',
  'mk8-ui-cc',
  'mk8-ui-cup',
  'mk8-ui-course',
  'mk8-racers-lineup',
  'mk8-racer-motion',
  'mk8-lakitu-countdown',
  'mk8-lakitu-lap',
  'mk8-lakitu-respawn',
  'mk8-karts-lineup',
];
