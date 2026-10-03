// Gliders (MK-106, ADR 0011): leaving the ground from a glide ramp (a `glide` mesh surface, or a
// route `glide` zone) opens the kart's glider. While it glides, gravity is cut, the wing lifts in
// proportion to speed and vertical drag gives a steady sink; steering turns the flight, and the
// throttle/brake pitch between a faster dive and a longer float. Landing (or a wall) folds it.
// Numbers in `tuning.mk8.glide`; the glider's model and stats come from the loadout (MK-102).
import { cancelDrift } from './drift';
import { updateForwardSpeed } from './kart';
import {
  add,
  clamp,
  dot,
  length,
  normalize,
  orthonormal,
  rotateAbout,
  scale,
  sub,
  turnTowards,
  WORLD_UP,
  type Vec3,
} from './math';
import type { MeshSurface } from './meshTrack';
import { progressAt, routeGeometry, type RouteDef } from './route';
import { tuning } from './tuning';
import type { InputFrame, KartState, SimEvent } from './types';

/**
 * `tuning.mk8.glide`: off a glide ramp the kart flies on its glider. Gravity is cut and the wing
 * lifts in proportion to speed; vertical drag gives it a steady sink rate. Throttle dives (nose
 * down: sinks faster, gains speed), brake floats (nose up: sinks slower, loses speed). Speeds scale
 * with the kart's top speed, so every class glides the same shape.
 */
export interface GlideTuning {
  /** The glider unfolds over this long on launch (and folds as fast on landing), s. */
  openSeconds: number;
  /** Gravity while gliding, as a share of `tuning.gravity`. */
  gravityScale: number;
  /** Upward lift at top speed, as a share of `tuning.gravity` (proportional to speed). */
  lift: number;
  /** Vertical speed decays at this rate, 1/s: a steady sink instead of a fall. */
  verticalDrag: number;
  /** Diving adds this much downward pull (share of `tuning.gravity`) at full stick… */
  diveSink: number;
  /** …and gains speed at this share of top speed per second, up to `diveMaxSpeed` × top speed. */
  diveAccel: number;
  diveMaxSpeed: number;
  /** Floating lifts this much more (share of `tuning.gravity`) at full stick… */
  floatLift: number;
  /** …and loses speed at this share of top speed per second, down to `minSpeed` × top speed. */
  floatDrag: number;
  minSpeed: number;
  /** Pitch eases towards the stick at this rate, 1/s. */
  pitchRate: number;
  /** Turn rate while gliding, as a share of `tuning.maxYawRate` (× the kart's handling). */
  turnRate: number;
  /** Sideways slip dies away at this rate, 1/s: turns carry the flight round. */
  grip: number;
  /** The kart levels out (up towards +Y) at this rate while gliding, 1/s. */
  upTurnRate: number;
  /** A glide this long without landing counts as falling off the course, s. */
  fallSeconds: number;
  /**
   * A kart hopping off a glide ramp's lip glides too: in the air for less than this (a hop lasts
   * about a third of a second), with no ground within `lipReach` m under its centre and glide ramp
   * under its rear axle, s.
   */
  hopGrace: number;
  lipReach: number;
}

/** The glide numbers, typed (and checked) as `GlideTuning`. */
export const glideTuning = (): GlideTuning => tuning.mk8.glide;

/**
 * `tuning.mk8.glideAim` (MK-123): a glide off a ramp whose route zone has a `landing` is carried
 * there, like MK8's long glides up to higher ground: its height eases towards the landing's, so it
 * arrives the same way at every engine class. Steering and the pitch's speed change still work.
 */
export interface GlideAimTuning {
  /** It aims this far above the route at the landing, m. */
  clearance: number;
  /** Vertical speed eases towards the speed that reaches the aim at this rate, 1/s. */
  rate: number;
  /** Closer than this to the aim (or past it), m: it glides on freely and lands. */
  release: number;
}

export const glideAimTuning = (): GlideAimTuning => tuning.mk8.glideAim;

