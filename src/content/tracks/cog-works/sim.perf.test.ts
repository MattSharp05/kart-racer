import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { step } from '../../../sim/step';
import type { SimState } from '../../../sim/types';

describe('Cog Works performance (MK-62)', () => {
  it('sim.step of the 8-kart race stays under 1 ms, with the pack timing the crushers', () => {
    let state: SimState = scenarios.get('track-cog-works')!.setup(1).state;
    // Warm up: race 20 s, until the pack is on the crusher gauntlet.
    while (state.tick < 60 * 20) state = step(state, []).state;
    // Fastest of several rounds of 60 ticks, so a busy machine doesn't cause flakes.
    const rounds = Array.from({ length: 7 }, () => {
      const start = performance.now();
      for (let i = 0; i < 60; i += 1) state = step(state, []).state;
      return (performance.now() - start) / 60;
    });
    expect(Math.min(...rounds)).toBeLessThan(1);
  });
});
