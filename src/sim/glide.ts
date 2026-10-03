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
import { progressAt, type RouteDef } from './route';
import { tuning } from './tuning';
import type { InputFrame, KartState, SimEvent } from './types';

/** Whether lap fraction `t` is inside one of the route's glide zones (ranges may wrap past 0). */
export function inGlideZone(route: RouteDef, t: number): boolean {
  for (const zone of route.zones) {
    if (zone.kind !== 'glide') continue;
    const inside =
      zone.from <= zone.to ? t >= zone.from && t <= zone.to : t >= zone.from || t <= zone.to;
    if (inside) return true;
  }
  return false;
}

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

/** Opens the glider: a drift in progress ends (no mini-turbo), the pitch starts level. */
export function startGlide(kart: KartState, events: SimEvent[]): void {
  cancelDrift(kart, events);
  kart.glide = { time: 0, pitch: 0 };
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
  const g = tuning.mk8.glide;
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
  const newVy = (vy + accel * dt) * Math.exp(-g.verticalDrag * dt);

  const slip = scale(sideways, Math.exp(-g.grip * dt));
  const velocity = add(add(scale(facing, speed), slip), { x: 0, y: newVy, z: 0 });
  const frameForward = orthonormal(facing, levelUp);
  return {
    velocity,
    forward: length(frameForward) > 0.5 ? frameForward : facing,
    up: levelUp,
  };
}

/** `v` with its vertical part removed, normalized (−Z if `v` is vertical). */
function level(v: Vec3): Vec3 {
  const flat = { x: v.x, y: 0, z: v.z };
  return length(flat) > 1e-6 ? normalize(flat) : { x: 0, y: 0, z: -1 };
}
