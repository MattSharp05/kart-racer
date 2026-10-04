// The AI on MK8 courses (MK-128): an all-AI race measured for what the ticket asks of the AI on a
// mesh course (falls, stuck, Thwomp crushes, lap times), and a scripted autopilot's lap to compare
// the AI's laps with. Pure: the course is registered first (the pack's, or a stand-in). Used by
// `pnpm ai-pass` (`MK8=1`) and the unit tests.
import { meshAutopilotInput } from '../../../sim/ai/meshDriver';
import { HAZARD_HITTER } from '../../../sim/hazards';
import { allAiRace } from '../../../sim/items/balance';
import type { MeshTrackDef } from '../../../sim/meshTrack';
import { createSimState } from '../../../sim/state';
import { headingOf } from '../../../sim/math';
import { routeGeometry } from '../../../sim/route';
import { step } from '../../../sim/step';
import { getTrack } from '../../../sim/track';
import { DT, type EngineClass } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type SimState } from '../../../sim/types';

/** Slower than this, m/s, counts as stuck (unless spun out, carried back or finished). */
const STUCK_SPEED = 1;
/** Races give up this long after the start, s. */
const RACE_LIMIT = 400;

export interface Mk8AiRaceResult {
  trackId: string;
  seed: number;
  engineClass: EngineClass;
  /** Race time per kart, s (undefined: didn't finish). */
  raceTimes: (number | undefined)[];
  /** Mean lap of the whole field, and its best, s. */
  meanLap: number;
  bestLap: number;
  /** Longest any kart sat stuck, s. */
  worstStuck: number;
  /** Per kart per race, field average: falls (respawns) and squashes by hazards (Thwomps). */
  fallsPerKart: number;
  crushesPerKart: number;
  /** Drifts started, glides opened, coins picked up and spin boosts, per kart per lap. */
  driftsPerLap: number;
  glidesPerLap: number;
  coinsPerLap: number;
  spinBoostsPerLap: number;
}

function meshTrack(trackId: string): MeshTrackDef {
  const track = getTrack(trackId);
  if (track.kind !== 'mesh') throw new Error(`${trackId} isn't a mesh track`);
  return track;
}

/** One all-AI race (8 karts, items on) on a mesh course, measured. */
export function mk8AiRace(
  trackId: string,
  seed: number,
  engineClass: EngineClass = 150,
): Mk8AiRaceResult {
  meshTrack(trackId);
  let s: SimState = allAiRace(seed, trackId, 8, engineClass);
  const stuckFor = s.karts.map(() => 0);
  let worstStuck = 0;
  let falls = 0;
  let crushes = 0;
  let drifts = 0;
  let glides = 0;
  let coins = 0;
  let spinBoosts = 0;
  while (s.karts.some((k) => k.race.finishTick === undefined)) {
    const result = step(s, [NEUTRAL_INPUT]);
    s = result.state;
    for (const e of result.events) {
      if (e.type === 'respawn') falls += 1;
      else if (e.type === 'kartHit' && e.by === HAZARD_HITTER && e.kind === 'hazard') crushes += 1;
      else if (e.type === 'driftStart') drifts += 1;
      else if (e.type === 'glideOpen') glides += 1;
      else if (e.type === 'coin') coins += 1;
      else if (e.type === 'spinBoost') spinBoosts += 1;
    }
    if (s.phase !== 'racing') continue;
    for (const kart of s.karts) {
      const excused =
        kart.race.finishTick !== undefined || kart.spinTimer > 0 || kart.respawnTimer > 0;
      stuckFor[kart.id] =
        !excused && Math.abs(kart.speed) < STUCK_SPEED ? (stuckFor[kart.id] ?? 0) + DT : 0;
      worstStuck = Math.max(worstStuck, stuckFor[kart.id] ?? 0);
    }
    if ((s.tick - s.race.goTick) * DT > RACE_LIMIT) break;
  }
  const laps = s.karts.flatMap((k) => k.race.lapTimes);
  const n = s.karts.length;
  return {
    trackId,
    seed,
    engineClass,
    raceTimes: s.karts.map((k) =>
      k.race.finishTick === undefined ? undefined : k.race.lapTimes.reduce((a, b) => a + b, 0),
    ),
    meanLap: laps.reduce((a, b) => a + b, 0) / Math.max(1, laps.length),
    bestLap: Math.min(...laps),
    worstStuck,
    fallsPerKart: falls / n,
    crushesPerKart: crushes / n,
    driftsPerLap: drifts / Math.max(1, laps.length),
    glidesPerLap: glides / Math.max(1, laps.length),
    coinsPerLap: coins / Math.max(1, laps.length),
    spinBoostsPerLap: spinBoosts / Math.max(1, laps.length),
  };
}

