// MK-92 spike: a surface-frame kart (ADR 0011 proposal). Position, velocity and an orthonormal
// frame (forward, up); `up` follows the ground under the kart's four wheel rays. On anti-gravity
// ground gravity pulls along −up, so the kart stays on walls and ceilings; elsewhere it pulls
// along world −Y. Prototype code: not the sim, no determinism guarantees beyond plain JS maths.
import { tuning } from '../../sim/tuning';
import type { InputFrame } from '../../sim/types';
import { CollisionWorld, DRIVABLE, SURFACES, type Surface } from './collision';
import {
  add,
  addScaled,
  angleBetween,
  cross,
  dot,
  normalize,
  orthonormal,
  rotateAbout,
  scale,
  slerpDir,
  sub,
  type V3,
} from './vec';

export const SPIKE_TUNING = {
  dt: 1 / 60,
  /** 150cc top speed on road (the game's own value). */
  topSpeed: tuning.topSpeed[150],
  accel: 10,
  brake: 25,
  coast: 4,
  reverseSpeed: 8,
  offroadTopFactor: 0.55,
  boostTopFactor: 1.3,
  boostSeconds: 1.2,
  /** Lateral grip: lateral speed decays at this rate (1/s). */
  grip: 10,
  /** Max yaw rate at low and at top speed (rad/s). */
  yawLow: 2.4,
  yawHigh: 1.3,
  gravity: 20,
  /** Steepest plain (non-anti-gravity) ground a kart can hold, radians (50°). */
  maxRoadSlope: (50 * Math.PI) / 180,
  /** Kart origin above the ground, metres. */
  rideHeight: 0.45,
  /** Rays start this far above the kart (along up). */
  probeLift: 1.0,
  /** Grounded if the ground is within this distance below the ride height (road / anti-gravity). */
  snapRoad: 0.5,
  snapAntigrav: 1.5,
  /** Wheel ray offsets: ± along forward and ± along right. */
  wheelForward: 1.0,
  wheelRight: 0.7,
  /** Rate (1/s) at which up turns towards the ground normal, and back to +Y in the air. */
  upRate: 14,
  airUpRate: 2,
  /** In the air after anti-gravity ground, gravity keeps pulling along −up this long. */
  antigravGrace: 0.35,
  wallRadius: 0.9,
  /** Velocity kept along a wall normal after a hit (bounce). */
  wallBounce: 0.25,
  /** Respawn below this height or after this long in the air. */
  fallY: -40,
  maxAir: 3,
  /** Last safe spot is recorded every this many seconds while grounded. */
  safeEvery: 0.5,
} as const;

export interface SpikeKart {
  pos: V3;
  vel: V3;
  forward: V3;
  up: V3;
  grounded: boolean;
  /** Surface under the kart's centre (or last one touched). */
  surface: Surface;
  /** Stuck to the surface: set on anti-gravity ground, cleared on plain road (offroad keeps it). */
  antigrav: boolean;
  airTime: number;
  boostTime: number;
  respawns: number;
  /** Distance from the ride height to the ground plane last tick (0 when settled). */
  groundGap: number;
  /** Angle `up` turned this tick, radians. */
  upStep: number;
  /** Where a respawn puts the kart, with its anti-gravity mode (a ceiling needs it on). */
  safe: { pos: V3; forward: V3; up: V3; antigrav: boolean };
  safeTimer: number;
}

export function makeKart(pos: V3, forward: V3, up: V3 = [0, 1, 0]): SpikeKart {
  const u = normalize(up);
  const f = orthonormal(forward, u);
  return {
    pos: addScaled(pos, u, SPIKE_TUNING.rideHeight),
    vel: [0, 0, 0],
    forward: f,
    up: u,
    grounded: false,
    surface: 'road',
    antigrav: false,
    airTime: 0,
    boostTime: 0,
    respawns: 0,
    groundGap: 0,
    upStep: 0,
    safe: {
      pos: addScaled(pos, u, SPIKE_TUNING.rideHeight),
      forward: f,
      up: u,
      antigrav: false,
    },
    safeTimer: 0,
  };
}

