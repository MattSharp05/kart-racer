import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_RAMP_ID } from '../../mk8/content/courses/test-ramp';
import { registerTestRamp } from '../../mk8/content/courses/test-ramp/register';
import { testRampRoute } from '../../mk8/content/courses/test-ramp/route';
import { coinLineTs } from '../../sim/coins';
import { routeGeometry } from '../../sim/route';
import { step } from '../../sim/step';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from '../../sim/types';
import scenarios, { COINS_RAMP } from './coins';

beforeAll(registerTestRamp);

function setup(name: string): SimState {
  const scenario = scenarios.find((s) => s.name === name);
  if (!scenario) throw new Error(`no scenario ${name}`);
  return scenario.setup(scenario.defaultSeed ?? 1).state;
}

function run(state: SimState, n: number, input: (tick: number) => InputFrame): SimState {
  let s = state;
  for (let i = 0; i < n; i += 1) s = step(s, [input(i)]).state;
  return s;
}

const THROTTLE: InputFrame = { ...NEUTRAL_INPUT, throttle: 1 };

describe('coin scenarios (MK-109)', () => {
  it('use the test ramp’s real first coin line (copied so the main bundle stays free of MK8 code)', () => {
    expect(COINS_RAMP.id).toBe(TEST_RAMP_ID);
    const [line] = testRampRoute.coinLines;
    if (!line) throw new Error('no coin line');
    const geometry = routeGeometry(testRampRoute);
    const xs = coinLineTs(line).map((t) => geometry.frameAt(t, line.lateral).position.x);
    expect(xs[0]).toBeCloseTo(COINS_RAMP.firstLine.from, 0);
    expect(xs.at(-1)).toBeCloseTo(COINS_RAMP.firstLine.to, 0);
  });

  it('mk8-test-coins: holding accelerate takes the 5 coins ahead', () => {
    const after = run(setup('mk8-test-coins'), 240, () => THROTTLE);
    expect(after.karts[0]?.coins).toBe(5);
  });

  it('mk8-test-coins-10: starts at 10 and stays there through the line', () => {
    const state = setup('mk8-test-coins-10');
    expect(state.karts[0]?.coins).toBe(10);
    const after = run(state, 240, () => THROTTLE);
    expect(after.karts[0]?.coins).toBe(10);
    expect(after.coins?.slice(0, 5).every((c) => c.respawnTimer > 0)).toBe(true);
  });

  it('mk8-test-coins-hit: the shell knocks 3 coins out of the parked kart', () => {
    const state = setup('mk8-test-coins-hit');
    let s = state;
    for (let i = 0; i < 90; i += 1) {
      s = step(s, [{ ...NEUTRAL_INPUT, item: i === 0 }, NEUTRAL_INPUT]).state;
    }
    expect(s.karts[1]?.coins).toBe(2);
    expect(s.coins?.filter((c) => c.life !== undefined)).toHaveLength(3);
  });
});
