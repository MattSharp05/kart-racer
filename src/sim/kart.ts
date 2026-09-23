import {
  add,
  clamp,
  dot,
  forwardFromHeading,
  rotateY,
  scale,
  sub,
  vec3,
  wrapAngleDelta,
  type Vec3,
} from './math';
import { cancelDrift, chargeDrift, driftYawRate, handleDriftButton, isDrifting } from './drift';
import { kartPhysics } from './kartStats';
import { groundAt, trackGeometry, type TrackDef } from './track';
import { tuning, type EngineClass } from './tuning';
import type { InputFrame, KartState, SimEvent } from './types';

/** Keeps an angle in (-π, π]. */
export function wrapAngle(angle: number): number {
  return wrapAngleDelta(angle);
}

/** Moves `value` towards `target` by at most `maxDelta`. */
function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}

/** Exponential approach rate that reaches 95% of the target in `timeTo95` seconds. */
function accelRate(timeTo95 = tuning.timeTo95): number {
  return Math.log(20) / timeTo95;
}

/** New forward speed from throttle/brake (arcade model, ADR 0002). */
export function updateForwardSpeed(
  speed: number,
  input: InputFrame,
  topSpeed: number,
  dt: number,
  rate = accelRate(),
  overspeedDecel = tuning.coastDecel,
): number {
  const blend = 1 - Math.exp(-rate * dt);
  const reverseTop = topSpeed * tuning.reverseFraction;

  if (input.brake > 0) {
    // Brake while rolling forward, then reverse once stopped.
    if (speed > 0) return approach(speed, 0, tuning.brakeDecel * input.brake * dt);
    const target = -reverseTop * input.brake;
    return speed > target ? speed + (target - speed) * blend : speed;
  }
  if (input.throttle > 0) {
    // Throttle while rolling backwards brakes first.
    if (speed < 0) return approach(speed, 0, tuning.brakeDecel * input.throttle * dt);
    const target = topSpeed * input.throttle;
    if (speed < target) return speed + (target - speed) * blend;
    return approach(speed, target, overspeedDecel * dt);
  }
  // Coasting above the (grass) top speed still sheds the excess quickly.
  if (speed > topSpeed) return approach(speed, topSpeed, overspeedDecel * dt);
  return approach(speed, 0, tuning.coastDecel * dt);
}

/** 0 at standstill, ramps to 1 by `steerFullAt`, eases to `steerAtTopSpeed` at top speed. */
export function steeringStrength(speed: number, topSpeed: number): number {
  const ratio = Math.abs(speed) / topSpeed;
  if (ratio < tuning.steerFullAt) return ratio / tuning.steerFullAt;
  const t = clamp((ratio - tuning.steerFullAt) / (1 - tuning.steerFullAt), 0, 1);
  return 1 + (tuning.steerAtTopSpeed - 1) * t;
}

/** Advances one kart by one tick. Mutates and returns `kart` (called on a cloned state). */
export function updateKart(
  kart: KartState,
  input: InputFrame,
  engineClass: EngineClass,
  track: TrackDef,
  dt: number,
  events: SimEvent[],
): KartState {
  const physics = kartPhysics(kart.kartType, engineClass);
  const { topSpeed } = physics;
  const kartAccel = accelRate(physics.timeTo95);
  let forward = forwardFromHeading(kart.heading);
  const forwardSpeed = dot(kart.velocity, forward);
  const lateral = sub(vec3(kart.velocity.x, 0, kart.velocity.z), scale(forward, forwardSpeed));

  handleDriftButton(kart, input, forwardSpeed, topSpeed, events);
  if (isDrifting(kart) && forwardSpeed < tuning.driftMinSpeed * topSpeed) {
    cancelDrift(kart, events);
  }

  // Steering: positive steer turns right (heading decreases); reversing inverts it.
  // While drifting the turn rate comes from the drift instead (tighter, direction locked).
  let yaw: number;
  if (isDrifting(kart)) {
    yaw = driftYawRate(kart, input) * physics.handling;
    chargeDrift(kart, input, dt, events);
  } else {
    const direction = forwardSpeed >= 0 ? 1 : -1;
    yaw =
      -clamp(input.steer, -1, 1) *
      tuning.maxYawRate *
      physics.handling *
      steeringStrength(forwardSpeed, topSpeed) *
      direction;
  }
  kart.heading = wrapAngle(kart.heading + yaw * dt);
  forward = forwardFromHeading(kart.heading);

  // Longitudinal speed along the new heading. Boosting raises the top speed and pulls towards it
  // hard, even without throttle (unless braking), and ignores the grass penalty.
  const boosting = kart.boostTimer > 0;
  const onGrass = kart.grounded && groundAt(track, kart.position).surface === 'offroad';
  const newSpeed = boosting
    ? updateForwardSpeed(
        forwardSpeed,
        input.brake > 0 ? input : { ...input, throttle: 1 },
        topSpeed * tuning.boostSpeed,
        dt,
        tuning.boostAccelRate,
      )
    : onGrass
      ? updateForwardSpeed(
          forwardSpeed,
          input,
          topSpeed * tuning.offroadSpeed,
          dt,
          kartAccel,
          tuning.offroadDecel,
        )
      : updateForwardSpeed(forwardSpeed, input, topSpeed, dt, kartAccel);
  kart.boostTimer = Math.max(0, kart.boostTimer - dt);

  // Plus the remaining sideways slide, decaying with grip (low grip while drifting = outward slide).
  const grip = isDrifting(kart) ? tuning.driftGrip : tuning.lateralGrip;
  const slide = scale(lateral, Math.exp(-grip * dt));
  const horizontal = add(scale(forward, newSpeed), slide);

  // Vertical: gravity + snap to the ground (follows hills; off the edge there is no ground).
  let vy = kart.velocity.y - tuning.gravity * dt;
  let position = add(kart.position, scale(vec3(horizontal.x, vy, horizontal.z), dt));
  const ground = groundAt(track, position).height;
  kart.grounded = position.y <= ground;
  if (kart.grounded) {
    position = { ...position, y: ground };
    vy = 0;
  }

  kart.velocity = vec3(horizontal.x, vy, horizontal.z);
  kart.position = position;
  const wallImpact =
    track.kind === 'arena'
      ? collideWithArenaWalls(kart, track, events)
      : collideWithTrackWalls(kart, track, events);
  if (wallImpact > tuning.driftWallCancel) cancelDrift(kart, events);
  kart.speed = dot(kart.velocity, forwardFromHeading(kart.heading));
  return kart;
}

