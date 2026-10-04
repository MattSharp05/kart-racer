// The AI on MK8 courses (MK-128) against the ticket's targets, on the synthetic test ramp and its
// Thwomp copy (no pack): glide ramp and gap, water, anti-gravity wall, coins, a Thwomp. The real
// courses: `MK8=1 pnpm ai-pass` with the pack (stand-ins of their routes without it).
import { beforeAll, describe, expect, it } from 'vitest';
import { registerTestRamp } from './test-ramp/register';
import { mk8AiPass, MK8_AI_TARGETS as T } from './aiCheck';

beforeAll(registerTestRamp);

describe('AI on MK8 courses: the ticket’s targets (MK-128)', () => {
  for (const [trackId, cc] of [
    ['mk8-test-ramp', 150],
    ['mk8-test-thwomp', 150],
    ['mk8-test-ramp', 200],
  ] as const)
    it(`${trackId} at ${cc}cc: everyone finishes, nobody stuck, few falls and crushes, laps near the autopilot’s; it drifts and glides`, () => {
      const r = mk8AiPass(trackId, 1, cc);
      expect(r.unfinished).toBe(0);
      expect(r.worstStuck).toBeLessThan(T.maxStuck);
      expect(r.fallsPerKart).toBeLessThanOrEqual(T.maxFallsPerKart);
      expect(r.crushesPerKart).toBeLessThanOrEqual(T.maxCrushesPerKart);
      expect(r.meanLap / r.autopilotLap).toBeLessThan(T.maxLapOverAutopilot);
      expect(r.driftsPerLap).toBeGreaterThan(1);
      expect(r.glidesPerLap).toBeGreaterThan(0.9);
    });
});
