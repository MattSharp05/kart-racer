// Surface-frame kart physics for mesh tracks (MK-99, ADR 0011), productionized from the MK-92 spike
// (`src/mk8/spike/kart.ts`). A mesh-track kart carries a unit `forward` and `up`: steering, drift,
// speed, grip and boosts run in the plane perpendicular to `up` exactly as the yaw-only step
// (`kart.ts`) runs them in the XZ plane. Four wheel rays along −up (plus a climb ray ahead, which
// finds a wall or ceiling to drive onto) give the ground's plane; `up` eases towards its normal.
// On anti-gravity ground gravity pulls along −up, so the kart stays on walls and ceilings; elsewhere
// it pulls along world −Y and ground steeper than `tuning.mk8.maxSlope` is a wall. Spline and arena
// tracks never come here, so their karts are bit-identical to before (`regression.test.ts`).
import {
  cancelDrift,
  chargeDrift,
  driftYawRate,
  handleDriftButton,
  isBrakeDrifting,
  isDrifting,
} from './drift';
import {
  accelRate,
  hitBoostPad,
  kartTopSpeed,
  steeringStrength,
  tryTrick,
  updateAirState,
  updateForwardSpeed,
} from './kart';
import { endGlide, glideAim, glideStep, launchesGlide, startGlide } from './glide';
import { kartPhysics } from './kartStats';
import {
  add,
  clamp,
  cross,
  dot,
  forwardFromHeading,
  headingOf,
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
import {
  groundAt as meshGroundAt,
  raycastMesh,
  surfaceMask,
  wallContact,
  type MeshSurface,
  type MeshTrackDef,
} from './meshTrack';
import type { Surface } from './splineTrack';
import { applySpinBoost, hitBumpers } from './spinBoost';
import { surfaceEffect } from './surfaces';
import { tuning, type EngineClass } from './tuning';
import type { InputFrame, KartState, SimEvent } from './types';
import {
  hopSpeed,
  limitSink,
  updateWater,
  waterGravityScale,
  waterSpeedScale,
  waterTuning,
} from './underwater';

/** What a kart can stand on or climb onto (a kill floor isn't ground: the kart falls through it). */
const DRIVABLE = surfaceMask('road', 'offroad', 'boost', 'antigrav', 'glide');

/** Which yaw-only surface effect a mesh surface drives like (`surfaces.ts`). */
const DRIVES_LIKE: Record<MeshSurface, Surface> = {
  road: 'road',
  offroad: 'offroad',
  boost: 'boostPad',
  wall: 'road',
  water: 'road',
  antigrav: 'road',
  glide: 'road',
  void: 'road',
};

/** Surfaces that end anti-gravity mode when the kart is wholly on them. */
const PLAIN: ReadonlySet<MeshSurface> = new Set(['road', 'boost', 'glide']);

const DOWN: Readonly<Vec3> = Object.freeze({ x: 0, y: -1, z: 0 });

/** Gives a kart its surface frame the first time it's stepped on a mesh track (+Y up, level). */
export function ensureSurfaceFrame(kart: KartState): void {
  kart.up ??= { ...WORLD_UP };
  kart.forward ??= orthonormal(forwardFromHeading(kart.heading), kart.up);
  kart.gravityDir ??= { ...DOWN };
  kart.antigrav ??= false;
}

/** The kart's right: forward × up. */
export function rightOf(forward: Vec3, up: Vec3): Vec3 {
  return normalize(cross(forward, up));
}

/** One ray's ground hit used in the plane fit. */
interface Sample {
  point: Vec3;
  normal: Vec3;
  surface: MeshSurface;
}

/** The ground plane under the kart (average of the hits), and what it's made of. */
interface GroundFit {
  point: Vec3;
  normal: Vec3;
  /** Surface under the kart's centre (or the first hit's, if the centre missed). */
  surface: MeshSurface;
  /** Any hit was anti-gravity ground. */
  antigrav: boolean;
  /** Every hit was plain road (ends anti-gravity mode). */
  plain: boolean;
}

/**
 * Casts the four wheel rays and the centre ray along `down`, from `tuning.mk8.probeLift` above the
 * kart down to `reach` below it. `climb` (grounded only) is ground found ahead.
 */
function probeGround(
  track: MeshTrackDef,
  position: Vec3,
  forward: Vec3,
  right: Vec3,
  down: Vec3,
  reach: number,
  climb: Sample | null,
): { samples: Sample[]; centre: Sample | null } {
  const { wheelForward, wheelRight, probeLift: lift } = tuning.mk8;
  const top = sub(position, scale(down, lift));
  const samples: Sample[] = [];
  for (const [f, r] of WHEELS) {
    const origin = add(top, add(scale(forward, f * wheelForward), scale(right, r * wheelRight)));
    const hit = raycastMesh(track.collision, origin, down, lift + reach, DRIVABLE);
    if (hit) samples.push({ point: hit.point, normal: hit.normal, surface: hit.surface });
  }
  if (climb) samples.push(climb);
  const hit = raycastMesh(track.collision, top, down, lift + reach, DRIVABLE);
  const centre = hit ? { point: hit.point, normal: hit.normal, surface: hit.surface } : null;
  return { samples, centre };
}

const WHEELS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Averages the samples into a plane; fewer than two wheel hits fall back to the centre ray. */
function fitGround(samples: Sample[], centre: Sample | null): GroundFit | null {
  const used = samples.length >= 2 ? samples : centre ? [centre] : [];
  const first = used[0];
  if (!first) return null;
  let normal: Vec3 = { x: 0, y: 0, z: 0 };
  let point: Vec3 = { x: 0, y: 0, z: 0 };
  let antigrav = centre?.surface === 'antigrav';
  let plain = centre ? PLAIN.has(centre.surface) : true;
  for (const s of used) {
    normal = add(normal, s.normal);
    point = add(point, s.point);
    if (s.surface === 'antigrav') antigrav = true;
    if (!PLAIN.has(s.surface)) plain = false;
  }
  const n = length(normal);
  if (n < 1e-9) return null;
  return {
    point: scale(point, 1 / used.length),
    normal: scale(normal, 1 / n),
    surface: centre?.surface ?? first.surface,
    antigrav,
    plain,
  };
}

/**
 * Removes velocity into a wall (unit `normal`, in the road plane, pointing away from the wall) and
 * scrubs the along-wall speed by impact angle, like `kart.ts`'s `bounceOffWall` in the kart's own
 * plane. A glancing hit turns the kart to slide along the wall. Returns the impact speed, m/s.
 */
function bounceOffSurface(
  kart: KartState,
  normal: Vec3,
  up: Vec3,
  forward: Vec3,
  events: SimEvent[],
): { impact: number; forward: Vec3 } {
  const v = kart.velocity;
  const into = -dot(v, normal);
  if (into <= 0) return { impact: 0, forward };
  const vUp = dot(v, up);
  const inPlane = sub(v, scale(up, vUp));
  const total = length(inPlane);
  const impact = total > 0 ? into / total : 0;
  const keep = 1 - (1 - tuning.wallSpeedKeep) * impact;
  const along = scale(add(inPlane, scale(normal, into)), keep);
  let facing = forward;
  if (impact < tuning.wallHeadOn && length(along) > 0.5) {
    // Glancing: turn to slide along the wall instead of grinding into it every tick.
    const dir = normalize(along);
    facing = dot(dir, forward) >= 0 ? dir : scale(dir, -1);
    kart.velocity = add(along, scale(up, vUp));
  } else {
    // Head-on: small bounce back.
    kart.velocity = add(add(along, scale(normal, into * tuning.wallBounce)), scale(up, vUp));
  }
  events.push({ type: 'wallHit', kartId: kart.id, strength: into });
  return { impact: into, forward: facing };
}

/** Advances one kart by one tick on a mesh track. Mutates and returns `kart`. */
export function updateMeshKart(
  kart: KartState,
  input: InputFrame,
  engineClass: EngineClass,
  track: MeshTrackDef,
  dt: number,
  events: SimEvent[],
  tick = 0,
): KartState {
  const m = tuning.mk8;
  ensureSurfaceFrame(kart);
  // Under water (MK-107): slower, floatier, higher hops.
  updateWater(kart, track.route, events);
  let up = kart.up ?? { ...WORLD_UP };
  let forward = kart.forward ?? forwardFromHeading(kart.heading);
  const physics = kartPhysics(kart.kartType, engineClass, kart.loadout);
  const topSpeed = kartTopSpeed(kart, engineClass) * waterSpeedScale(kart);
  const kartAccel = accelRate(physics.timeTo95);

  // Split the velocity in the kart's frame: along forward, along up, and the sideways slide.
  const forwardSpeed = dot(kart.velocity, forward);
  let upSpeed = dot(kart.velocity, up);
  const lateral = sub(kart.velocity, add(scale(forward, forwardSpeed), scale(up, upSpeed)));

  const driftPressed = input.drift && !kart.driftHeld;
  const groundedBefore = kart.grounded;
  handleDriftButton(kart, input, forwardSpeed, topSpeed, events);
  // A hop goes along the kart's up (`handleDriftButton` sets a world-Y speed for flat tracks).
  const hopped = groundedBefore && !kart.grounded;
  if (hopped) upSpeed = hopSpeed(kart);
  const under = kart.grounded ? meshGroundAt(track.collision, kart.position, up, DRIVABLE) : null;
  const effect = surfaceEffect(DRIVES_LIKE[under?.surface ?? 'road']);
  if (driftPressed && !kart.grounded) tryTrick(kart, events);
  if (isDrifting(kart) && forwardSpeed < tuning.driftMinSpeed * topSpeed) cancelDrift(kart, events);

  // Steering (as `updateKart`): a yaw about `up`.
  const brakeDrift = isBrakeDrifting(kart, input, engineClass);
  let yaw: number;
  if (isDrifting(kart)) {
    yaw = driftYawRate(kart, input) * physics.handling;
    if (brakeDrift) yaw *= tuning.brakeDrift.turnScale;
    if (effect.wobble && effect.wobbleHz) {
      yaw += effect.wobble * Math.sin(2 * Math.PI * effect.wobbleHz * tick * dt);
    }
    chargeDrift(kart, input, dt, events, physics.driftCharge);
  } else {
    const direction = forwardSpeed >= 0 ? 1 : -1;
    yaw =
      -clamp(input.steer, -1, 1) *
      tuning.maxYawRate *
      physics.handling *
      steeringStrength(forwardSpeed, topSpeed) *
      direction;
  }
  forward = orthonormal(rotateAbout(forward, up, yaw * dt), up);

  // Speed along the new forward (as `updateKart`: boosts, grass, brake-drift).
  const pedals = brakeDrift ? { ...input, brake: 0 } : input;
  const grassSpeed = effect.speed ?? 0;
  const onGrass = grassSpeed > 0 && kart.starTimer === 0;
  const pedalSpeed =
    kart.boostTimer > 0
      ? updateForwardSpeed(
          forwardSpeed,
          pedals.brake > 0 ? pedals : { ...pedals, throttle: 1 },
          topSpeed * tuning.boostSpeed,
          dt,
          tuning.boostAccelRate,
        )
      : onGrass
        ? updateForwardSpeed(
            forwardSpeed,
            pedals,
            topSpeed * grassSpeed,
            dt,
            kartAccel,
            tuning.offroadDecel,
          )
        : updateForwardSpeed(
            forwardSpeed,
            pedals,
            topSpeed,
            dt,
            kartAccel,
            kart.inWater ? waterTuning().drag : undefined,
          );
  const spunSpeed = applySpinBoost(kart, pedalSpeed, forwardSpeed, pedals, topSpeed, dt);
  const newSpeed = brakeDrift ? spunSpeed * Math.exp(-tuning.brakeDrift.speedLoss * dt) : spunSpeed;
  kart.boostTimer = Math.max(0, kart.boostTimer - dt);
  const grip =
    (isDrifting(kart) ? tuning.driftGrip : tuning.lateralGrip) * (effect.grip ?? 1) * physics.grip;
  const slide = scale(lateral, Math.exp(-grip * dt));

  // Gravity: along −up in anti-gravity (and a moment after leaving it), world −Y otherwise.
  const wasGrounded = kart.grounded;
  const stuck = kart.antigrav === true && (wasGrounded || kart.airTime < m.antigravAirHold);
  let gravityDir: Vec3 = stuck ? scale(up, -1) : { ...DOWN };
  let velocity = add(add(scale(forward, newSpeed), slide), scale(up, upSpeed));
  const gliding = !wasGrounded && kart.glide !== undefined;
  if (gliding) {
    // On the glider (MK-106): its own flight replaces the steering, speed and gravity above.
    const flight = glideStep(
      kart,
      input,
      kart.forward ?? forward,
      up,
      topSpeed,
      physics.handling,
      dt,
    );
    velocity = flight.velocity;
    forward = flight.forward;
    up = flight.up;
    gravityDir = { ...DOWN };
  } else if (!wasGrounded) {
    velocity = add(velocity, scale(gravityDir, tuning.gravity * waterGravityScale(kart) * dt));
    velocity = limitSink(kart, velocity, gravityDir);
    if (!stuck) {
      // In the air, ease back upright (rolling about the nose if upside down).
      up = turnTowards(up, WORLD_UP, 1 - Math.exp(-m.airUpTurnRate * dt), forward);
      forward = keepForward(forward, up);
    }
  }
  let position = add(kart.position, scale(velocity, dt));

  // The ground: along −up while grounded, along gravity in the air.
  const down = wasGrounded ? scale(up, -1) : gravityDir;
  const right = rightOf(forward, up);
  const ahead = wasGrounded ? lookAhead(track, kart, position, forward, up, newSpeed, dt) : null;
  let wallImpact = 0;
  if (ahead?.wall) {
    // Plain ground too steep to climb: a wall. Keep the nose off it, no speed into it.
    position = add(position, scale(ahead.wall.normal, ahead.wall.depth));
    kart.velocity = velocity;
    const hit = bounceOffSurface(kart, ahead.wall.normal, up, forward, events);
    velocity = kart.velocity;
    forward = hit.forward;
    wallImpact = hit.impact;
  }
  const reach = wasGrounded ? (kart.antigrav ? m.antigravSnap : m.groundSnap) : 0;
  const probe = probeGround(track, position, forward, right, down, reach, ahead?.climb ?? null);
  // Without anti-gravity, ground steeper than `maxSlope` doesn't hold the kart (it's a wall).
  const minUpY = Math.cos(m.maxSlope);
  let fit = fitGround(probe.samples, probe.centre);
  if (fit && !kart.antigrav && !fit.antigrav && fit.normal.y < minUpY) {
    const level = (s: Sample) => s.surface === 'antigrav' || s.normal.y >= minUpY;
    fit = fitGround(
      probe.samples.filter(level),
      probe.centre && level(probe.centre) ? probe.centre : null,
    );
  }
  const holds = fit !== null && (kart.antigrav || fit.antigrav || fit.normal.y >= minUpY);
  const height = fit ? dot(sub(position, fit.point), fit.normal) : Infinity;
  kart.grounded = holds && height <= reach;
  if (kart.grounded && fit) {
    // Onto the ground plane; no speed into or away from it; up turns towards its normal.
    position = sub(position, scale(fit.normal, height));
    const into = dot(velocity, fit.normal);
    const along = sub(velocity, scale(fit.normal, into));
    // Driving into a wall or ceiling turns the speed onto it (a curved transition would keep it);
    // landing from the air doesn't (the speed into the ground is lost).
    const keep = wasGrounded && into < 0 ? length(velocity) / (length(along) || 1) : 1;
    velocity = scale(along, keep);
    up = turnTowards(up, fit.normal, 1 - Math.exp(-m.upTurnRate * dt), forward);
    forward = keepForward(forward, up);
    if (fit.antigrav) kart.antigrav = true;
    else if (fit.plain) kart.antigrav = false;
    gravityDir = kart.antigrav ? scale(up, -1) : { ...DOWN };
  }
  // Leaving a glide ramp (a `glide` surface or route zone; not a hop on it): launched level along
  // the road with a ramp lip's lift and out of anti-gravity (MK-105), and the glider opens. Hopping
  // off its lip opens it too; landing folds it.
  if (wasGrounded && !kart.grounded && !hopped) {
    if (launchesGlide(track.route, kart, launchPoints(track, kart, under?.surface, forward, up))) {
      const level = { x: forward.x, y: 0, z: forward.z };
      const run = length(level);
      if (run > 1e-6) {
        const speed = Math.max(0, newSpeed);
        velocity = add(scale(level, speed / run), { x: 0, y: speed * tuning.rampLaunch, z: 0 });
      }
      kart.antigrav = false;
      gravityDir = { ...DOWN };
      startGlide(kart, events, glideAim(track.route, kart));
    }
  } else if (kart.grounded) endGlide(kart, events);
  else if (!wasGrounded && !kart.glide && kart.airTime < m.glide.hopGrace) {
    if (hopsOffLip(track, kart, position, forward))
      startGlide(kart, events, glideAim(track.route, kart));
  }
  // Launch speed for tricks: how fast it leaves the ground against gravity.
  updateAirState(kart, wasGrounded, -dot(velocity, gravityDir), dt, events);
  if (kart.grounded && fit?.surface === 'boost') hitBoostPad(kart, events);

  kart.velocity = velocity;
  kart.position = position;
  // Walls push the kart back in its own plane (never lift it off the road).
  const centre = add(position, scale(up, m.wallLift));
  const wall = wallContact(track.collision, centre, m.wallRadius, up);
  if (wall) {
    kart.position = add(kart.position, wall.push);
    const hit = bounceOffSurface(kart, wall.normal, up, forward, events);
    forward = hit.forward;
    wallImpact = Math.max(wallImpact, hit.impact);
  }
  if (wallImpact > tuning.driftWallCancel) cancelDrift(kart, events);
  // A wall ends a glide: the kart drops with normal gravity, its fall timed from here.
  if (wallImpact > 0 && !kart.grounded && kart.glide) {
    endGlide(kart, events);
    kart.airTime = 0;
  }
  // Boost bumpers (MK-108): round colliders, a spin boost in anti-gravity.
  hitBumpers(kart, track.route.zones, up, forward, events);

  kart.up = up;
  kart.forward = forward;
  kart.gravityDir = gravityDir;
  kart.heading = headingOf(forward, kart.heading);
  kart.speed = dot(kart.velocity, forward);
  return kart;
}

/**
 * Where a kart leaving the ground left from (`launchesGlide`): its centre, with the surface under
 * it at the start of the tick, and its rear axle (past a ramp's lip only the rear wheels are on it).
 */
function launchPoints(
  track: MeshTrackDef,
  kart: KartState,
  under: MeshSurface | undefined,
  forward: Vec3,
  up: Vec3,
): { position: Vec3; surface: MeshSurface | undefined }[] {
  const rear = sub(kart.position, scale(forward, tuning.mk8.wheelForward));
  return [
    { position: kart.position, surface: under },
    { position: rear, surface: meshGroundAt(track.collision, rear, up, DRIVABLE)?.surface },
  ];
}

/**
 * Whether a kart in the air from a hop has just passed a glide ramp's lip: nothing to land on under
 * its centre (within `glide.lipReach`), glide ramp under its rear axle.
 */
function hopsOffLip(track: MeshTrackDef, kart: KartState, position: Vec3, forward: Vec3): boolean {
  const reach = tuning.mk8.glide.lipReach;
  if (raycastMesh(track.collision, position, DOWN, reach, DRIVABLE)) return false;
  const rear = sub(position, scale(forward, tuning.mk8.wheelForward));
  const hit = raycastMesh(track.collision, rear, DOWN, reach, DRIVABLE);
  return (
    hit !== null && launchesGlide(track.route, kart, [{ position: rear, surface: hit.surface }])
  );
}

/** `forward` made perpendicular to `up` again; if it points along `up`, any facing in the plane. */
function keepForward(forward: Vec3, up: Vec3): Vec3 {
  const f = orthonormal(forward, up);
  if (length(f) > 0.5) return f;
  return orthonormal(Math.abs(up.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 }, up);
}

/** What's ahead of a grounded kart: ground to drive onto, or a wall made of too-steep ground. */
interface Ahead {
  climb?: Sample;
  /** Push the kart `depth` m along `normal` (in its plane, away from the slope). */
  wall?: { normal: Vec3; depth: number };
}

/**
 * Looks ahead (in the direction of travel) for ground at an angle to the kart's: a wall or ceiling
 * to drive onto (it joins the plane fit, which rounds the corner), or, without anti-gravity, plain
 * ground steeper than `tuning.mk8.maxSlope`, which stops the kart like a wall.
 */
function lookAhead(
  track: MeshTrackDef,
  kart: KartState,
  position: Vec3,
  forward: Vec3,
  up: Vec3,
  speed: number,
  dt: number,
): Ahead | null {
  const m = tuning.mk8;
  const dir = speed >= 0 ? forward : scale(forward, -1);
  const nose = speed >= 0 ? tuning.kartFront : tuning.kartRear;
  const origin = add(position, scale(up, m.climbLift));
  const reach = nose + Math.abs(speed) * dt + m.climbReach;
  const hit = raycastMesh(track.collision, origin, dir, reach, DRIVABLE);
  if (!hit || dot(hit.normal, dir) >= 0) return null;
  if (dot(hit.normal, up) > Math.cos(m.climbAngle)) return null;
  const climbable =
    hit.surface === 'antigrav' || kart.antigrav === true || hit.normal.y >= Math.cos(m.maxSlope);
  if (climbable) return { climb: { point: hit.point, normal: hit.normal, surface: hit.surface } };
  if (hit.distance >= nose) return null;
  const away = orthonormal(hit.normal, up);
  if (length(away) < 0.5) return null;
  return { wall: { normal: away, depth: nose - hit.distance } };
}
