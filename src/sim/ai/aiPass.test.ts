import { describe, expect, it } from 'vitest';
import { raceTrackIds } from '../items/balance';
import { AI_PASS, aiPassRace } from './aiPass';

/**
 * The AI smoke test on every race track (MK-71), one seed each so `pnpm test` stays quick (a
 * different seed per track); `pnpm ai-pass` runs 5 seeds per track with the same checks.
 */
describe('AI pass: 8 AI, 150cc, items on, 3 laps', () => {
  it.each(raceTrackIds().map((trackId, i) => [trackId, i + 1] as const))(
    '%s (seed %i): everyone finishes within 15 % of the winner, nobody stuck over 3 s',
    (trackId, seed) => {
      const r = aiPassRace(trackId, seed);
      expect(r.raceTimes.every((t) => t !== undefined)).toBe(true);
      expect(r.spread).toBeLessThan(AI_PASS.maxSpread);
      expect(r.worstStuck).toBeLessThanOrEqual(AI_PASS.maxStuckSeconds);
    },
    60_000, // One full 8-AI race: ~5 s of CPU here, up to ~15 s on CI's 2-core runner.
  );
});
