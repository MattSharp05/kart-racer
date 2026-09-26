import { allAiRace } from '../items/balance';
import { raceTime } from '../raceFlow';
import { step } from '../step';
import { DT, type EngineClass } from '../tuning';
import { NEUTRAL_INPUT, type SimState } from '../types';

/**
 * The cross-track AI pass (MK-71): one all-AI race (8 karts, items on, rubber band on, like a real
 * race) measured for what the ticket asks of the AI on every track: everyone finishes, the field
 * stays together (slowest race time within `AI_PASS.maxSpread` of the fastest), nobody sits stuck,
 * and hazards don't wreck them. `scripts/aiPass.lab.ts` (`pnpm ai-pass`) runs every track × 5
 * seeds; `aiPass.test.ts` runs a small subset in `pnpm test`.
 */
export const AI_PASS = {
  engineClass: 150 as EngineClass,
  /** Slowest finisher's race time over the fastest's, minus 1 (the ticket's "within 15 %"). */
  maxSpread: 0.15,
  /** Slower than this, m/s, counts as stuck (unless spun out, carried back or before GO). */
  stuckSpeed: 1,
  /** Longest a kart may be stuck, s. */
  maxStuckSeconds: 3,
  /** A race that isn't over this long after GO has a kart that can't finish, s. */
  maxRaceSeconds: 400,
} as const;

export interface AiPassResult {
  trackId: string;
  seed: number;
  /** Race time per kart (by kart id), s; undefined if it didn't finish. */
  raceTimes: (number | undefined)[];
  /** Best lap of the whole field, s. */
  bestLap: number;
  /** (slowest − fastest) / fastest over the finishers. */
  spread: number;
  /** Longest any kart sat stuck, s. */
  worstStuck: number;
  /** Respawns (falls or out of bounds) per kart per lap, whole field. */
  respawnsPerLap: number;
  /** Hazard hits per kart per lap, whole field. */
  hazardHitsPerLap: number;
}

/** Races one all-AI race on `trackId` to the end and measures it. */
export function aiPassRace(trackId: string, seed: number): AiPassResult {
  let s: SimState = allAiRace(seed, trackId, 8, AI_PASS.engineClass);
  const stuckFor = s.karts.map(() => 0);
  let worstStuck = 0;
  let respawns = 0;
  let hazardHits = 0;
  while (s.karts.some((k) => k.race.finishTick === undefined)) {
    const result = step(s, [NEUTRAL_INPUT]);
    s = result.state;
    for (const event of result.events) {
      if (event.type === 'respawn') respawns += 1;
      else if (event.type === 'kartHit' && event.kind === 'hazard') hazardHits += 1;
    }
    if (s.phase !== 'racing') continue;
    for (const kart of s.karts) {
      const excused =
        kart.race.finishTick !== undefined || kart.spinTimer > 0 || kart.respawnTimer > 0;
      const stuck = !excused && Math.abs(kart.speed) < AI_PASS.stuckSpeed;
      stuckFor[kart.id] = stuck ? (stuckFor[kart.id] ?? 0) + DT : 0;
      worstStuck = Math.max(worstStuck, stuckFor[kart.id] ?? 0);
    }
    if (raceTime(s) > AI_PASS.maxRaceSeconds) break;
  }
  const raceTimes = s.karts.map((k) =>
    k.race.finishTick === undefined ? undefined : k.race.lapTimes.reduce((a, b) => a + b, 0),
  );
  const finished = raceTimes.filter((t): t is number => t !== undefined);
  const fastest = Math.min(...finished);
  const slowest = Math.max(...finished);
  const laps = s.karts.length * s.race.laps;
  return {
    trackId,
    seed,
    raceTimes,
    bestLap: Math.min(...s.karts.flatMap((k) => k.race.lapTimes)),
    spread: finished.length > 0 ? slowest / fastest - 1 : Infinity,
    worstStuck,
    respawnsPerLap: respawns / laps,
    hazardHitsPerLap: hazardHits / laps,
  };
}
