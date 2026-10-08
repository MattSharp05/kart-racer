// Course checks (MK-105): a seeded race on a registered mesh course and a sweep of the route's
// centreline, for unit tests (the synthetic test ramp in CI, the real course with a local pack)
// and `pnpm mk8:course-check`. Pure: no pack loading here, the course is registered first.
import { meshAutopilotInput } from '../../../sim/ai/meshDriver';
import { HAZARD_HITTER } from '../../../sim/hazards';
import { add, scale, type Vec3 } from '../../../sim/math';
import { groundAt, raycastMesh, surfaceMask, type MeshTrackDef } from '../../../sim/meshTrack';
import { createRace, type RacerSlot } from '../../../sim/race/createRace';
import { routeGeometry } from '../../../sim/route';
import { inRange } from '../../../sim/splineTrack';
import { step } from '../../../sim/step';
import { getTrack } from '../../../sim/track';
import { DT, type EngineClass } from '../../../sim/tuning';
import type { InputFrame, SimState } from '../../../sim/types';
import { MK8_COURSE_SCALE, MK8_COURSES } from '.';

/** A kart slower than this, not being carried back, counts as stuck, m/s. */
const STUCK_SPEED = 1;
/** Races give up after this long, s. */
const RACE_TIME_LIMIT = 300;

export interface CourseRaceResult {
  seed: number;
  /** Race time of each kart (kart 0 is the player on the autopilot), s; undefined = didn't finish. */
  raceTimes: (number | undefined)[];
  /** Fastest lap of the race, s. */
  bestLap: number;
  /** Longest time any kart sat still while racing, s, and where. */
  worstStuck: number;
  stuckAt?: Vec3;
  /** Respawns of each kart. */
  respawns: number[];
  /** Times each kart was squashed by a hazard (MK-124: a Thwomp landing on it). */
  crushes: number[];
  /** Laps completed by kart 0. */
  playerLaps: number;
  /** Where karts that didn't finish ended up. */
  unfinished: { id: number; lap: number; at: Vec3 }[];
}

function meshTrack(trackId: string): MeshTrackDef {
  const track = getTrack(trackId);
  if (track.kind !== 'mesh') throw new Error(`${trackId} isn't a mesh track`);
  return track;
}

/**
 * A 3-lap race on `trackId`: the player (kart 0) on the route autopilot and 7 AI, items on, run
 * until everyone finishes (or the time limit).
 */
export function courseRace(
  trackId: string,
  seed: number,
  engineClass: EngineClass = 150,
  laps = 3,
): CourseRaceResult {
  const track = meshTrack(trackId);
  const racers: RacerSlot[] = [
    { kartId: 'maple', controller: 'local' },
    ...Array.from({ length: 7 }, (): RacerSlot => ({ kartId: 'maple', controller: 'ai' })),
  ];
  let state: SimState = createRace({ trackId, racers, engineClass, itemsOn: true, seed, laps });
  const still = state.karts.map(() => 0);
  const playerStuck = { stuckTime: 0, recoverTime: 0 };
  const respawns = state.karts.map(() => 0);
  const crushes = state.karts.map(() => 0);
  let worstStuck = 0;
  let stuckAt: Vec3 | undefined;
  for (let tick = 0; tick < RACE_TIME_LIMIT / DT; tick += 1) {
    const player = state.karts[0];
    const inputs: InputFrame[] = player
      ? [meshAutopilotInput(player, track, engineClass, 1, playerStuck)]
      : [];
    const result = step(state, inputs);
    state = result.state;
    for (const e of result.events) {
      if (e.type === 'respawn') respawns[e.kartId] = (respawns[e.kartId] ?? 0) + 1;
      if (e.type === 'kartHit' && e.by === HAZARD_HITTER && e.kind === 'hazard')
        crushes[e.kartId] = (crushes[e.kartId] ?? 0) + 1;
    }
    // Stuck counts until each kart finishes, after the player's finish too.
    if (state.phase === 'racing' || state.phase === 'finished') {
      for (const kart of state.karts) {
        const stopped =
          Math.abs(kart.speed) < STUCK_SPEED &&
          kart.respawnTimer === 0 &&
          kart.race.finishTick === undefined;
        still[kart.id] = stopped ? (still[kart.id] ?? 0) + DT : 0;
        if ((still[kart.id] ?? 0) > worstStuck) {
          worstStuck = still[kart.id] ?? 0;
          stuckAt = { ...kart.position };
        }
      }
    }
    if (state.karts.every((k) => k.race.finishTick !== undefined)) break;
  }
  const goTick = state.race.goTick;
  return {
    seed,
    raceTimes: state.karts.map((k) =>
      k.race.finishTick === undefined ? undefined : (k.race.finishTick - goTick) * DT,
    ),
    bestLap: Math.min(...state.karts.flatMap((k) => k.race.lapTimes)),
    worstStuck,
    ...(stuckAt ? { stuckAt } : {}),
    respawns,
    crushes,
    playerLaps: Math.min(laps, (state.karts[0]?.race.lap ?? 1) - 1),
    unfinished: state.karts
      .filter((k) => k.race.finishTick === undefined)
      .map((k) => ({ id: k.id, lap: k.race.lap, at: { ...k.position } })),
  };
}

const DRIVABLE = surfaceMask('road', 'offroad', 'boost', 'antigrav', 'glide');

/**
 * On a scaled MK8 course the centreline may run this × the scale off the road, m: the window the
 * kart's ground probe gave the authored routes at 1:1 (`conformRoute` takes most of it out).
 */
const SCALED_ROUTE_TOLERANCE = 1.5;

/**
 * Lap fractions (every metre of the route) where a kart on the centreline would find no drivable
 * ground under it, outside the route's respawn ranges (a jump's flight is one). On a scaled MK8
 * course (MK-105 revisit) "under it" is within the route's tolerance either way along its up.
 */
export function centrelineGaps(trackId: string): number[] {
  const track = meshTrack(trackId);
  const geometry = routeGeometry(track.route);
  const scaled = MK8_COURSES.some((c) => c.trackId === trackId);
  const reach = SCALED_ROUTE_TOLERANCE * MK8_COURSE_SCALE;
  const gaps: number[] = [];
  for (const sample of geometry.samples) {
    const t = sample.s / geometry.length;
    if (track.route.respawnPoints.some((r) => inRange(t, r))) continue;
    const found = scaled
      ? (raycastMesh(track.collision, sample.position, scale(sample.up, -1), reach, DRIVABLE) ??
        raycastMesh(track.collision, sample.position, sample.up, reach, DRIVABLE))
      : groundAt(track.collision, add(sample.position, scale(sample.up, 0.5)), sample.up, DRIVABLE);
    if (!found) gaps.push(t);
  }
  return gaps;
}
