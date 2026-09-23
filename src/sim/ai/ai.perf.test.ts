import { describe, expect, it } from 'vitest';
import { sunnyRace } from '../../scenarios/race';
import { step } from '../step';
import { NEUTRAL_INPUT, type SimState } from '../types';

describe('AI race performance', () => {
  it('one sim step with 8 karts (7 AI) averages under 1 ms', () => {
    let state: SimState = sunnyRace(1, { karts: 8, ai: true });
    for (let i = 0; i < 400; i += 1) state = step(state, [NEUTRAL_INPUT]).state; // past GO, warm up
    const rounds = Array.from({ length: 5 }, () => {
      const start = performance.now();
      for (let i = 0; i < 300; i += 1) state = step(state, [NEUTRAL_INPUT]).state;
      return (performance.now() - start) / 300;
    });
    expect(Math.min(...rounds)).toBeLessThan(1);
  });
});
