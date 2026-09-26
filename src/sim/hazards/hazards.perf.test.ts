import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tracks } from '../../content/tracks';
import hazardTestContent, { hazardTest } from '../../content/tracks/hazard-test/sim';
import { createSimState } from '../state';
import { step } from '../step';
import { NEUTRAL_INPUT } from '../types';

/** The hazard test track with its 4 hazards copied 5 times, out of step: 20 hazards. */
const PERF_ID = 'hazard-perf';

describe('hazard performance (MK-49)', () => {
  beforeAll(() => {
    const hazards = Array.from({ length: 5 }, (_, copy) =>
      (hazardTest.hazards ?? []).map((h) => ({ ...h, phase: copy / 5 })),
    ).flat();
    tracks.register({
      ...hazardTestContent,
      id: PERF_ID,
      def: { ...hazardTest, id: PERF_ID, hazards },
    });
  });
  afterAll(() => tracks.unregister(PERF_ID));

  it('sim.step with 8 karts and 20 hazards stays under 1 ms', () => {
    let state = createSimState({
      seed: 9,
      trackId: PERF_ID,
      phase: 'racing',
      karts: Array.from({ length: 8 }, (_, i) => ({
        position: { x: 45 + (i % 2) * 4 - 2, y: 0, z: 70 - i * 6 },
        heading: 0,
        speed: 15,
        controller: 'ai' as const,
      })),
    });
    const inputs = Array.from({ length: 8 }, () => ({ ...NEUTRAL_INPUT, throttle: 1 }));
    for (let i = 0; i < 60; i += 1) state = step(state, inputs).state; // warm up
    // Fastest of several rounds of 60 ticks, so a busy machine doesn't cause flakes.
    const rounds = Array.from({ length: 7 }, () => {
      const start = performance.now();
      for (let i = 0; i < 60; i += 1) state = step(state, inputs).state;
      return (performance.now() - start) / 60;
    });
    expect(state.tick).toBe(60 * 8);
    expect(Math.min(...rounds)).toBeLessThan(1);
  });
});
