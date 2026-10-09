import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { tracks } from '../src/content/tracks';
import {
  collisionSourcePath,
  courseTrack,
  MK8_COURSES,
  registerCourse,
} from '../src/mk8/content/courses';
import { modelCollisionReady } from '../src/mk8/content/courses/modelCollision';
import { mk8AiPass, MK8_AI_TARGETS } from '../src/mk8/content/courses/aiCheck';
import { routeRibbonCollision } from '../src/mk8/content/courses/routeRibbon';
import { registerTestRamp } from '../src/mk8/content/courses/test-ramp/register';
import { AI_PASS, aiPassRace, type AiPassResult } from '../src/sim/ai/aiPass';
import { raceTrackIds } from '../src/sim/items/balance';
import { trackLimit } from '../src/records/trackLimits';
import { tuning, type EngineClass } from '../src/sim/tuning';

/**
 * The cross-track AI pass (MK-71): `pnpm ai-pass`. Every race track × 5 seeds, 8 AI at 150cc with
 * items on, 3 laps: everyone finishes, the field's race times stay within 15 %, nobody is stuck
 * for more than 3 s; prints hazard hits and falls per lap, and checks each track's leaderboard
 * limit is under 85 % of the AI's best lap. Minutes of CPU, so never part of `pnpm test`
 * (`aiPass.test.ts` runs a subset there). `SEEDS=2` runs fewer, `TRACKS=a,b` only some tracks,
 * `CC=200` another engine class (MK-96; the leaderboard-limit check only applies at 150cc).
 *
 * `MK8=1` (MK-128): the MK8 courses instead, 8 AI per race, measured against MK-128's targets
 * (nobody stuck > 5 s, ≤ 1 fall and ≤ 1 Thwomp squash per kart per race, the field's mean lap
 * within 15 % of the scripted autopilot's), plus how often they drift, glide, take coins and
 * spin-boost. Each course from the pack (`$MK8_OUT`, default `.mk8-out/`) when it's there, else a
 * stand-in mesh of its route (`routeRibbon.ts`, marked "stand-in"); and the synthetic test ramp
 * and its Thwomp copy.
 */
// Courses that build their collision from the model need the meshopt decoder (MK-123).
await modelCollisionReady;

const SEEDS = Number(process.env.SEEDS ?? 5);
const TRACKS = process.env.TRACKS?.split(',') ?? raceTrackIds();
const CC = Number(process.env.CC ?? AI_PASS.engineClass) as EngineClass;
if (!(CC in tuning.topSpeed)) throw new Error(`CC=${process.env.CC}: not an engine class`);
/** The ticket's check on `track_limits`: the limit is below the AI's best lap × this. */
const LIMIT_SHARE = 0.85;

/** The MK8 courses to measure (MK-128): `[trackId, label]`, each registered here. */
function mk8PassTracks(): [string, string][] {
  registerTestRamp();
  const out: [string, string][] = [
    ['mk8-test-ramp', 'test ramp'],
    ['mk8-test-thwomp', 'test Thwomp'],
  ];
  const pack = resolve(process.env.MK8_OUT ?? '.mk8-out');
  for (const course of MK8_COURSES) {
    const file = resolve(pack, collisionSourcePath(course));
    if (existsSync(file)) {
      const bytes = readFileSync(file);
      registerCourse(
        course,
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      );
      out.push([course.trackId, course.name]);
    } else {
      const id = `${course.trackId}-standin`;
      if (!tracks.has(id)) {
        const def = { ...courseTrack(course, routeRibbonCollision(course.route)), id };
        tracks.register({
          id,
          name: `${course.name} (stand-in)`,
          order: 3000,
          def,
          testOnly: true,
        });
      }
      out.push([id, `${course.name} (stand-in: no pack)`]);
    }
  }
  return out;
}

it.runIf(process.env.MK8)(`MK8 AI pass ${CC}cc × ${SEEDS} seeds`, { timeout: 60 * 60_000 }, () => {
  const lines = [
    'course | autopilot lap s | AI mean lap s | over autopilot | worst stuck s | falls/kart | crushes/kart | drifts/lap | glides/lap | coins/lap | spin boosts/lap',
  ];
  const results = mk8PassTracks().map(([trackId, label]) => {
    const r = mk8AiPass(trackId, SEEDS, CC);
    lines.push(
      [
        label,
        r.autopilotLap.toFixed(2),
        r.meanLap.toFixed(2),
        `${((r.meanLap / r.autopilotLap - 1) * 100).toFixed(1)}%`,
        r.worstStuck.toFixed(1),
        r.fallsPerKart.toFixed(2),
        r.crushesPerKart.toFixed(2),
        r.driftsPerLap.toFixed(1),
        r.glidesPerLap.toFixed(2),
        r.coinsPerLap.toFixed(2),
        r.spinBoostsPerLap.toFixed(2),
      ].join(' | '),
    );
    return { label, r };
  });
  console.log(`\n${lines.join('\n')}\n`);
  for (const { label, r } of results) {
    expect(r.unfinished, `${label}: all finish`).toBe(0);
    expect(r.worstStuck, `${label}: stuck`).toBeLessThan(MK8_AI_TARGETS.maxStuck);
    expect(r.fallsPerKart, `${label}: falls`).toBeLessThanOrEqual(MK8_AI_TARGETS.maxFallsPerKart);
    expect(r.crushesPerKart, `${label}: crushes`).toBeLessThanOrEqual(
      MK8_AI_TARGETS.maxCrushesPerKart,
    );
    expect(r.meanLap / r.autopilotLap, `${label}: laps`).toBeLessThan(
      MK8_AI_TARGETS.maxLapOverAutopilot,
    );
  }
});

it.skipIf(process.env.MK8)(
  `AI pass ${CC}cc: ${TRACKS.length} tracks × ${SEEDS} seeds`,
  { timeout: 60 * 60_000 },
  () => {
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
  },
);
