import { kartPhysics } from '../kartStats';
import { clamp, wrapAngleDelta } from '../math';
import { inRange, type TrackGeometry } from '../splineTrack';
import { surfaceEffect } from '../surfaces';
import { DT, tuning, type EngineClass } from '../tuning';
import { NEUTRAL_INPUT, type AiState, type InputFrame, type KartState } from '../types';
import { curvatureAlong } from './curvature';
import { crusherSpeedLimit } from './hazards';
import { lineOffsetAt } from './racingLine';
import { aiRoute, routeAim } from './routes';

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
  /** The sim tick, to time the track's crushers (MK-62); without it they're ignored. */
  tick?: number,
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
  const top = kartPhysics(kart.kartType, engineClass).topSpeed * (ai.speedScale ?? 1);
  // Cruising speed = 90–95% of top by skill, so a good player can beat it.
  const cruise = top * (tuning.ai.cruiseBase + tuning.ai.cruiseSkill * ai.skill);

  // On another route round part of the lap (MK-61): follow it instead of the racing line.
  const route = racing ? aiRoute(kart, ai, geometry) : undefined;
  let steer: number;
  let drift = false;
  let cornerSpeed = Infinity;
  if (route) {
    ai.drifting = false;
    const aim = routeAim(kart, route, lookAhead, cfg.brakeHorizon);
    steer = clamp(-aim.error * cfg.steerGain, -1, 1);
    if (aim.curvature > 1e-4) cornerSpeed = Math.sqrt((cfg.cornerGrip * ai.skill) / aim.curvature);
  } else {
    const error = aimError(kart, geometry, line, ai, lookAhead);
    steer = clamp(-error * cfg.steerGain, -1, 1);

    // Corner speed: v = sqrt(grip / curvature) for the tightest bit of line ahead.
    const here = geometry.project(kart.position).s;

    // Drifting (MK-15): hop into a drift for tight corners, hold it for a mini-turbo.
    drift = racing && wantsDrift(kart, ai, geometry, line, here, speed, top, engineClass, error);
    if (drift && !kart.driftHeld) steer = error > 0 ? -1 : 1; // full lock on the press picks the side
    const curvature = maxCurvatureAhead(geometry, line, here, cfg.brakeHorizon);
    // On a slippery surface ahead (ice), corners are planned with its grip, so the AI slows before it.
    const grip =
      curvature > 1e-4
        ? minGripAhead(geometry, line, here, cfg.brakeHorizon) ** cfg.lowGripCaution
        : 1;
    if (curvature > 1e-4) cornerSpeed = Math.sqrt((cfg.cornerGrip * ai.skill * grip) / curvature);
  }
  const crusher = racing && tick !== undefined ? crusherSpeedLimit(kart, tick, geometry) : Infinity;
  const target = Math.min(cruise, cornerSpeed, crusher);
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

/**
 * Lowest surface grip (`sim/surfaces.ts`, 1 = road) on the racing line over the next `horizon`
 * metres, from the track's surface zones (MK-59: ice).
 */
export function minGripAhead(
  geometry: TrackGeometry,
  line: readonly number[],
  s: number,
  horizon: number,
): number {
  const zones = geometry.def.surfaceZones;
  let grip = 1;
  if (!zones.length) return grip;
  for (let d = 0; d <= horizon; d += GRIP_STEP) {
    const t = ((((s + d) / geometry.length) % 1) + 1) % 1;
    const lateral = lineOffsetAt(line, t);
    for (const zone of zones) {
      if (!inRange(t, zone) || lateral < zone.lateralMin || lateral > zone.lateralMax) continue;
      grip = Math.min(grip, surfaceEffect(zone.type).grip ?? 1);
    }
  }
  return grip;
}

/** Spacing of the surface checks along the line ahead, m. */
const GRIP_STEP = 6;

/** Largest curvature (1/m) of the racing line over the next `horizon` metres. */
export function maxCurvatureAhead(
  geometry: TrackGeometry,
  line: readonly number[],
  s: number,
  horizon: number,
): number {
  return curvatureAlong((d) => {
    const t = (s + d) / geometry.length;
    return geometry.pointAt(t, lineOffsetAt(line, t));
  }, horizon);
}
