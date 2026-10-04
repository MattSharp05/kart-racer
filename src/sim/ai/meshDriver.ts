// The AI driver on mesh tracks (MK-105): pure pursuit along the route's racing line in the kart's
// own surface plane, so it follows walls and ceilings as it follows a flat road, and lifts or
// brakes for corners too tight for its speed. Anti-gravity, glide and item finesse belong to the
// MK8 AI ticket (MK-128); this one must get round without getting stuck.
import { kartPhysics } from '../kartStats';
import { clamp, cross, dot, sub, type Vec3 } from '../math';
import type { MeshTrackDef } from '../meshTrack';
import { routeGeometry, type RouteGeometry } from '../route';
import { rightOf } from '../surfaceKart';
import { meshCrusherSpeedLimit } from './hazards';
import { DT, tuning, type EngineClass } from '../tuning';
import {
  NEUTRAL_INPUT,
  type AiState,
  type InputFrame,
  type KartState,
  type SimState,
} from '../types';
import { wantsDrift } from './driver';
import { glidePitch, glideRampLine, meshTacticOffset, minWidthAhead } from './meshTactics';

/** The kart's progress along the route, searched near its last lap fraction. */
function hereOn(geometry: RouteGeometry, kart: KartState): number {
  const hint = kart.race.lastT >= 0 ? kart.race.lastT : undefined;
  return geometry.project(kart.position, hint).s;
}

/**
 * The angle to `target` in the kart's own surface plane (projected onto it: walls and ceilings
 * like flat road), radians, positive to the right.
 */
function aimAngle(kart: KartState, target: Vec3): number {
  const up = kart.up ?? { x: 0, y: 1, z: 0 };
  const forward = kart.forward ?? { x: 0, y: 0, z: -1 };
  const to = sub(target, kart.position);
  return Math.atan2(dot(to, rightOf(forward, up)), dot(to, forward));
}

/** Steering towards `target` in the kart's plane: +1 full right, −1 full left. */
function steerTowards(kart: KartState, target: Vec3, gain: number): number {
  return clamp(aimAngle(kart, target) * gain, -1, 1);
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

/**
 * One tick of an AI kart on a mesh track. With `tick`, it times the course's crushers (MK-124:
 * Thwomps), slowing to pass under each one while it's up.
 */
export function meshAiInput(
  kart: KartState,
  ai: AiState,
  track: MeshTrackDef,
  engineClass: EngineClass,
  racing: boolean,
  tick?: number,
  /** The race (MK-128): coins and the other karts, for its tactics; without it, none. */
  state?: SimState,
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
  const target = meshAimPoint(kart, ai, track, geometry, s, lookAhead, racing, state);
  const angle = aimAngle(kart, target);
  let steer = clamp(angle * cfg.steerGain, -1, 1);

  const physics = kartPhysics(kart.kartType, engineClass, kart.loadout);
  const top = physics.topSpeed * (ai.speedScale ?? 1);
  const cruise = top * (cfg.cruiseBase + cfg.cruiseSkill * ai.skill);
  const crusher =
    racing && tick !== undefined && track.hazards?.length
      ? meshCrusherSpeedLimit(kart, tick, track, kart.race.lastT >= 0 ? kart.race.lastT : undefined)
      : Infinity;
  // On the glider (MK-106): dive to land where there's ground below, float over a gap (MK-128).
  if (kart.glide !== undefined) {
    ai.drifting = false;
    return { ...NEUTRAL_INPUT, ...glidePitch(kart, track), steer };
  }

  // Drifting (MK-128): as on spline tracks (`wantsDrift`), with the route's turns about the road's
  // up, so it drifts round anti-gravity and underwater corners like any other; not on a narrow
  // strip (`courseAi.minWidth`).
  const error = -angle;
  const roomy = minWidthAhead(geometry, s, cfg.driftLookAhead) >= tuning.mk8.courseAi.minWidth;
  if (!roomy) ai.drifting = false;
  const drift =
    racing &&
    roomy &&
    wantsDrift(
      kart,
      ai,
      maxTurnAhead(geometry, s, cfg.driftLookAhead),
      speed,
      top,
      engineClass,
      error,
    );
  if (drift && !kart.driftHeld) steer = error > 0 ? -1 : 1; // full lock on the press picks the side
  const drive = pedals(
    geometry,
    s,
    speed,
    Math.min(cruise, crusher),
    ai.skill * physics.handling ** cfg.cornerHandling,
  );
  // Never brake out of a drift: lift instead, as on spline tracks.
  if (drift) return { ...drive, brake: 0, drift: true, steer };
  return { ...drive, steer };
}

/**
 * Where the AI steers: `lookAhead` m along the route, on a glide ramp's middle on the way to one
 * (MK-128); else on the racing line plus where items take it (MK-129, `./meshItems.ts`: round a
 * banana, towards a box) or, failing those, a tactic (`./meshTactics.ts`: a coin, a spin-boost
 * bump).
 */
function meshAimPoint(
  kart: KartState,
  ai: AiState,
  track: MeshTrackDef,
  geometry: RouteGeometry,
  s: number,
  lookAhead: number,
  racing: boolean,
  state: SimState | undefined,
): Vec3 {
  const rampLine = glideRampLine(geometry, track, s + lookAhead);
  let offset = ai.steerOffset ?? 0;
  if (offset === 0 && racing && state && kart.glide === undefined) {
    const hint = kart.race.lastT >= 0 ? kart.race.lastT : undefined;
    offset = meshTacticOffset(kart, ai, state, geometry, geometry.project(kart.position, hint));
  }
  const lateral = rampLine ?? geometry.racingLineAt(s + lookAhead) + ai.lineOffset + offset;
  return aimPoint(geometry, s, lookAhead, lateral);
}

/** The point an AI kart on a mesh track is steering at right now (the `?ai-debug=1` overlay). */
export function meshAiTargetPoint(
  kart: KartState,
  ai: AiState,
  track: MeshTrackDef,
  state: SimState,
): Vec3 {
  const geometry = routeGeometry(track.route);
  const lookAhead = tuning.ai.lookAheadBase + Math.max(0, kart.speed) * tuning.ai.lookAheadPerSpeed;
  const racing = state.phase === 'racing';
  return meshAimPoint(kart, ai, track, geometry, hereOn(geometry, kart), lookAhead, racing, state);
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

/**
 * Throttle up to `cruise`, lifting and braking for the corners ahead (grip × `gripScale`). On a
 * glider (MK-106) braking would mean floating on past the corner: it holds the throttle (a dive)
 * to get back down sooner.
 */
function pedals(
  geometry: RouteGeometry,
  s: number,
  speed: number,
  cruise: number,
  gripScale: number,
  gliding = false,
): InputFrame {
  if (gliding) return { ...NEUTRAL_INPUT, throttle: 1 };
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
  const physics = kartPhysics(kart.kartType, engineClass, kart.loadout);
  const drive = pedals(
    geometry,
    s,
    speed,
    physics.topSpeed * throttle,
    physics.handling,
    kart.glide !== undefined,
  );
  return { ...drive, steer };
}
