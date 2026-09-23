import { add, clamp, dot, forwardFromHeading, rotateY, scale, sub, vec3, type Vec3 } from './math';
import { groundHeightAt, type TrackDef } from './track';
import { tuning, type EngineClass } from './tuning';
import type { InputFrame, KartState, SimEvent } from './types';

/** Keeps an angle in (-π, π]. */
export function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a <= -Math.PI) a += twoPi;
  if (a > Math.PI) a -= twoPi;
  return a;
}

/** Moves `value` towards `target` by at most `maxDelta`. */
function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}

/** Exponential approach rate that reaches 95% of the target in `tuning.timeTo95` seconds. */
function accelRate(): number {
  return Math.log(20) / tuning.timeTo95;
}

/** New forward speed from throttle/brake (arcade model, ADR 0002). */
export function updateForwardSpeed(
  speed: number,
  input: InputFrame,
  topSpeed: number,
  dt: number,
): number {
  const blend = 1 - Math.exp(-accelRate() * dt);
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
    return approach(speed, target, tuning.coastDecel * dt);
  }
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
  const topSpeed = tuning.topSpeed[engineClass];
  let forward = forwardFromHeading(kart.heading);
  const forwardSpeed = dot(kart.velocity, forward);
  const lateral = sub(vec3(kart.velocity.x, 0, kart.velocity.z), scale(forward, forwardSpeed));

  // Steering: positive steer turns right (heading decreases); reversing inverts it.
  const direction = forwardSpeed >= 0 ? 1 : -1;
  const yaw =
    -clamp(input.steer, -1, 1) *
    tuning.maxYawRate *
    steeringStrength(forwardSpeed, topSpeed) *
    direction;
  kart.heading = wrapAngle(kart.heading + yaw * dt);
  forward = forwardFromHeading(kart.heading);

  // Longitudinal speed along the new heading, plus the remaining sideways slide decaying with grip.
  const newSpeed = updateForwardSpeed(forwardSpeed, input, topSpeed, dt);
  const slide = scale(lateral, Math.exp(-tuning.lateralGrip * dt));
  const horizontal = add(scale(forward, newSpeed), slide);

  // Vertical: gravity + ground snap (flat until the track system adds height, MK-9).
  let vy = kart.velocity.y - tuning.gravity * dt;
  let position = add(kart.position, scale(vec3(horizontal.x, vy, horizontal.z), dt));
  const ground = groundHeightAt(track);
  kart.grounded = position.y <= ground;
  if (kart.grounded) {
    position = { ...position, y: ground };
    vy = 0;
  }

  kart.velocity = vec3(horizontal.x, vy, horizontal.z);
  kart.position = position;
  collideWithArenaWalls(kart, track, events);
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
 * along walls, losing speed by impact angle.
 */
function collideWithArenaWalls(kart: KartState, track: TrackDef, events: SimEvent[]): void {
  const offsets = footprintOffsets(kart.heading);
  for (const axis of ['x', 'z'] as const) {
    for (const side of [1, -1] as const) {
      // How far the furthest corner on this side sticks past the wall.
      const reach = Math.max(...offsets.map((o) => o[axis] * side));
      const penetration = kart.position[axis] * side + reach - track.halfSize;
      if (penetration <= 0) continue;
      kart.position = { ...kart.position, [axis]: kart.position[axis] - side * penetration };

      const into = kart.velocity[axis] * side;
      if (into <= 0) continue;
      const other = axis === 'x' ? 'z' : 'x';
      const total = Math.hypot(kart.velocity.x, kart.velocity.z);
      // 0 = grazing, 1 = head-on.
      const impact = total > 0 ? into / total : 0;
      const keep = 1 - (1 - tuning.wallSpeedKeep) * impact;
      kart.velocity = {
        ...kart.velocity,
        [axis]: 0,
        [other]: kart.velocity[other] * keep,
      };
      events.push({ type: 'wallHit', kartId: kart.id, strength: into });
    }
  }
}