/** Whether lap fraction `t` is inside one of the route's glide zones (ranges may wrap past 0). */
export function inGlideZone(route: RouteDef, t: number): boolean {
  return route.zones.some((zone) => zone.kind === 'glide' && inRange(t, zone.from, zone.to));
}

/** Whether `t` is in `from`..`to` (a range may wrap past 0). */
const inRange = (t: number, from: number, to: number): boolean =>
  from <= to ? t >= from && t <= to : t >= from || t <= to;

/**
 * Whether a kart that just left the ground glides: it left from a `glide` surface, or inside a
 * route glide zone. `from` is where it left: its centre and, past a ramp's lip with only its rear
 * wheels still on it, its rear axle, with the surface under each (if any).
 */
export function launchesGlide(
  route: RouteDef,
  kart: KartState,
  from: readonly { position: Vec3; surface: MeshSurface | undefined }[],
): boolean {
  if (from.some((p) => p.surface === 'glide')) return true;
  if (!route.zones.some((zone) => zone.kind === 'glide')) return false;
  // Its last safe spot on the route (updated every grounded tick) is a good projection hint.
  const hint = kart.lastSafeT >= 0 ? kart.lastSafeT : undefined;
  return from.some((p) => inGlideZone(route, progressAt(route, p.position, hint)));
}

/**
 * Where a glide launched here is carried to (MK-123): above the route at the `landing` of the glide
 * zone the kart is in, if that zone has one.
 */
export function glideAim(route: RouteDef, kart: KartState): Vec3 | undefined {
  const zones = route.zones.flatMap((z) => (z.kind === 'glide' && z.landing !== undefined ? [z] : []));
  if (zones.length === 0) return undefined;
  const hint = kart.lastSafeT >= 0 ? kart.lastSafeT : undefined;
  const t = progressAt(route, kart.position, hint);
  const zone = zones.find((z) => inRange(t, z.from, z.to));
  if (zone?.landing === undefined) return undefined;
  const frame = routeGeometry(route).frameAt(zone.landing);
  return add(frame.position, scale(frame.up, glideAimTuning().clearance));
}

/**
 * Opens the glider: a drift in progress ends (no mini-turbo), the pitch starts level. `aim`: where
 * the flight is carried to (`glideAim`).
 */
export function startGlide(kart: KartState, events: SimEvent[], aim?: Vec3): void {
  cancelDrift(kart, events);
  kart.glide = aim ? { time: 0, pitch: 0, aim } : { time: 0, pitch: 0 };
  events.push({ type: 'glideOpen', kartId: kart.id });
}

/** Folds the glider (landing, or a wall); the kart falls with normal gravity from here. */
export function endGlide(kart: KartState, events: SimEvent[]): void {
  if (!kart.glide) return;
  delete kart.glide;
  events.push({ type: 'glideClose', kartId: kart.id });
}

/** The stick's pitch: +1 dive (throttle), −1 float (brake), 0 level (neither, or both). */
export function pitchInput(input: InputFrame): number {
  return clamp(input.throttle, 0, 1) - clamp(input.brake, 0, 1);
}

/** What a gliding kart's frame and velocity become this tick. */
export interface GlideStep {
  velocity: Vec3;
  forward: Vec3;
  up: Vec3;
}

/**
 * One tick of flight for a gliding kart (in the air, `kart.glide` set): steering yaws it about
 * world up, the pitch trades height for speed, and its velocity is split into speed along its
 * level facing, sideways slip (dies away) and world-vertical speed (lift, cut gravity, drag).
 * Mutates `kart.glide` (time, pitch).
 */
