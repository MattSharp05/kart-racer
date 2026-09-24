import { clamp, forwardFromHeading } from '../math';
import { positionOf } from '../race';
import { getTrack, trackGeometry } from '../track';
import { tuning } from '../tuning';
import type { InputFrame, KartState, ShellEntity, SimEvent, SimState } from '../types';
import { nextEntityId } from './banana';
import { hitKart } from './hit';

/**
 * Fires a shell (MK-18 green, MK-19 red). Green goes forward, or backward while braking; red locks
 * onto the kart one place ahead (from 1st it flies straight like a green shell).
 */
export function fireShell(
  kart: KartState,
  state: SimState,
  input: InputFrame,
  colour: 'green' | 'red',
): void {
  const forward = forwardFromHeading(kart.heading);
  const backwards = colour === 'green' && input.brake > 0 && input.throttle === 0;
  const sign = backwards ? -1 : 1;
  const direction = { x: forward.x * sign, z: forward.z * sign };
  let targetId = -1;
  if (colour === 'red') {
    const place = positionOf(state, kart.id);
    targetId = place > 1 ? (state.positions[place - 2] ?? -1) : -1;
  }
  const top = tuning.topSpeed[state.engineClass];
  state.entities.push({
    id: nextEntityId(state),
    kind: 'shell',
    colour,
    position: {
      x: kart.position.x + direction.x * tuning.shellSpawnDistance,
      y: kart.position.y,
      z: kart.position.z + direction.z * tuning.shellSpawnDistance,
    },
    direction,
    speed: top * (colour === 'green' ? tuning.greenShellSpeed : tuning.redShellSpeed),
    bounces: 0,
    life: colour === 'green' ? tuning.greenShellLife : tuning.redShellLife,
    ownerId: kart.id,
    ownerImmune: tuning.shellOwnerImmuneSeconds,
    targetId,
  });
}

/** Turns `shell.direction` towards the point (x, z), at most `maxTurn` radians. */
function steerTowards(shell: ShellEntity, x: number, z: number, maxTurn: number): void {
  const want = Math.atan2(z - shell.position.z, x - shell.position.x);
  const have = Math.atan2(shell.direction.z, shell.direction.x);
  let delta = want - have;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const angle = have + clamp(delta, -maxTurn, maxTurn);
  shell.direction = { x: Math.cos(angle), z: Math.sin(angle) };
}

/** Red shells steer: along the track while far away, straight at the target once close. */
function home(shell: ShellEntity, state: SimState, dt: number): void {
  const target = state.karts[shell.targetId];
  const track = getTrack(state.trackId);
  if (!target || track.kind !== 'spline') return;
  const maxTurn = tuning.redTurnRate * dt;
  const dx = target.position.x - shell.position.x;
  const dz = target.position.z - shell.position.z;
  if (Math.hypot(dx, dz) <= tuning.redHomingRange) {
    steerTowards(shell, target.position.x, target.position.z, maxTurn);
    return;
  }
  const geometry = trackGeometry(track);
  const here = geometry.project(shell.position);
  const ahead = geometry.pointAt(here.t + tuning.redLookAhead / geometry.length, 0);
  steerTowards(shell, ahead.x, ahead.z, maxTurn);
}

/**
 * Moves one shell and handles walls. Returns false when it's gone (fell off, used up its bounces,
 * or — red — hit a wall).
 */
function moveShell(shell: ShellEntity, state: SimState, dt: number): boolean {
  const track = getTrack(state.trackId);
  if (shell.colour === 'red' && shell.targetId >= 0) home(shell, state, dt);
  shell.position = {
    x: shell.position.x + shell.direction.x * shell.speed * dt,
    y: shell.position.y,
    z: shell.position.z + shell.direction.z * shell.speed * dt,
  };
  if (track.kind !== 'spline') return true;
  const geometry = trackGeometry(track);
  const p = geometry.project(shell.position);
  const wall = geometry.wallOffset(p.width) - tuning.shellRadius;
  const side = p.lateral >= 0 ? 1 : -1;
  if (Math.abs(p.lateral) > wall) {
    if (!geometry.hasWall(p.t, side === 1 ? 'right' : 'left')) {
      if (p.surface === 'out') return false; // off the edge where there's no wall
    } else {
      if (shell.colour === 'red' && shell.targetId >= 0) return false;
      shell.bounces += 1;
      if (shell.bounces > tuning.greenShellBounces) return false;
      // Reflect off the wall (its normal points out of the track on this side) and step back inside.
      const n = { x: p.normal.x * side, z: p.normal.z * side };
      const into = shell.direction.x * n.x + shell.direction.z * n.z;
      if (into > 0) {
        shell.direction = {
          x: shell.direction.x - 2 * into * n.x,
          z: shell.direction.z - 2 * into * n.z,
        };
      }
      const over = Math.abs(p.lateral) - wall;
      shell.position = {
        ...shell.position,
        x: shell.position.x - n.x * over,
        z: shell.position.z - n.z * over,
      };
    }
  }
  shell.position = { ...shell.position, y: geometry.project(shell.position).groundY };
  return true;
}

/** Moves shells; they hit karts, and knock out bananas and other shells (both vanish). */
export function updateShells(state: SimState, dt: number, events: SimEvent[]): void {
  const gone = new Set<number>();
  const shells = state.entities.filter((e): e is ShellEntity => e.kind === 'shell');
  for (const shell of shells) {
    shell.life -= dt;
    shell.ownerImmune = Math.max(0, shell.ownerImmune - dt);
    if (shell.life <= 0 || !moveShell(shell, state, dt)) {
      gone.add(shell.id);
      continue;
    }
    // Blocked by a banana or another shell.
    const blocker = state.entities.find(
      (e) =>
        e.id !== shell.id &&
        !gone.has(e.id) &&
        (e.kind === 'shell' || (e.kind === 'banana' && e.flightTimer === 0)) &&
        Math.hypot(e.position.x - shell.position.x, e.position.z - shell.position.z) <
          tuning.shellBlockRadius,
    );
    if (blocker) {
      gone.add(shell.id);
      gone.add(blocker.id);
      continue;
    }
    for (const kart of state.karts) {
      if (kart.id === shell.ownerId && shell.ownerImmune > 0) continue;
      if (kart.respawnTimer > 0) continue;
      const d = Math.hypot(kart.position.x - shell.position.x, kart.position.z - shell.position.z);
      if (d > tuning.shellHitRadius || Math.abs(kart.position.y - shell.position.y) > 2) continue;
      // A shell breaks on any kart it touches; only vulnerable karts are knocked about.
      hitKart(kart, shell.ownerId, shell.colour, events);
      gone.add(shell.id);
      break;
    }
  }
  if (gone.size) state.entities = state.entities.filter((e) => !gone.has(e.id));
}