export const rightOf = (k: SpikeKart): V3 => normalize(cross(k.forward, k.up));
const WORLD_UP: V3 = [0, 1, 0];

function topSpeedOn(k: SpikeKart): number {
  const t = SPIKE_TUNING;
  const base = k.surface === 'offroad' ? t.topSpeed * t.offroadTopFactor : t.topSpeed;
  return k.boostTime > 0 ? t.topSpeed * t.boostTopFactor : base;
}

/** Steering and speed in the kart's own frame (grounded only). */
function drive(k: SpikeKart, input: InputFrame, dt: number): void {
  const t = SPIKE_TUNING;
  let speed = dot(k.vel, k.forward);
  const speedFraction = Math.min(1, Math.abs(speed) / t.topSpeed);
  const yawRate = t.yawLow + (t.yawHigh - t.yawLow) * speedFraction;
  const turning = Math.min(1, Math.abs(speed) / 3) * Math.sign(speed || 1);
  k.forward = orthonormal(
    rotateAbout(k.forward, k.up, -input.steer * yawRate * turning * dt),
    k.up,
  );
  const right = rightOf(k);

  const top = topSpeedOn(k);
  if (input.brake > 0) speed = Math.max(-t.reverseSpeed, speed - t.brake * input.brake * dt);
  else if (input.throttle > 0) {
    speed =
      speed < top
        ? Math.min(top, speed + t.accel * input.throttle * dt)
        : Math.max(top, speed - t.coast * dt);
  } else speed -= Math.sign(speed) * Math.min(Math.abs(speed), t.coast * dt);
  const lateral = dot(k.vel, right) * Math.exp(-t.grip * dt);
  k.vel = addScaled(scale(k.forward, speed), right, lateral);
  if (!k.antigrav) {
    // Plain road: world gravity along the slope (a steep bank would slide you down).
    const g: V3 = [0, -t.gravity, 0];
    k.vel = addScaled(k.vel, sub(g, scale(k.up, dot(g, k.up))), dt);
  }
}

interface Ground {
  normal: V3;
  point: V3;
  surface: number;
  hits: number;
}

/** Four wheel rays along −up (plus the centre one, for the surface): averaged ground plane. */
export function probeGround(world: CollisionWorld, k: SpikeKart): Ground | null {
  const t = SPIKE_TUNING;
  const right = rightOf(k);
  const down = scale(k.up, -1);
  const maxT = t.probeLift + t.rideHeight + (k.antigrav ? t.snapAntigrav : t.snapRoad);
  const top = addScaled(k.pos, k.up, t.probeLift);
  let normal: V3 = [0, 0, 0];
  let point: V3 = [0, 0, 0];
  let hits = 0;
  for (const [f, r] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const origin = addScaled(
      addScaled(top, k.forward, f * t.wheelForward),
      right,
      r * t.wheelRight,
    );
    const hit = world.raycast(origin, down, maxT, DRIVABLE);
    if (!hit) continue;
    normal = add(normal, hit.normal);
    point = add(point, hit.point);
    hits++;
  }
  const centre = world.raycast(top, down, maxT, DRIVABLE);
  if (hits < 2 && !centre) return null;
  if (hits < 2 && centre)
    return { normal: centre.normal, point: centre.point, surface: centre.surface, hits: 1 };
  return {
    normal: normalize(normal),
    point: scale(point, 1 / hits),
    surface: centre?.surface ?? -1,
    hits,
  };
}

