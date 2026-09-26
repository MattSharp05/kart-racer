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
import {
  applyBoost,
  cancelDrift,
  chargeDrift,
  driftYawRate,
  handleDriftButton,
  isDrifting,
} from './drift';
import { effectsSpeedFactor } from './items/effects';
import { kartPhysics } from './kartStats';
import { inRange } from './splineTrack';
import { surfaceEffect } from './surfaces';
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

/** What a kart update needs to know about the world besides the track (MK-49). */
export interface KartEnv {
  /** The tick being simulated (time-based surface effects). */
  tick: number;
  /** Sideways grip × this, from hazard zones such as a sandstorm (1 = none). */
  grip: number;
  /** Sideways push on the ground from a swaying deck (MK-61), m/s², world XZ. */
  push?: { x: number; z: number };
}

const DEFAULT_ENV: KartEnv = { tick: 0, grip: 1 };

/** Advances one kart by one tick. Mutates and returns `kart` (called on a cloned state). */
export function updateKart(
  kart: KartState,
  input: InputFrame,
  engineClass: EngineClass,
  track: TrackDef,
  dt: number,
  events: SimEvent[],
  env: KartEnv = DEFAULT_ENV,
): KartState {
  const physics = kartPhysics(kart.kartType, engineClass);
  // Star: faster (MK-20). Shrunk by lightning: slower. AI rubber-banding (MK-15) scales it too, and
  // so can kart effects (Phase, MK-66).
  const topSpeed =
    physics.topSpeed *
    effectsSpeedFactor(kart) *
    (kart.starTimer > 0 ? tuning.starSpeed : 1) *
    (kart.shrinkTimer > 0 ? tuning.shrinkSpeed : 1) *
    (kart.ai?.speedScale ?? 1);
  const kartAccel = accelRate(physics.timeTo95);
  let forward = forwardFromHeading(kart.heading);
  const forwardSpeed = dot(kart.velocity, forward);
  const lateral = sub(vec3(kart.velocity.x, 0, kart.velocity.z), scale(forward, forwardSpeed));

  const driftPressed = input.drift && !kart.driftHeld;
  handleDriftButton(kart, input, forwardSpeed, topSpeed, events);
  // The surface under the kart (MK-49: `sim/surfaces.ts`); in the air (or hopping) it's like road.
  const under = kart.grounded ? groundAt(track, kart.position) : undefined;
  const effect = surfaceEffect(under?.surface ?? 'road');
  if (driftPressed && !kart.grounded) tryTrick(kart, events);
  if (isDrifting(kart) && forwardSpeed < tuning.driftMinSpeed * topSpeed) {
    cancelDrift(kart, events);
  }

  // Steering: positive steer turns right (heading decreases); reversing inverts it.
  // While drifting the turn rate comes from the drift instead (tighter, direction locked).
  let yaw: number;
  if (isDrifting(kart)) {
    yaw = driftYawRate(kart, input) * physics.handling;
    if (effect.wobble && effect.wobbleHz) {
      yaw += effect.wobble * Math.sin(2 * Math.PI * effect.wobbleHz * env.tick * dt);
    }
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
  // Grass, sand…: a lower top speed. A star ignores it, like a boost.
  const grassSpeed = effect.speed ?? 0;
  const onGrass = grassSpeed > 0 && kart.starTimer === 0;
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
          topSpeed * grassSpeed,
          dt,
          kartAccel,
          tuning.offroadDecel,
        )
      : updateForwardSpeed(forwardSpeed, input, topSpeed, dt, kartAccel);
  kart.boostTimer = Math.max(0, kart.boostTimer - dt);

  // Plus the remaining sideways slide, decaying with grip (low grip while drifting = outward slide).
  const grip =
    (isDrifting(kart) ? tuning.driftGrip : tuning.lateralGrip) * (effect.grip ?? 1) * env.grip;
  const slide = scale(lateral, Math.exp(-grip * dt));
  let horizontal = add(scale(forward, newSpeed), slide);
  // A swaying deck (MK-61) shoves grounded karts sideways; grip then bleeds the slide off.
  if (env.push && kart.grounded) {
    horizontal = add(horizontal, vec3(env.push.x * dt, 0, env.push.z * dt));
  }

  // Vertical: gravity + snap to the ground. While grounded, vertical speed follows the ground,
  // so a kart leaving the top of a ramp keeps its upward speed and flies.
  const wasGrounded = kart.grounded;
  let vy = kart.velocity.y - tuning.gravity * dt;
  let position = add(kart.position, scale(vec3(horizontal.x, vy, horizontal.z), dt));
  if (effect.conveyor && under?.flow) {
    // A conveyor carries the kart along with the belt (its speed adds to the kart's own).
    position = add(position, scale(vec3(under.flow.x, 0, under.flow.z), effect.conveyor * dt));
  }
  const ground = groundAt(track, position);
  // A grounded kart sticks to the ground over small drops (downhills); only a sudden drop
  // bigger than the snap distance (a ramp lip, a cliff) lets it fly.
  const snap = wasGrounded ? tuning.groundSnap : 0;
  kart.grounded = position.y <= ground.height + snap;
  if (kart.grounded) {
    vy = wasGrounded ? (ground.height - kart.position.y) / dt : 0;
    position = { ...position, y: ground.height };
  }
  if (wasGrounded && crossedRampLip(track, kart.position, position)) {
    // Off the lip: fly, with upward speed from the kart's speed.
    kart.grounded = false;
    vy = Math.hypot(horizontal.x, horizontal.z) * tuning.rampLaunch;
  }
  updateAirState(kart, wasGrounded, vy, dt, events);
  if (kart.grounded && ground.surface === 'boostPad') hitBoostPad(kart, events);

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

/** Whether moving from `before` to `after` passes the end (lip) of one of the track's ramps. */
function crossedRampLip(track: TrackDef, before: Vec3, after: Vec3): boolean {
  if (track.kind !== 'spline' || !track.ramps?.length) return false;
  const geometry = trackGeometry(track);
  const t0 = geometry.project(before).t;
  const t1 = geometry.project(after).t;
  return track.ramps.some((ramp) => inRange(t0, ramp) && !inRange(t1, ramp) && t1 >= ramp.to);
}

/** Airtime bookkeeping: launches, landings, and the ramp trick boost. */
function updateAirState(
  kart: KartState,
  wasGrounded: boolean,
  vy: number,
  dt: number,
  events: SimEvent[],
): void {
  if (wasGrounded && !kart.grounded) {
    kart.airTime = 0;
    if (vy > tuning.trickMinLaunch) {
      kart.trick = 'ready';
      events.push({ type: 'launch', kartId: kart.id });
    }
  } else if (!kart.grounded) {
    kart.airTime += dt;
  } else if (!wasGrounded) {
    events.push({ type: 'land', kartId: kart.id, airTime: kart.airTime });
    if (kart.trick === 'done') applyBoost(kart, tuning.trickBoostSeconds, events);
    kart.trick = 'none';
    kart.airTime = 0;
  }
}

/** Drift tapped in the air shortly after a ramp launch = trick (boost on landing). */
function tryTrick(kart: KartState, events: SimEvent[]): void {
  if (kart.trick !== 'ready' || kart.airTime > tuning.trickWindow) return;
  kart.trick = 'done';
  events.push({ type: 'trick', kartId: kart.id });
}

/** Boost pads refresh the boost while you're on them; the event fires once per pad. */
function hitBoostPad(kart: KartState, events: SimEvent[]): void {
  if (kart.boostTimer < tuning.boostPadSeconds - 0.05)
    events.push({ type: 'boostPad', kartId: kart.id });
  kart.boostTimer = Math.max(kart.boostTimer, tuning.boostPadSeconds);
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
    // Far past the wall line means we're on its other side (a shortcut), not stuck in it.
    if (penetration <= 0 || penetration > tuning.wallMaxPenetration) continue;
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
