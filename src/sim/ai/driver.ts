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
  const steer = clamp(-error * cfg.steerGain, -1, 1);

  // Corner speed: v = sqrt(grip / curvature) for the tightest bit of line ahead.
  const top = kartPhysics(kart.kartType, engineClass).topSpeed;
  const here = geometry.project(kart.position).s;
  const curvature = maxCurvatureAhead(geometry, line, here, cfg.brakeHorizon);
  const cornerSpeed =
    curvature > 1e-4 ? Math.sqrt((cfg.cornerGrip * ai.skill) / curvature) : Infinity;
  // AI cruises a little below top speed (90–95% by skill) so a good player can beat it.
  const cruise = top * (tuning.ai.cruiseBase + tuning.ai.cruiseSkill * ai.skill);
  const target = Math.min(cruise, cornerSpeed);
  if (speed > target + 2) return { ...NEUTRAL_INPUT, brake: 0.6, steer };
  if (speed > target) return { ...NEUTRAL_INPUT, steer };
  return { ...NEUTRAL_INPUT, throttle: 1, steer };
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
  const target = geometry.pointAt(t, lineOffsetAt(line, t) + ai.lineOffset);
  const desired = Math.atan2(-(target.x - kart.position.x), -(target.z - kart.position.z));
  return wrapAngleDelta(desired - kart.heading);
}

/** Largest curvature (1/m) of the racing line over the next `horizon` metres. */
function maxCurvatureAhead(
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
