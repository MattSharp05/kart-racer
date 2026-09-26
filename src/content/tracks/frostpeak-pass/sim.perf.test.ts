import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { step } from '../../../sim/step';
import type { SimState } from '../../../sim/types';

describe('Frostpeak Pass performance (MK-59)', () => {
  it('sim.step of the 8-kart race stays under 1 ms, snowballs rolling', () => {
    let state: SimState = scenarios.get('track-frostpeak-pass')!.setup(1).state;
    // Warm up: race 20 s, into the climb, with every lane's snowball rolling on and off.
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
