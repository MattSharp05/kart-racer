import { expect, it } from 'vitest';
import { AI_PASS, aiPassRace, type AiPassResult } from '../src/sim/ai/aiPass';
import { raceTrackIds } from '../src/sim/items/balance';
import { trackLimit } from '../src/records/trackLimits';
import type { EngineClass } from '../src/sim/tuning';

/**
 * The cross-track AI pass (MK-71): `pnpm ai-pass`. Every race track × 5 seeds, 8 AI at 150cc with
 * items on, 3 laps: everyone finishes, the field's race times stay within 15 %, nobody is stuck
 * for more than 3 s; prints hazard hits and falls per lap, and checks each track's leaderboard
 * limit is under 85 % of the AI's best lap. Minutes of CPU, so never part of `pnpm test`
 * (`aiPass.test.ts` runs a subset there). `SEEDS=2` runs fewer, `TRACKS=a,b` only some tracks,
 * `CC=200` another engine class (MK-96; the leaderboard-limit check only applies at 150cc).
 */
const SEEDS = Number(process.env.SEEDS ?? 5);
const TRACKS = process.env.TRACKS?.split(',') ?? raceTrackIds();
const CC = Number(process.env.CC ?? AI_PASS.engineClass) as EngineClass;
/** The ticket's check on `track_limits`: the limit is below the AI's best lap × this. */
const LIMIT_SHARE = 0.85;

it(`AI pass ${CC}cc: ${TRACKS.length} tracks × ${SEEDS} seeds`, { timeout: 60 * 60_000 }, () => {
  const lines = [
    'track | seed | fastest s | slowest s | spread | best lap s | stuck s | falls/lap | hazard hits/lap | ms CPU',
  ];
  const results: AiPassResult[] = [];
  for (const trackId of TRACKS) {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const start = performance.now();
      const r = aiPassRace(trackId, seed, CC);
      const ms = performance.now() - start;
      results.push(r);
      const finished = r.raceTimes.filter((t): t is number => t !== undefined);
      lines.push(
        [
          trackId,
          seed,
          Math.min(...finished).toFixed(1),
          Math.max(...finished).toFixed(1),
          `${(r.spread * 100).toFixed(1)}%${finished.length < 8 ? ` (${finished.length}/8 finished)` : ''}`,
          r.bestLap.toFixed(2),
          r.worstStuck.toFixed(1),
          r.respawnsPerLap.toFixed(2),
          r.hazardHitsPerLap.toFixed(2),
          ms.toFixed(0),
        ].join(' | '),
      );
    }
  }
  lines.push('', 'track | AI best lap s | limit min_lap s | limit / AI best');
  const limitShares: number[] = [];
  for (const trackId of TRACKS) {
    const best = Math.min(...results.filter((r) => r.trackId === trackId).map((r) => r.bestLap));
    const limit = trackLimit(trackId).minLapMs / 1000;
    limitShares.push(limit / best);
    lines.push(
      `${trackId} | ${best.toFixed(2)} | ${limit.toFixed(3)} | ${(limit / best).toFixed(2)}`,
    );
  }
  console.log(`\n${lines.join('\n')}\n`);

  for (const r of results) {
    expect(
      r.raceTimes.every((t) => t !== undefined),
      `${r.trackId} seed ${r.seed}: all finish`,
    ).toBe(true);
    expect(r.spread, `${r.trackId} seed ${r.seed}: spread`).toBeLessThan(AI_PASS.maxSpread);
    expect(r.worstStuck, `${r.trackId} seed ${r.seed}: stuck`).toBeLessThanOrEqual(
      AI_PASS.maxStuckSeconds,
    );
  }
  if (CC === AI_PASS.engineClass) {
    for (const share of limitShares) expect(share).toBeLessThan(LIMIT_SHARE);
  }
});
