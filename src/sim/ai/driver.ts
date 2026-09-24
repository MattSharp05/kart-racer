import { kartPhysics } from '../kartStats';
import { clamp, wrapAngleDelta } from '../math';
import type { TrackGeometry } from '../splineTrack';
import { DT, tuning, type EngineClass } from '../tuning';
import { NEUTRAL_INPUT, type AiState, type InputFrame, type KartState } from '../types';
import { lineOffsetAt } from './racingLine';

/**
 * The AI driver (MK-14): steers at a point ahead on the racing line (pure pursuit), lifts or brakes
 * for corners too tight for its speed, and backs out when stuck. Produces an ordinary InputFrame;
 * AI karts go through exactly the same physics as the player.
 */
export function aiInput(
  kart: KartState,
  ai: AiState,
  geometry: TrackGeometry,
  line: readonly number[],
  engineClass: EngineClass,
  racing: boolean,
): InputFrame {
  const cfg = tuning.ai;

  // Stuck against something: back up, steering the other way, for a moment.
  if (racing) {
    ai.stuckTime = Math.abs(kart.speed) < cfg.stuckSpeed ? ai.stuckTime + DT : 0;
    if (ai.stuckTime > cfg.stuckSeconds && ai.recoverTime === 0)
      ai.recoverTime = cfg.recoverSeconds;
  }
  if (ai.recoverTime > 0) {
    ai.recoverTime = Math.max(0, ai.recoverTime - DT);
    if (ai.recoverTime === 0) ai.stuckTime = 0;
    const steer = aimError(kart, geometry, line, ai, 8) > 0 ? 1 : -1;
    return { ...NEUTRAL_INPUT, brake: 1, steer };
  }

  const speed = Math.max(0, kart.speed);
  const lookAhead = cfg.lookAheadBase + speed * cfg.lookAheadPerSpeed;
  const error = aimError(kart, geometry, line, ai, lookAhead);
  let steer = clamp(-error * cfg.steerGain, -1, 1);

  // Corner speed: v = sqrt(grip / curvature) for the tightest bit of line ahead.
  const top = kartPhysics(kart.kartType, engineClass).topSpeed * (ai.speedScale ?? 1);
  const here = geometry.project(kart.position).s;

  // Drifting (MK-15): hop into a drift for tight corners, hold it for a mini-turbo.
  const drift =
    racing && wantsDrift(kart, ai, geometry, line, here, speed, top, engineClass, error);
  if (drift && !kart.driftHeld) steer = error > 0 ? -1 : 1; // full lock on the press picks the side
  const curvature = maxCurvatureAhead(geometry, line, here, cfg.brakeHorizon);
  const cornerSpeed =
    curvature > 1e-4 ? Math.sqrt((cfg.cornerGrip * ai.skill) / curvature) : Infinity;
  // AI cruises a little below top speed (90–95% by skill) so a good player can beat it.
  const cruise = top * (tuning.ai.cruiseBase + tuning.ai.cruiseSkill * ai.skill);
  const target = Math.min(cruise, cornerSpeed);
  if (speed > target + 2 && !drift) return { ...NEUTRAL_INPUT, brake: 0.6, steer };
  if (speed > target) return { ...NEUTRAL_INPUT, steer, drift };
  return { ...NEUTRAL_INPUT, throttle: 1, steer, drift };
}

/**
 * Whether the AI holds the drift button this tick. Starts a drift when the racing line ahead
 * curves tighter than `driftCurvature`; lets go once it has the mini-turbo tier it's after and the
 * corner opens up, or early if the kart is swinging past its line.
 */
function wantsDrift(
  kart: KartState,
  ai: AiState,
  geometry: TrackGeometry,
  line: readonly number[],
  here: number,
  speed: number,
  top: number,
  engineClass: EngineClass,
  error: number,
): boolean {
  const cfg = tuning.ai;
  const curvature = maxCurvatureAhead(geometry, line, here, cfg.driftLookAhead);
  if (ai.drifting) {
    const direction = kart.drift.direction;
    // Pressed, but no drift came of it (too slow / not steering hard enough): let go.
    const fizzled = direction === 0 && kart.grounded && kart.driftHeld;
    const targetTier = engineClass === 150 && ai.skill >= cfg.driftTier3Skill ? 3 : 2;
    const overRotating = direction !== 0 && error * direction > cfg.driftOverRotation;
    const opened = curvature < cfg.driftExitCurvature && kart.drift.tier >= 1;
    const done = kart.drift.tier >= targetTier && curvature < cfg.driftCurvature;
    ai.drifting = !(fizzled || overRotating || opened || done);
    return ai.drifting;
  }
  if (
    curvature > cfg.driftCurvature &&
    speed >= cfg.driftMinSpeed * top &&
    kart.grounded &&
    !kart.driftHeld
  ) {
    ai.drifting = true;
    return true;
  }
  return false;
}

/** The racing-line point the AI is steering at right now (for the `?ai-debug=1` overlay). */
export function aiTargetPoint(
  kart: KartState,
  ai: AiState,
  geometry: TrackGeometry,
  line: readonly number[],
) {
  const distance = tuning.ai.lookAheadBase + Math.max(0, kart.speed) * tuning.ai.lookAheadPerSpeed;
  const t = (geometry.project(kart.position).s + distance) / geometry.length;
  return geometry.pointAt(t, lineOffsetAt(line, t) + ai.lineOffset + (ai.steerOffset ?? 0));
}

/** Heading error (rad) to the racing-line point `distance` m ahead. Positive = target is to the left. */
function aimError(
  kart: KartState,
  geometry: TrackGeometry,
  line: readonly number[],
  ai: AiState,
  distance: number,
): number {
  const s = geometry.project(kart.position).s + distance;
  const t = s / geometry.length;
  const target = geometry.pointAt(t, lineOffsetAt(line, t) + ai.lineOffset + (ai.steerOffset ?? 0));
  const desired = Math.atan2(-(target.x - kart.position.x), -(target.z - kart.position.z));
  return wrapAngleDelta(desired - kart.heading);
}

/** Largest curvature (1/m) of the racing line over the next `horizon` metres. */
export function maxCurvatureAhead(
  geometry: TrackGeometry,
  line: readonly number[],
  s: number,
  horizon: number,
): number {
  const step = 6;
  let max = 0;
  const point = (d: number) => {
    const t = (s + d) / geometry.length;
    return geometry.pointAt(t, lineOffsetAt(line, t));
  };
  for (let d = 0; d < horizon; d += step) {
    const a = point(d);
    const b = point(d + step);
    const c = point(d + 2 * step);
    const h1 = Math.atan2(b.x - a.x, b.z - a.z);
    const h2 = Math.atan2(c.x - b.x, c.z - b.z);
    max = Math.max(max, Math.abs(wrapAngleDelta(h2 - h1)) / step);
  }
  return max;
}