/** The kart's four footprint corners as offsets from its centre, in world orientation (XZ). */
export function footprintOffsets(heading: number): Vec3[] {
  const { kartFront, kartRear, kartHalfWidth } = tuning;
  return [
    vec3(-kartHalfWidth, 0, -kartFront),
    vec3(kartHalfWidth, 0, -kartFront),
    vec3(-kartHalfWidth, 0, kartRear),
    vec3(kartHalfWidth, 0, kartRear),
  ].map((corner) => rotateY(corner, heading));
}

/**
 * Keeps the kart's whole footprint (not just its centre) inside the arena, and slides it
 * along walls, losing speed by impact angle. Returns the hardest impact speed into a wall, m/s.
 */
function collideWithArenaWalls(
  kart: KartState,
  track: Extract<TrackDef, { kind: 'arena' }>,
  events: SimEvent[],
): number {
  let hardestImpact = 0;
  for (const axis of ['x', 'z'] as const) {
    for (const side of [1, -1] as const) {
      // How far the furthest corner on this side sticks past the wall.
      const offsets = footprintOffsets(kart.heading);
      const reach = Math.max(...offsets.map((o) => o[axis] * side));
      const penetration = kart.position[axis] * side + reach - track.halfSize;
      if (penetration <= 0) continue;
      kart.position = { ...kart.position, [axis]: kart.position[axis] - side * penetration };
      const wallNormal = axis === 'x' ? { x: side, z: 0 } : { x: 0, z: side };
      hardestImpact = Math.max(hardestImpact, bounceOffWall(kart, wallNormal, events));
    }
  }
  return hardestImpact;
}

/** Removes velocity into a wall (unit normal pointing into the wall) and scrubs along-wall speed by impact angle. */
function bounceOffWall(
  kart: KartState,
  wallNormal: { x: number; z: number },
  events: SimEvent[],
): number {
  const into = kart.velocity.x * wallNormal.x + kart.velocity.z * wallNormal.z;
  if (into <= 0) return 0;
  const total = Math.hypot(kart.velocity.x, kart.velocity.z);
  const impact = total > 0 ? into / total : 0;
  const keep = 1 - (1 - tuning.wallSpeedKeep) * impact;
  const alongX = (kart.velocity.x - wallNormal.x * into) * keep;
  const alongZ = (kart.velocity.z - wallNormal.z * into) * keep;
  if (impact < tuning.wallHeadOn && Math.hypot(alongX, alongZ) > 0.5) {
    // Glancing: turn to slide along the wall instead of grinding into it every tick.
    const alongHeading = Math.atan2(-alongX, -alongZ);
    const facingAlong = Math.cos(alongHeading - kart.heading) >= 0;
    kart.heading = wrapAngle(facingAlong ? alongHeading : alongHeading + Math.PI);
    kart.velocity = { x: alongX, y: kart.velocity.y, z: alongZ };
  } else {
    // Head-on: small bounce back.
    const bounce = into * tuning.wallBounce;
    kart.velocity = {
      x: alongX - wallNormal.x * bounce,
      y: kart.velocity.y,
      z: alongZ - wallNormal.z * bounce,
    };
  }
  events.push({ type: 'wallHit', kartId: kart.id, strength: into });
  return into;
}

/**
 * Walls of a spline track run along both outer edges (road + grass). Works in track space:
 * the kart's footprint is measured against the wall's lateral offset at the kart's position.
 */
function collideWithTrackWalls(
  kart: KartState,
  track: Extract<TrackDef, { kind: 'spline' }>,
  events: SimEvent[],
): number {
  const geometry = trackGeometry(track);
  const projection = geometry.project(kart.position);
  const { normal } = projection;
  const wallOffset = geometry.wallOffset(projection.width);
  const offsets = footprintOffsets(kart.heading);
  let hardestImpact = 0;
  for (const side of [1, -1] as const) {
    if (!geometry.hasWall(projection.t, side === 1 ? 'right' : 'left')) continue;
    const reach = Math.max(...offsets.map((o) => (o.x * normal.x + o.z * normal.z) * side));
    const penetration = projection.lateral * side + reach - wallOffset;
    if (penetration <= 0) continue;
    kart.position = {
      ...kart.position,
      x: kart.position.x - normal.x * side * penetration,
      z: kart.position.z - normal.z * side * penetration,
    };
    const impact = bounceOffWall(kart, { x: normal.x * side, z: normal.z * side }, events);
    hardestImpact = Math.max(hardestImpact, impact);
  }
  return hardestImpact;
}