export function glideStep(
  kart: KartState,
  input: InputFrame,
  forward: Vec3,
  up: Vec3,
  topSpeed: number,
  handling: number,
  dt: number,
): GlideStep {
  const g = glideTuning();
  const glide = kart.glide ?? { time: 0, pitch: 0 };
  glide.time += dt;
  glide.pitch += (pitchInput(input) - glide.pitch) * (1 - Math.exp(-g.pitchRate * dt));
  kart.glide = glide;

  // Level out, then turn: a yaw about world up.
  const levelUp = turnTowards(up, WORLD_UP, 1 - Math.exp(-g.upTurnRate * dt), forward);
  let facing = level(forward);
  const yaw = -clamp(input.steer, -1, 1) * tuning.maxYawRate * g.turnRate * handling;
  facing = normalize(rotateAbout(facing, WORLD_UP, yaw * dt));

  // Split the velocity: along the level facing, sideways (level), vertical.
  const v = kart.velocity;
  const vy = v.y;
  const along = dot(v, facing);
  const sideways = sub(v, add(scale(facing, along), { x: 0, y: vy, z: 0 }));

  // Speed: a boost still pushes; diving gains speed, floating bleeds it.
  let speed =
    kart.boostTimer > 0
      ? updateForwardSpeed(
          along,
          { ...input, throttle: 1, brake: 0 },
          topSpeed * tuning.boostSpeed,
          dt,
          tuning.boostAccelRate,
        )
      : along;
  const pitch = glide.pitch;
  if (pitch > 0) {
    const cap = Math.max(along, topSpeed * g.diveMaxSpeed);
    speed = Math.min(cap, speed + pitch * g.diveAccel * topSpeed * dt);
  } else if (pitch < 0) {
    const floor = Math.min(along, topSpeed * g.minSpeed);
    speed = Math.max(floor, speed + pitch * g.floatDrag * topSpeed * dt);
  }

  // Height: cut gravity against lift that grows with speed, plus the pitch, under drag.
  const gravity = tuning.gravity;
  const speedShare = clamp(speed / topSpeed, 0, 2);
  const accel =
    -gravity * g.gravityScale +
    gravity * g.lift * speedShare -
    gravity * g.diveSink * Math.max(0, pitch) +
    gravity * g.floatLift * Math.max(0, -pitch);
  let newVy = (vy + accel * dt) * Math.exp(-g.verticalDrag * dt);
  // Carried to a landing (MK-123): the vertical speed that gets there at this speed, eased in.
  if (glide.aim) {
    const a = glideAimTuning();
    const to = sub(glide.aim, kart.position);
    const ahead = to.x * facing.x + to.z * facing.z;
    if (ahead > a.release && speed > 0) {
      const want = to.y / (Math.hypot(to.x, to.z) / speed);
      newVy = vy + (want - vy) * (1 - Math.exp(-a.rate * dt));
    } else delete glide.aim;
  }

  const slip = scale(sideways, Math.exp(-g.grip * dt));
  const velocity = add(add(scale(facing, speed), slip), { x: 0, y: newVy, z: 0 });
  return { velocity, forward: forwardAlong(facing, levelUp), up: levelUp };
}

/** Below this `up.y` (a kart launched off a wall) the frame can't keep its facing exactly. */
const STEEP_UP_Y = 0.05;

/**
 * The kart's forward for level `facing` under `up`: perpendicular to `up` and pointing exactly
 * along `facing` seen from above, so the next tick's facing (`level(forward)`) is this one. (Just
 * making `facing` perpendicular to a tilted `up` swings it sideways, and tick after tick that
 * turned karts launched off a steep slope right round, MK-106.)
 */
function forwardAlong(facing: Vec3, up: Vec3): Vec3 {
  if (up.y < STEEP_UP_Y) {
    const f = orthonormal(facing, up);
    return length(f) > 0.5 ? f : facing;
  }
  return normalize({ x: facing.x, y: -dot(facing, up) / up.y, z: facing.z });
}

/** `v` with its vertical part removed, normalized (−Z if `v` is vertical). */
function level(v: Vec3): Vec3 {
  const flat = { x: v.x, y: 0, z: v.z };
  return length(flat) > 1e-6 ? normalize(flat) : { x: 0, y: 0, z: -1 };
}