function pushOutOfWalls(world: CollisionWorld, k: SpikeKart): void {
  const t = SPIKE_TUNING;
  const centre = addScaled(k.pos, k.up, t.wallRadius * 0.6);
  for (const contact of world.wallContacts(centre, t.wallRadius)) {
    // Only the part of the push in the road plane: walls never lift the kart off the ground.
    const inPlane = addScaled(contact.normal, k.up, -dot(contact.normal, k.up));
    // Straight above or below a rail edge there's no sideways push; skip it.
    if (dot(inPlane, inPlane) < 1e-6) continue;
    const n = normalize(inPlane);
    const depth = dot(contact.push, n);
    if (depth <= 0) continue;
    k.pos = addScaled(k.pos, n, depth);
    const into = dot(k.vel, n);
    if (into < 0) k.vel = addScaled(k.vel, n, -into * (1 + t.wallBounce));
  }
}

function respawn(k: SpikeKart): void {
  k.pos = k.safe.pos;
  k.forward = k.safe.forward;
  k.up = k.safe.up;
  k.antigrav = k.safe.antigrav;
  k.vel = [0, 0, 0];
  k.airTime = 0;
  k.grounded = false;
  k.respawns++;
}

/** One fixed step. */
export function stepKart(world: CollisionWorld, k: SpikeKart, input: InputFrame): void {
  const t = SPIKE_TUNING;
  const dt = t.dt;
  const upBefore = k.up;
  k.boostTime = Math.max(0, k.boostTime - dt);

  if (k.grounded) drive(k, input, dt);
  else {
    const stuck = k.antigrav && k.airTime < t.antigravGrace;
    k.vel = addScaled(k.vel, stuck ? scale(k.up, -1) : [0, -1, 0], t.gravity * dt);
    if (!stuck) k.up = slerpDir(k.up, WORLD_UP, 1 - Math.exp(-t.airUpRate * dt));
    k.forward = orthonormal(k.forward, k.up);
  }
  k.pos = addScaled(k.pos, k.vel, dt);

  const ground = probeGround(world, k);
  const gap = ground ? dot(sub(k.pos, ground.point), ground.normal) - t.rideHeight : Infinity;
  const snap = k.antigrav ? t.snapAntigrav : t.snapRoad;
  // Land when the ground is within reach and the kart isn't moving away from it fast (a jump);
  // without anti-gravity, ground steeper than `maxRoadSlope` doesn't hold the kart.
  const holds = k.antigrav || ground === null || ground.normal[1] >= Math.cos(t.maxRoadSlope);
  if (
    ground &&
    holds &&
    gap <= snap &&
    (k.grounded || gap <= 0.05 || dot(k.vel, ground.normal) <= 0)
  ) {
    k.groundGap = gap;
    k.pos = addScaled(k.pos, ground.normal, -gap);
    k.vel = addScaled(k.vel, ground.normal, -dot(k.vel, ground.normal));
    k.up = slerpDir(k.up, ground.normal, 1 - Math.exp(-t.upRate * dt));
    k.forward = orthonormal(k.forward, k.up);
    k.grounded = true;
    k.airTime = 0;
    const surface = SURFACES[ground.surface];
    if (surface) {
      k.surface = surface;
      if (surface === 'antigrav') k.antigrav = true;
      else if (surface === 'road' || surface === 'boost') k.antigrav = false;
      if (surface === 'boost') k.boostTime = t.boostSeconds;
    }
    k.safeTimer += dt;
    if (k.safeTimer >= t.safeEvery && surface !== 'offroad') {
      k.safeTimer = 0;
      k.safe = { pos: k.pos, forward: k.forward, up: k.up, antigrav: k.antigrav };
    }
  } else {
    k.grounded = false;
    k.airTime += dt;
    k.groundGap = 0;
  }

  pushOutOfWalls(world, k);
  k.upStep = angleBetween(upBefore, k.up);
  if (k.pos[1] < t.fallY || k.airTime > t.maxAir) respawn(k);
}

/** Speed along the kart's forward, m/s. */
export const speedOf = (k: SpikeKart): number => dot(k.vel, k.forward);
