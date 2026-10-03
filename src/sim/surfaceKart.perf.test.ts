import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_RAMP_ID, TEST_RAMP_LAYOUT as L } from '../mk8/content/courses/test-ramp';
import { registerTestRamp } from '../mk8/content/courses/test-ramp/register';
import { createSimState, type KartSpawn } from './state';
import { step } from './step';
import type { InputFrame, SimState } from './types';

/**
 * Surface-frame physics cost (MK-99): a whole sim step with 8 karts on the MK8 test ramp, half of
 * them on the tunnel's anti-gravity wall and ceiling, against the same 1 ms budget as an 8-kart
 * AI race on a spline track (`ai/ai.perf.test.ts`). Each kart casts 7 rays and a wall query.
 */
const BUDGET_MS = 1;
const ALONG_A = -Math.PI / 2;

beforeAll(registerTestRamp);

function field(): SimState {
  const floor = (x: number, z: number): KartSpawn => ({
    position: { x, y: 0, z },
    heading: ALONG_A,
    speed: 20,
  });
  const wall = (x: number, y: number): KartSpawn => ({
    position: { x, y, z: L.roadHalfWidth },
    heading: ALONG_A,
    up: { x: 0, y: 0, z: -1 },
    speed: 20,
  });
  const ceiling = (x: number, z: number): KartSpawn => ({
    position: { x, y: L.tunnel.height, z },
    heading: ALONG_A,
    up: { x: 0, y: -1, z: 0 },
    speed: 20,
  });
  return createSimState({
    seed: 1,
    trackId: TEST_RAMP_ID,
    engineClass: 150,
    itemsOn: false,
    karts: [
      floor(0, -3),
      floor(4, 3),
      floor(20, 0),
      floor(32, 0),
      wall(34, 3),
      wall(40, 5),
      ceiling(36, -2),
      ceiling(42, 2),
    ],
  });
}

const input = (i: number): InputFrame => ({
  throttle: 1,
  brake: 0,
  steer: Math.sin(i / 15) * 0.3,
  drift: false,
  item: false,
});

describe('MK-99: surface-frame step for 8 karts', () => {
  it(`a sim step with 8 mesh-track karts averages under ${BUDGET_MS} ms`, () => {
    const rounds = Array.from({ length: 5 }, () => {
      let state = field();
      for (let i = 0; i < 30; i += 1)
        state = step(
          state,
          Array.from({ length: 8 }, () => input(i)),
        ).state;
      const start = performance.now();
      for (let i = 0; i < 60; i += 1)
        state = step(
          state,
          Array.from({ length: 8 }, () => input(i)),
        ).state;
      return (performance.now() - start) / 60;
    });
    const best = Math.min(...rounds);
    console.info(`MK-99 perf: 8 mesh-track karts, ${best.toFixed(3)} ms per sim step`);
    expect(best).toBeLessThan(BUDGET_MS);
  });
});
