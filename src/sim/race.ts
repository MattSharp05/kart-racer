import type { SplineTrackDef } from './splineTrack';
import { trackGeometry, type TrackDef } from './track';
import { DT, tuning } from './tuning';
import type { KartState, SimEvent, SimState } from './types';

/** Signed smallest difference b − a between two lap fractions, in (−0.5, 0.5]. */
function lapDelta(a: number, b: number): number {
  let d = b - a;
  if (d > 0.5) d -= 1;
  if (d <= -0.5) d += 1;
  return d;
}

/**
 * Whether moving from lap fraction `from` to `to` passes `mark` forwards (+1), backwards (−1) or not
 * at all (0). Only small moves count, so a teleport or a projection jump can't skip checkpoints.
 */
export function crossing(from: number, to: number, mark: number): -1 | 0 | 1 {
  const step = lapDelta(from, to);
  if (Math.abs(step) > tuning.checkpointWindow) return 0;
  const a = lapDelta(mark, from);
  const b = lapDelta(mark, to);
  if (a < 0 && b >= 0) return 1;
  if (a >= 0 && b < 0) return -1;
  return 0;
}

/** Race progress for ordering karts: completed laps plus how far round the current one. */
export function raceProgress(kart: KartState, t: number): number {
  return kart.race.lap - 1 + t;
}

function updateKartLaps(
  kart: KartState,
  track: SplineTrackDef,
  t: number,
  tick: number,
  events: SimEvent[],
): void {
  const race = kart.race;
  const checkpoints = track.checkpoints;
  if (race.lastT < 0) {
    race.lastT = t;
    return;
  }

  // Forwards past the next checkpoint (index 0 is the finish line).
  const next = checkpoints[race.nextCheckpoint] ?? 0;
  if (crossing(race.lastT, t, next) === 1) {
    if (race.nextCheckpoint === 0) {
      const lapTime = race.lap > 0 ? (tick - race.lapStartTick) * DT : undefined;
      if (lapTime !== undefined) race.lapTimes.push(lapTime);
      race.lap += 1;
      race.lapStartTick = tick;
      events.push({
        type: 'lap',
        kartId: kart.id,
        lap: race.lap,
        ...(lapTime !== undefined ? { lapTime } : {}),
      });
    } else {
      events.push({ type: 'checkpoint', kartId: kart.id, index: race.nextCheckpoint });
    }
    race.nextCheckpoint = (race.nextCheckpoint + 1) % checkpoints.length;
  }

  // Backwards past the checkpoint just passed: undo it, so reversing and re-crossing never double-counts.
  const previousIndex = (race.nextCheckpoint - 1 + checkpoints.length) % checkpoints.length;
  const previous = checkpoints[previousIndex] ?? 0;
  if (crossing(race.lastT, t, previous) === -1) {
    race.nextCheckpoint = previousIndex;
    if (previousIndex === 0) {
      race.lap = Math.max(0, race.lap - 1);
      const undone = race.lapTimes.pop();
      if (undone !== undefined) race.lapStartTick = tick - Math.round(undone / DT);
    }
  }
  race.lastT = t;
}

function updateWrongWay(kart: KartState, tangent: { x: number; z: number }, dt: number): void {
  const along = kart.velocity.x * tangent.x + kart.velocity.z * tangent.z;
  const race = kart.race;
  race.wrongWayTime = along < -tuning.wrongWaySpeed ? race.wrongWayTime + dt : 0;
  race.wrongWay = race.wrongWayTime >= tuning.wrongWaySeconds;
}

/**
 * Laps, checkpoints, wrong-way and race positions for every kart (MK-11). Runs after movement and
 * collisions each tick. Mutates `state` (called on the tick's cloned state).
 */
export function updateRace(state: SimState, track: TrackDef, events: SimEvent[], dt = DT): void {
  if (track.kind !== 'spline') return;
  const geometry = trackGeometry(track);
  const progress = new Map<number, number>();
  for (const kart of state.karts) {
    const p = geometry.project(kart.position);
    updateKartLaps(kart, track, p.t, state.tick, events);
    updateWrongWay(kart, p.tangent, dt);
    progress.set(kart.id, raceProgress(kart, p.t));
  }

  const byId = new Map(state.karts.map((k) => [k.id, k]));
  const positions = state.karts
    .map((k) => k.id)
    .sort((a, b) => {
      const fa = byId.get(a)?.race.finishTick;
      const fb = byId.get(b)?.race.finishTick;
      if (fa !== undefined || fb !== undefined) {
        if (fa === undefined) return 1;
        if (fb === undefined) return -1;
        if (fa !== fb) return fa - fb;
      }
      return (progress.get(b) ?? 0) - (progress.get(a) ?? 0) || a - b;
    });
  if (positions.some((id, i) => state.positions[i] !== id)) {
    events.push({ type: 'positionChange', positions });
  }
  state.positions = positions;
}

/** 1-based race position of a kart. */
export function positionOf(state: SimState, kartId: number): number {
  return state.positions.indexOf(kartId) + 1;
}
