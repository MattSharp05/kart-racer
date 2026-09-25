import { describe, expect, it } from 'vitest';
import { benchResim } from './measure';

describe('re-simulation budget (ADR 0005, docs/TDD.md → v2 perf)', () => {
  // The TDD's target is 4 ms; the spike measured ~4.5 ms (MK-36, ADR 0005 → Spike results). This
  // guard catches regressions until the sim-step optimisation ticket brings it under target.
  it('re-simulates 10 ticks of the 8-kart race within 8 ms on desktop', () => {
    benchResim(1, 10, 20); // warm up the JIT
    const { msPerResim, msPerTick } = benchResim(1, 10, 100);
    console.log(
      `resim: ${msPerResim.toFixed(2)} ms per 10 ticks (${msPerTick.toFixed(3)} ms/tick)`,
    );
    expect(msPerResim).toBeLessThan(8);
  });
});
