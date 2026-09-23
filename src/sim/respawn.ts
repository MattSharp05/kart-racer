import { cancelDrift } from './drift';
import type { SplineTrackDef } from './splineTrack';
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
): void {
  if (track.kind !== 'spline') return;
  const geometry = trackGeometry(track);
  for (const kart of state.karts) {
    kart.respawnCooldown = Math.max(0, kart.respawnCooldown - dt);
    kart.invulnerableTimer = Math.max(0, kart.invulnerableTimer - dt);

    if (isRespawning(kart)) {
      carry(kart, track, dt);
      continue;
    }

    const ground = groundAt(track, kart.position);
    const p = geometry.project(kart.position);
    if (kart.grounded && ground.surface !== 'out') kart.lastSafeT = p.t;
    kart.outTime = ground.surface === 'out' ? kart.outTime + dt : 0;
    const fell = kart.position.y < p.groundY - tuning.fallDepth || kart.outTime > tuning.outSeconds;
    const asked = inputs[kart.id]?.respawn === true && kart.respawnCooldown <= 0;
    if (fell || asked) startRespawn(state, kart, track, events);
  }
}

function startRespawn(state: SimState, kart: KartState, track: SplineTrackDef, events: SimEvent[]) {
  const geometry = trackGeometry(track);
  const t = kart.lastSafeT >= 0 ? kart.lastSafeT : geometry.project(kart.position).t;
  // Spread out karts being put back at (nearly) the same spot.
  const nearby = state.karts.filter(
    (other) =>
      other.id !== kart.id &&
      isRespawning(other) &&
      Math.abs(geometry.project(other.position).t - t) * geometry.length < 6,
  ).length;
  const lateral =
    nearby === 0 ? 0 : (nearby % 2 ? 1 : -1) * Math.ceil(nearby / 2) * tuning.respawnSpacing;
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
