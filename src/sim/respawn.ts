import { cancelDrift } from './drift';
import { endGlide } from './glide';
import { add, dot, headingOf, scale, sub, WORLD_UP, type Vec3 } from './math';
import { raycastMesh, surfaceMask, type MeshTrackDef } from './meshTrack';
import { routeGeometry, type RouteGeometry } from './route';
import { routeProgress } from './routes';
import { inRange, type SplineTrackDef } from './splineTrack';
import { groundAt, trackGeometry, type TrackDef } from './track';
import { tuning } from './tuning';
import type { InputFrame, KartState, SimEvent, SimState } from './types';

export function isRespawning(kart: KartState): boolean {
  return kart.respawnTimer > 0;
}

/**
 * Fall-off detection and the respawn pickup (MK-13): a kart that falls off the track (or asks
 * with R) is lifted back onto the centreline where it last safely was, facing forwards, then
 * lowered onto the road. Checkpoints can't be gained or lost: it goes back to where it was.
 */
export function updateRespawns(
  state: SimState,
  inputs: readonly InputFrame[],
  track: TrackDef,
  dt: number,
  events: SimEvent[],
  only?: number,
): void {
  if (track.kind === 'mesh') {
    updateMeshRespawns(state, inputs, track, dt, events, only);
    return;
  }
  if (track.kind !== 'spline') return;
  const geometry = trackGeometry(track);
  for (const kart of state.karts) {
    // Simulating one kart (`StepOptions.only`, MK-74): the others' falls are the host's to decide.
    if (only !== undefined && kart.id !== only) continue;
    kart.respawnCooldown = Math.max(0, kart.respawnCooldown - dt);
    kart.invulnerableTimer = Math.max(0, kart.invulnerableTimer - dt);

    if (isRespawning(kart)) {
      carry(kart, track, dt);
      continue;
    }

    const ground = groundAt(track, kart.position);
    const p = geometry.project(kart.position);
    const route = routeProgress(geometry, kart.position, p);
    if (kart.grounded && ground.surface !== 'out') kart.lastSafeT = route?.t ?? p.t;
    kart.outTime = ground.surface === 'out' ? kart.outTime + dt : 0;
    // Fallen = well below the ground under it: the road, or a lower floor off it (MK-61: ruins).
    // Over a route the road may be far above, so only the time off every surface counts there.
    const floor = ground.surface === 'out' ? p.groundY : ground.height;
    const below =
      !(route && ground.surface === 'out') && kart.position.y < floor - tuning.fallDepth;
    const fell = below || kart.outTime > tuning.outSeconds;
    const asked = inputs[kart.id]?.respawn === true && kart.respawnCooldown <= 0;
    if (fell || asked) startRespawn(state, kart, track, events);
  }
}

function startRespawn(state: SimState, kart: KartState, track: SplineTrackDef, events: SimEvent[]) {
  const geometry = trackGeometry(track);
  const safeT = kart.lastSafeT >= 0 ? kart.lastSafeT : geometry.project(kart.position).t;
  // Some stretches (MK-61: rope bridges) put karts back at their start instead.
  const t = track.respawnPoints?.find((point) => inRange(safeT, point))?.t ?? safeT;
  // Spread out karts being put back at (nearly) the same spot.
  const nearby = state.karts.filter(
    (other) =>
      other.id !== kart.id &&
      isRespawning(other) &&
      Math.abs(geometry.project(other.position).t - t) * geometry.length < 6,
  ).length;
  const spread =
    nearby === 0 ? 0 : (nearby % 2 ? 1 : -1) * Math.ceil(nearby / 2) * tuning.respawnSpacing;
  // Never out past the road's edge (MK-61: a narrow bridge with a drop either side).
  const room = Math.max(0, geometry.project(geometry.pointAt(t)).width / 2 - tuning.kartHalfWidth);
  const lateral = Math.min(room, Math.max(-room, spread));
  const target = geometry.pointAt(t, lateral);

  kart.position = { ...target, y: target.y + tuning.respawnLift };
  kart.velocity = { x: 0, y: 0, z: 0 };
  kart.speed = 0;
  kart.heading = geometry.headingAt(t);
  kart.boostTimer = 0;
  kart.grounded = false;
  cancelDrift(kart, events);
  kart.respawnTimer = tuning.respawnSeconds;
  kart.respawnCooldown = tuning.respawnCooldownSeconds;
  kart.outTime = 0;
  // Lap tracking continues from here with no crossing (the move is a teleport).
  kart.race.lastT = t;
  events.push({ type: 'respawn', kartId: kart.id });
}

/** Lowers the kart onto the road over the respawn time; then it's free (and briefly invulnerable). */
function carry(kart: KartState, track: TrackDef, dt: number): void {
  kart.respawnTimer = Math.max(0, kart.respawnTimer - dt);
  const ground = groundAt(track, kart.position).height;
  const progress = 1 - kart.respawnTimer / tuning.respawnSeconds;
  kart.position = { ...kart.position, y: ground + tuning.respawnLift * (1 - progress) };
  kart.velocity = { x: 0, y: 0, z: 0 };
  if (kart.respawnTimer === 0) {
    kart.position = { ...kart.position, y: ground };
    kart.grounded = true;
    kart.invulnerableTimer = tuning.invulnerableSeconds;
  }
}

// --- Mesh tracks (MK-99): the route says where to put a kart back, and which way is up there ---

const VOID = surfaceMask('void');
const RESPAWN_GROUND = surfaceMask('road', 'offroad', 'boost', 'antigrav', 'glide');

