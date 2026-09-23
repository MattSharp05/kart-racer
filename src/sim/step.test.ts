import { describe, expect, it } from 'vitest';
import { createSimState } from './state';
import { step } from './step';
import { PLACEHOLDER_SPEED } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from './types';

function scriptedInput(tick: number): InputFrame {
  return { ...NEUTRAL_INPUT, throttle: tick % 120 < 60 ? 1 : 0.5, steer: Math.sin(tick / 30) };
}

function run(seed: number, ticks: number): SimState {
  let state = createSimState({ seed, karts: [{}, { heading: 1 }] });
  for (let t = 0; t < ticks; t += 1) {
    state = step(state, [scriptedInput(t), scriptedInput(t + 7)]).state;
  }
  return state;
}

describe('step', () => {
  it('is deterministic: same seed + inputs for 600 ticks gives identical state', () => {
    expect(JSON.stringify(run(123, 600))).toBe(JSON.stringify(run(123, 600)));
  });

  it('does not mutate its input state', () => {
    const state = createSimState({ seed: 1 });
    const before = JSON.stringify(state);
    step(state, [{ ...NEUTRAL_INPUT, throttle: 1 }]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('advances the tick and moves a throttled kart forward along −Z', () => {
    let state = createSimState({ seed: 1 });
    for (let t = 0; t < 60; t += 1) state = step(state, [{ ...NEUTRAL_INPUT, throttle: 1 }]).state;
    expect(state.tick).toBe(60);
    expect(state.karts[0]?.position.z).toBeCloseTo(-PLACEHOLDER_SPEED, 5);
  });

  it('treats a missing input as neutral', () => {
    const { state } = step(createSimState({ seed: 1 }), []);
    expect(state.karts[0]?.speed).toBe(0);
  });
});
