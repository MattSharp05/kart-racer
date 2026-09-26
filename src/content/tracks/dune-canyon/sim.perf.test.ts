import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { step } from '../../../sim/step';
import type { SimState } from '../../../sim/types';
import { SANDSTORM_START_TICK } from './scenarios';

describe('Dune Canyon performance (MK-58)', () => {
  it('sim.step of the 8-kart race stays under 1 ms, sandstorm blowing', () => {
    let state: SimState = scenarios.get('track-dune-canyon')!.setup(1).state;
    // Race until the storm has been blowing for a second (this is also the warm-up).
    while (state.tick < SANDSTORM_START_TICK + 60) state = step(state, []).state;
    // Fastest of several rounds of 60 ticks, so a busy machine doesn't cause flakes.
    const rounds = Array.from({ length: 7 }, () => {
      const start = performance.now();
      for (let i = 0; i < 60; i += 1) state = step(state, []).state;
      return (performance.now() - start) / 60;
    });
    expect(Math.min(...rounds)).toBeLessThan(1);
  });
});
