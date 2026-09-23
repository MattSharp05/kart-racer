import { describe, expect, it } from 'vitest';
import { createSimState } from './state';
import { step } from './step';
import { DT, tuning } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from './types';

const TOP = tuning.topSpeed[100];
const ticks = (seconds: number) => Math.round(seconds / DT);

/** A kart in the middle of the pad (room to circle), facing −Z, already at `speed`. */
function start(speed: number): SimState {
  return createSimState({ seed: 1, karts: [{ speed }] });
}

interface Run {
  state: SimState;
  events: SimEvent[];
  frames: SimState[];
}

/** Runs `n` ticks, asking `script(tick, state)` for the input each tick. */
function run(
  state: SimState,
  n: number,
  script: (tick: number, s: SimState) => Partial<InputFrame>,
): Run {
  const events: SimEvent[] = [];
  const frames: SimState[] = [];
  let s = state;
  for (let t = 0; t < n; t += 1) {
    const result = step(s, [{ ...NEUTRAL_INPUT, ...script(t, s) }]);
    s = result.state;
    events.push(...result.events);
    frames.push(s);
  }
  return { state: s, events, frames };
}

/** Hold drift (steering right, neutral in-drift steer) for `seconds`, then release. */
function driftFor(seconds: number): Run {
  const hold = ticks(seconds);
  return run(start(TOP * 0.9), hold + 2, (t) =>
    t < hold ? { throttle: 1, drift: true, steer: t === 0 ? 1 : 0 } : { throttle: 1 },
  );
}

const miniTurbos = (r: Run) => r.events.filter((e) => e.type === 'miniTurbo');
const boosts = (r: Run) =>
  r.events.flatMap((e) => (e.type === 'boost' ? [e.seconds] : ([] as number[])));

describe('drift → mini-turbo tiers', () => {
  it.each([
    [0.5, 0, undefined],
    [0.9, 1, 0.6],
    [1.7, 2, 1.0],
    [2.7, 3, 1.4],
  ])('holding a drift %f s gives tier %i (boost %s s)', (seconds, tier, boost) => {
    const r = driftFor(seconds);
    const turbos = miniTurbos(r);
    if (tier === 0) {
      expect(turbos).toHaveLength(0);
      expect(r.state.karts[0]!.boostTimer).toBe(0);
    } else {
      expect(turbos).toEqual([{ type: 'miniTurbo', kartId: 0, tier }]);
      expect(boosts(r)).toEqual([boost]);
    }
  });

  it('reports each tier as it is reached', () => {
    const r = driftFor(2.7);
    const tiers = r.events.flatMap((e) => (e.type === 'driftTier' ? [e.tier] : []));
    expect(tiers).toEqual([1, 2, 3]);
  });

  it('steering into the drift charges faster than steering out of it', () => {
    const hold = ticks(1.2);
    const into = run(start(TOP * 0.9), hold, (t) => ({
      throttle: 1,
      drift: true,
      steer: t === 0 ? 1 : 1,
    }));
    const out = run(start(TOP * 0.9), hold, (t) => ({
      throttle: 1,
      drift: true,
      steer: t === 0 ? 1 : -1,
    }));
    expect(into.state.karts[0]!.drift.charge).toBeGreaterThan(out.state.karts[0]!.drift.charge);
  });

  it('cannot flip the drift direction by steering the other way', () => {
    const r = run(start(TOP * 0.9), 60, (t) => ({
      throttle: 1,
      drift: true,
      steer: t === 0 ? 1 : -1,
    }));
    expect(r.state.karts[0]!.drift.direction).toBe(1);
    // Still turning right (heading decreasing), just more gently.
    expect(r.state.karts[0]!.heading).toBeLessThan(0);
  });
});

describe('drift start conditions', () => {
  it('below 40% of top speed, pressing drift only hops', () => {
    const r = run(start(TOP * 0.3), 30, () => ({ throttle: 0.3, drift: true, steer: 1 }));
    expect(r.events.some((e) => e.type === 'hop')).toBe(true);
    expect(r.events.some((e) => e.type === 'driftStart')).toBe(false);
  });

  it('pressing drift without steering only hops', () => {
    const r = run(start(TOP * 0.9), 30, () => ({ throttle: 1, drift: true }));
    expect(r.events.filter((e) => e.type === 'hop')).toHaveLength(1);
    expect(r.events.some((e) => e.type === 'driftStart')).toBe(false);
  });

  it('the hop leaves the ground and lands again', () => {
    const r = run(start(TOP * 0.9), 40, () => ({ throttle: 1, drift: true }));
    expect(r.frames.some((s) => s.karts[0]!.position.y > 0.1)).toBe(true);
    expect(r.state.karts[0]!.grounded).toBe(true);
  });

  it('slowing below 40% of top speed cancels the drift with no boost', () => {
    const r = run(start(TOP * 0.9), ticks(3), (t) => ({
      drift: true,
      steer: 1,
      brake: t > 30 ? 1 : 0,
    }));
    expect(r.events.some((e) => e.type === 'driftCancel')).toBe(true);
    expect(miniTurbos(r)).toHaveLength(0);
  });
});

describe('boost', () => {
  it('raises speed above normal top speed, up to 1.3×, then returns to normal', () => {
    const r = run(start(TOP), ticks(6), (t) => ({ throttle: 1, drift: t < ticks(2.7), steer: 1 }));
    const speeds = r.frames.map((s) => s.karts[0]!.speed);
    expect(Math.max(...speeds)).toBeGreaterThan(TOP * 1.1);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(TOP * tuning.boostSpeed + 1e-9);
    expect(speeds.at(-1)).toBeCloseTo(TOP, 1);
  });

  it('a new boost extends rather than stacks', () => {
    const r = run(start(TOP), ticks(3.5), (t) => ({
      throttle: 1,
      steer: 1,
      // Two quick tier-1 drifts back to back.
      drift: (t > 1 && t < ticks(0.95)) || (t > ticks(1.0) && t < ticks(1.9)),
    }));
    expect(Math.max(...r.frames.map((s) => s.karts[0]!.boostTimer))).toBeLessThanOrEqual(
      tuning.miniTurboSeconds[0],
    );
  });
});

describe('drifting pays off', () => {
  /** Ticks until the kart has turned around a 180° hairpin and come back past its start line. */
  function hairpin(drift: boolean): number {
    const startZ = 0;
    const initial = createSimState({
      seed: 1,
      karts: [{ position: { x: -60, y: 0, z: startZ }, speed: TOP }],
    });
    const turned = (s: SimState) => Math.abs(s.karts[0]!.heading) > Math.PI * 0.97;
    let doneTurning = false;
    const r = run(initial, ticks(12), (_t, s) => {
      if (!doneTurning && turned(s)) doneTurning = true;
      if (doneTurning) return { throttle: 1 };
      return drift ? { throttle: 1, drift: true, steer: 1 } : { throttle: 1, steer: 1 };
    });
    const crossed = r.frames.findIndex((s) => s.karts[0]!.position.z > startZ + 40);
    expect(crossed).toBeGreaterThan(0);
    return crossed;
  }

  it('drift + mini-turbo through a hairpin beats a normal full-lock turn', () => {
    expect(hairpin(true)).toBeLessThan(hairpin(false));
  });
});
