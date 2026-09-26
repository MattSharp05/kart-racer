import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { step } from '../../../sim/step';
import type { SimState } from '../../../sim/types';

describe('Neon Harbour performance (MK-60)', () => {
  it('sim.step of the 8-kart race stays under 1 ms, with the AI watching the traffic', () => {
    let state: SimState = scenarios.get('track-neon-harbour')!.setup(1).state;
    // Warm up: race 31 s, until the pack turns into the city block, among the traffic.
    while (state.tick < 60 * 31) state = step(state, []).state;
    // Fastest of several rounds of 60 ticks, so a busy machine doesn't cause flakes.
    const rounds = Array.from({ length: 7 }, () => {
      const start = performance.now();
      for (let i = 0; i < 60; i += 1) state = step(state, []).state;
      return (performance.now() - start) / 60;
    });
    expect(Math.min(...rounds)).toBeLessThan(1);
  });
});