/**
 * A flying lap of the scripted autopilot (full throttle on the route's centreline, the player's
 * `__game` autopilot): one kart from the start line rolling, timed over its second lap, s.
 */
export function autopilotLap(trackId: string, engineClass: EngineClass = 150): number {
  const track = meshTrack(trackId);
  const geometry = routeGeometry(track.route);
  const frame = geometry.frameAt(0);
  let s = createSimState({
    seed: 1,
    trackId,
    engineClass,
    itemsOn: false,
    karts: [{ position: frame.position, heading: headingOf(frame.tangent, 0), up: frame.up }],
  });
  const stuck = { stuckTime: 0, recoverTime: 0 };
  // Laps are counted from the line: the first is the run-up, the second is timed.
  const lapStarts: number[] = [];
  let lastT = 0;
  for (let i = 0; i < 600 / DT && lapStarts.length < 2; i += 1) {
    const kart = s.karts[0];
    if (!kart) break;
    s = step(s, [meshAutopilotInput(kart, track, engineClass, 1, stuck)]).state;
    const t = geometry.project(s.karts[0]?.position ?? kart.position, lastT).t;
    if (lastT > 0.9 && t < 0.1) lapStarts.push(s.tick);
    lastT = t;
  }
  const [a, b] = lapStarts;
  return a !== undefined && b !== undefined ? (b - a) * DT : Infinity;
}

/** The ticket's targets (MK-128), per course and engine class. */
export const MK8_AI_TARGETS = {
  /** Nobody stuck longer, s. */
  maxStuck: 5,
  /** Falls and Thwomp squashes per kart per race, field average, at most. */
  maxFallsPerKart: 1,
  maxCrushesPerKart: 1,
  /** The field's mean lap over the scripted autopilot's lap, at most. */
  maxLapOverAutopilot: 1.15,
} as const;

/** One course's AI pass line: its seeded races and the autopilot's lap, summed up. */
export interface Mk8AiPassSummary {
  trackId: string;
  engineClass: EngineClass;
  autopilotLap: number;
  meanLap: number;
  worstStuck: number;
  fallsPerKart: number;
  crushesPerKart: number;
  driftsPerLap: number;
  glidesPerLap: number;
  coinsPerLap: number;
  spinBoostsPerLap: number;
  unfinished: number;
}

/** `seeds` all-AI races and the autopilot's lap on a registered mesh course, summed up. */
export function mk8AiPass(
  trackId: string,
  seeds: number,
  engineClass: EngineClass,
): Mk8AiPassSummary {
  const races = Array.from({ length: seeds }, (_, i) => mk8AiRace(trackId, i + 1, engineClass));
  const mean = (f: (r: Mk8AiRaceResult) => number) =>
    races.reduce((a, r) => a + f(r), 0) / Math.max(1, races.length);
  return {
    trackId,
    engineClass,
    autopilotLap: autopilotLap(trackId, engineClass),
    meanLap: mean((r) => r.meanLap),
    worstStuck: Math.max(...races.map((r) => r.worstStuck)),
    fallsPerKart: mean((r) => r.fallsPerKart),
    crushesPerKart: mean((r) => r.crushesPerKart),
    driftsPerLap: mean((r) => r.driftsPerLap),
    glidesPerLap: mean((r) => r.glidesPerLap),
    coinsPerLap: mean((r) => r.coinsPerLap),
    spinBoostsPerLap: mean((r) => r.spinBoostsPerLap),
    unfinished: races.reduce((a, r) => a + r.raceTimes.filter((t) => t === undefined).length, 0),
  };
}
