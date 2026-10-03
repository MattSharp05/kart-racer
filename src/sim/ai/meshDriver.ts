// The AI driver on mesh tracks (MK-105): pure pursuit along the route's racing line in the kart's
// own surface plane, so it follows walls and ceilings as it follows a flat road, and lifts or
// brakes for corners too tight for its speed. Anti-gravity, glide and item finesse belong to the
// MK8 AI ticket (MK-128); this one must get round without getting stuck.
import { kartPhysics } from '../kartStats';
import { clamp, cross, dot, sub, type Vec3 } from '../math';
import type { MeshTrackDef } from '../meshTrack';
import { routeGeometry, type RouteGeometry } from '../route';
import { rightOf } from '../surfaceKart';
import { DT, tuning, type EngineClass } from '../tuning';
import { NEUTRAL_INPUT, type AiState, type InputFrame, type KartState } from '../types';

/** The kart's progress along the route, searched near its last lap fraction. */
function hereOn(geometry: RouteGeometry, kart: KartState): number {
  const hint = kart.race.lastT >= 0 ? kart.race.lastT : undefined;
  return geometry.project(kart.position, hint).s;
}

/** Steering towards `target` in the kart's plane: +1 full right, −1 full left. */
function steerTowards(kart: KartState, target: Vec3, gain: number): number {
  const up = kart.up ?? { x: 0, y: 1, z: 0 };
  const forward = kart.forward ?? { x: 0, y: 0, z: -1 };
  const to = sub(target, kart.position);
  const ahead = dot(to, forward);
  const right = dot(to, rightOf(forward, up));
  return clamp(Math.atan2(right, ahead) * gain, -1, 1);
}

/** The point `lookAhead` m further along the route, `lateral` m right of the centreline (clamped). */
function aimPoint(geometry: RouteGeometry, s: number, lookAhead: number, lateral: number): Vec3 {
  const t = (s + lookAhead) / geometry.length;
  const room = Math.max(0, geometry.frameAt(t).width / 2 - tuning.kartHalfWidth);
  return geometry.frameAt(t, clamp(lateral, -room, room)).position;
}

/**
 * The tightest turn on the route between `s` and `s + horizon`, 1/m: how fast the direction
 * turns about the road's up (climbing onto a wall bends the route, but isn't a corner).
 */
export function maxTurnAhead(geometry: RouteGeometry, s: number, horizon: number): number {
  const step = tuning.meshAi.curvatureStep;
  let worst = 0;
  for (let d = 0; d < horizon; d += step) {
    const a = geometry.frameAt((s + d) / geometry.length);
    const b = geometry.frameAt((s + d + step) / geometry.length);
    const turn = Math.abs(dot(cross(a.tangent, b.tangent), a.up)) / step;
    worst = Math.max(worst, turn);
  }
  return worst;
}

/** One tick of an AI kart on a mesh track. */
export function meshAiInput(
  kart: KartState,
  ai: AiState,
  track: MeshTrackDef,
  engineClass: EngineClass,
  racing: boolean,
): InputFrame {
  const cfg = tuning.ai;
  const geometry = routeGeometry(track.route);
  const s = hereOn(geometry, kart);

  // Wedged somewhere backing out doesn't fix (off the course, under a bridge): Lakitu.
  ai.slowTime =
    racing && Math.abs(kart.speed) < tuning.meshAi.slowSpeed ? (ai.slowTime ?? 0) + DT : 0;
  if (ai.slowTime > tuning.meshAi.respawnAfter) {
    ai.slowTime = 0;
    return { ...NEUTRAL_INPUT, respawn: true };
  }
  const backing = recovering(kart, ai, geometry, s, racing);
  if (backing) return backing;

  const speed = Math.max(0, kart.speed);
  const lookAhead = cfg.lookAheadBase + speed * cfg.lookAheadPerSpeed;
  const lateral = geometry.racingLineAt(s + lookAhead) + ai.lineOffset;
  const steer = steerTowards(kart, aimPoint(geometry, s, lookAhead, lateral), cfg.steerGain);

  const physics = kartPhysics(kart.kartType, engineClass);
  const top = physics.topSpeed * (ai.speedScale ?? 1);
  const cruise = top * (cfg.cruiseBase + cfg.cruiseSkill * ai.skill);
  return {
    ...pedals(geometry, s, speed, cruise, ai.skill * physics.handling ** cfg.cornerHandling),
    steer,
  };
}

/** A driver's stuck counters (an AI's own; the autopilot's are its caller's). */
export type StuckState = Pick<AiState, 'stuckTime' | 'recoverTime'>;

/** Stuck against something: back up, steering the other way, for a moment. Null: drive on. */
function recovering(
  kart: KartState,
  stuck: StuckState,
  geometry: RouteGeometry,
  s: number,
  racing: boolean,
): InputFrame | null {
  const cfg = tuning.ai;
  if (racing) {
    stuck.stuckTime = Math.abs(kart.speed) < cfg.stuckSpeed ? stuck.stuckTime + DT : 0;
    if (stuck.stuckTime > cfg.stuckSeconds && stuck.recoverTime === 0)
      stuck.recoverTime = cfg.recoverSeconds;
  }
  if (stuck.recoverTime === 0) return null;
  stuck.recoverTime = Math.max(0, stuck.recoverTime - DT);
  if (stuck.recoverTime === 0) stuck.stuckTime = 0;
  const steer = steerTowards(kart, aimPoint(geometry, s, cfg.lookAheadBase, 0), 1) > 0 ? -1 : 1;
  return { ...NEUTRAL_INPUT, brake: 1, steer };
}

/** Throttle up to `cruise`, lifting and braking for the corners ahead (grip × `gripScale`). */
function pedals(
  geometry: RouteGeometry,
  s: number,
  speed: number,
  cruise: number,
  gripScale: number,
): InputFrame {
  const m = tuning.meshAi;
  const horizon = Math.min(tuning.ai.brakeHorizon, m.horizonBase + speed * m.horizonPerSpeed);
  const turn = maxTurnAhead(geometry, s, horizon);
  const cornerSpeed = turn > 0 ? Math.sqrt((tuning.ai.cornerGrip * gripScale) / turn) : Infinity;
  const target = Math.min(cruise, cornerSpeed);
  const brake = speed > target * m.brakeOver ? 1 : 0;
  return { ...NEUTRAL_INPUT, throttle: speed < target && brake === 0 ? 1 : 0, brake };
}

/**
 * The centreline follower on a mesh track: finished karts drive on with it, and tests and the
 * `__game` autopilot drive the player's kart with it. With `stuck` (counters the caller keeps per
 * kart) it backs out when wedged, as the AI does.
 */
export function meshAutopilotInput(
  kart: KartState,
  track: MeshTrackDef,
  engineClass: EngineClass,
  throttle = 1,
  stuck?: StuckState,
): InputFrame {
  const geometry = routeGeometry(track.route);
  const s = hereOn(geometry, kart);
  const backing = stuck ? recovering(kart, stuck, geometry, s, true) : null;
  if (backing) return backing;
  const speed = Math.max(0, kart.speed);
  const lookAhead = tuning.ai.lookAheadBase + speed * tuning.ai.lookAheadPerSpeed;
  const steer = steerTowards(kart, aimPoint(geometry, s, lookAhead, 0), tuning.ai.steerGain);
  const physics = kartPhysics(kart.kartType, engineClass);
  const drive = pedals(geometry, s, speed, physics.topSpeed * throttle, physics.handling);
  return { ...drive, steer };
}
