import { describe, expect, it } from 'vitest';
import { DT } from '../sim/tuning';
import { advanceAccumulator, MAX_STEPS_PER_FRAME } from './loop';

function stepsForOneSecond(fps: number): number {
  let accumulator = 0;
  let total = 0;
  for (let frame = 0; frame < fps; frame += 1) {
    const result = advanceAccumulator(accumulator, 1 / fps, DT);
    accumulator = result.accumulator;
    total += result.steps;
  }
  return total;
}

describe('advanceAccumulator', () => {
  it.each([30, 60, 144])('runs exactly 60 ticks for one second at %i fps', (fps) => {
    expect(stepsForOneSecond(fps)).toBe(60);
  });

  it('caps a 1 s hitch at the max steps and drops the backlog', () => {
    const result = advanceAccumulator(0, 1, DT);
    expect(result.steps).toBe(MAX_STEPS_PER_FRAME);
    expect(result.accumulator).toBe(0);
  });

  it('returns an interpolation alpha between 0 and 1', () => {
    const result = advanceAccumulator(0, DT * 1.5, DT);
    expect(result.steps).toBe(1);
    expect(result.alpha).toBeCloseTo(0.5);
  });
});
