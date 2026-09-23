import { describe, expect, it } from 'vitest';
import { testOval } from './data/tracks/testOval';
import { rngRange, seedRng } from './rng';
import { trackGeometry } from './track';

/** Perf budgets run on their own (`pnpm test:perf`, no parallel files) so timings aren't skewed. */
const geometry = trackGeometry(testOval);

describe('track geometry performance', () => {
  it('answers a projection in under 5 µs on average', () => {
    const rng = { rngState: seedRng(5) };
    const points = Array.from({ length: 2000 }, () =>
      geometry.pointAt(rngRange(rng, 0, 1), rngRange(rng, -12, 12)),
    );
    for (const p of points) geometry.project(p); // warm up
    // Fastest of several rounds, so a busy machine (parallel test workers, CI) doesn't cause flakes.
    const rounds = Array.from({ length: 7 }, () => {
      const start = performance.now();
      for (const p of points) geometry.project(p);
      return ((performance.now() - start) * 1000) / points.length;
    });
    expect(Math.min(...rounds)).toBeLessThan(5);
  });
});