/**
 * Falls and the respawn pickup on a mesh track: like a spline track's, but the kart is put back on
 * the route (at its respawn point if its last safe spot is in one's range) with the route's up
 * there, so a fall from a wall or a ceiling puts it back on that surface's own frame.
 */
function updateMeshRespawns(
  state: SimState,
  inputs: readonly InputFrame[],
  track: MeshTrackDef,
  dt: number,
  events: SimEvent[],
  only?: number,
): void {
  const geometry = routeGeometry(track.route);
  for (const kart of state.karts) {
    if (only !== undefined && kart.id !== only) continue;
    kart.respawnCooldown = Math.max(0, kart.respawnCooldown - dt);
    kart.invulnerableTimer = Math.max(0, kart.invulnerableTimer - dt);
    if (isRespawning(kart)) {
      carryOnSurface(kart, track, dt);
      continue;
    }
    // Landed on ground well below the road (off the course, under it): a fall too (MK-105).
    let below = false;
    if (kart.grounded) {
      // Last tick's progress (kept up in the air too, so a long jump lands where it should).
      const last = kart.race.lastT >= 0 ? kart.race.lastT : kart.lastSafeT;
      const t = geometry.project(kart.position, last >= 0 ? last : undefined).t;
      const frame = geometry.frameAt(t);
      below = dot(sub(kart.position, frame.position), frame.up) < -tuning.fallDepth;
      if (!below) kart.lastSafeT = t;
    }
    const fell =
      below ||
      kart.airTime > (kart.glide ? tuning.mk8.glide.fallSeconds : tuning.mk8.fallSeconds) ||
      kart.position.y < track.collision.gridMin[1] - tuning.fallDepth ||
      (!kart.grounded && overKillFloor(track, kart));
    const asked = inputs[kart.id]?.respawn === true && kart.respawnCooldown <= 0;
    if (fell || asked) startMeshRespawn(state, kart, track, geometry, events);
  }
}

/**
 * Whether a kart in the air is over the void floor, within `fallDepth` below it with no ground
 * in between (a bridge over a kill plane is fine to hop on).
 */
function overKillFloor(track: MeshTrackDef, kart: KartState): boolean {
  const down = kart.gravityDir ?? { x: 0, y: -1, z: 0 };
  const kill = raycastMesh(track.collision, kart.position, down, tuning.fallDepth, VOID);
  if (!kill) return false;
  return raycastMesh(track.collision, kart.position, down, kill.distance, RESPAWN_GROUND) === null;
}

function startMeshRespawn(
  state: SimState,
  kart: KartState,
  track: MeshTrackDef,
  geometry: RouteGeometry,
  events: SimEvent[],
): void {
  const safeT = kart.lastSafeT >= 0 ? kart.lastSafeT : geometry.project(kart.position).t;
  const t = track.route.respawnPoints.find((point) => inRange(safeT, point))?.t ?? safeT;
  const nearby = state.karts.filter(
    (other) =>
      other.id !== kart.id &&
      isRespawning(other) &&
      Math.abs(geometry.project(other.position).t - t) * geometry.length < 6,
  ).length;
  const spread =
    nearby === 0 ? 0 : (nearby % 2 ? 1 : -1) * Math.ceil(nearby / 2) * tuning.respawnSpacing;
  const centre = geometry.frameAt(t);
  const room = Math.max(0, centre.width / 2 - tuning.kartHalfWidth);
  const frame = geometry.frameAt(t, Math.min(room, Math.max(-room, spread)));

  kart.position = add(frame.position, scale(frame.up, tuning.respawnLift));
  kart.velocity = { x: 0, y: 0, z: 0 };
  kart.speed = 0;
  kart.up = frame.up;
  kart.forward = frame.tangent;
  kart.gravityDir = scale(frame.up, -1);
  kart.antigrav = false;
  kart.heading = headingOf(frame.tangent, kart.heading);
  kart.boostTimer = 0;
  kart.grounded = false;
  kart.airTime = 0;
  cancelDrift(kart, events);
  endGlide(kart, events);
  // Back on the road: whether it's in water is looked at afresh, without a splash (MK-107).
  delete kart.inWater;
  kart.respawnTimer = tuning.respawnSeconds;
  kart.respawnCooldown = tuning.respawnCooldownSeconds;
  kart.outTime = 0;
  kart.race.lastT = t;
  events.push({ type: 'respawn', kartId: kart.id });
}

/** Lowers the kart along its up onto the ground below over the respawn time. */
function carryOnSurface(kart: KartState, track: MeshTrackDef, dt: number): void {
  kart.respawnTimer = Math.max(0, kart.respawnTimer - dt);
  const up: Vec3 = kart.up ?? WORLD_UP;
  const down = scale(up, -1);
  const lift = tuning.meshTrack.groundProbeUp;
  const from = add(kart.position, scale(up, lift));
  const hit = raycastMesh(
    track.collision,
    from,
    down,
    lift + tuning.respawnLift * 2,
    RESPAWN_GROUND,
  );
  const progress = 1 - kart.respawnTimer / tuning.respawnSeconds;
  if (hit) kart.position = add(hit.point, scale(up, tuning.respawnLift * (1 - progress)));
  kart.velocity = { x: 0, y: 0, z: 0 };
  if (kart.respawnTimer === 0) {
    if (hit) kart.position = hit.point;
    kart.grounded = hit !== null;
    kart.invulnerableTimer = tuning.invulnerableSeconds;
  }
}
