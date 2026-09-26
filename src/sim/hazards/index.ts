import { Registry } from '../../content/registry';
import { hitKart } from '../items/hit';
import type { Vec3 } from '../math';
import { isRespawning } from '../respawn';
import type { TrackDef } from '../track';
import { tuning } from '../tuning';
import type { KartState, SimEvent, SimState } from '../types';
import mover from './mover';
import periodic from './periodic';
import rotator from './rotator';
import type { HazardContact, HazardDef, HazardEffect, HazardKind, HazardPose } from './types';
import zoneEffect from './zoneEffect';

/**
 * Track hazards (MK-49). A track lists them in `hazards[]`; each kind's behaviour is a file in this
 * folder, registered below. Every hazard's pose is a pure function of the tick, so hazards add
 * nothing to `SimState` and cost no network data: host and clients compute the same poses.
 */
export const hazardKinds = new Registry<HazardKind>('hazard kind');
// One line per kind, alphabetical.
for (const kind of [mover, periodic, rotator, zoneEffect]) hazardKinds.register(kind as HazardKind);

/** `by` on the `kartHit` event for a hit from a hazard (no kart threw it). */
export const HAZARD_HITTER = -1;

/** The hazards of `track` (arenas have none). */
export function trackHazards(track: TrackDef): readonly HazardDef[] {
  return track.kind === 'spline' ? (track.hazards ?? []) : [];
}

/** Pose of `hazard` at `ticks` (may be fractional, for drawing between ticks). */
export function hazardPose(hazard: HazardDef, ticks: number): HazardPose {
  return hazardKinds.get(hazard.kind).pose(hazard, ticks);
}

/** Sideways grip multiplier at `position` at `tick` from the track's zone hazards (1 = none). */
export function hazardGrip(hazards: readonly HazardDef[], tick: number, position: Vec3): number {
  let grip = 1;
  for (const hazard of hazards) {
    const kind = hazardKinds.get(hazard.kind);
    if (kind.grip) grip *= kind.grip(hazard, kind.pose(hazard, tick), position);
  }
  return grip;
}

/**
 * The HUD warning of the first hazard about to switch on (within `tuning.hazards.warningSeconds`
 * of `tick`), e.g. "SANDSTORM!" before a sandstorm. Pure, like the poses.
 */
export function hazardWarning(hazards: readonly HazardDef[], tick: number): string | undefined {
  for (const hazard of hazards) {
    const kind = hazardKinds.get(hazard.kind);
    const text = kind.warning?.(hazard);
    if (!text || !kind.secondsUntilOn) continue;
    const seconds = kind.secondsUntilOn(hazard, tick);
    if (seconds > 0 && seconds <= tuning.hazards.warningSeconds) return text;
  }
  return undefined;
}

/**
 * Karts touching a hazard this tick are pushed clear and bumped, spun out or squashed, by the
 * hazard's effect. Runs after the karts have moved.
 */
export function updateHazards(
  state: SimState,
  hazards: readonly HazardDef[],
  events: SimEvent[],
): void {
  for (const hazard of hazards) {
    const kind = hazardKinds.get(hazard.kind);
    if (!kind.contact) continue;
    const pose = kind.pose(hazard, state.tick);
    for (const kart of state.karts) {
      if (isRespawning(kart) || kart.position.y - pose.y > tuning.hazards.clearance) continue;
      const contact = kind.contact(hazard, pose, kart.position, tuning.hazards.kartRadius);
      if (!contact) continue;
      applyContact(kart, contact, contact.effect ?? hazard.effect ?? kind.defaultEffect, events);
    }
  }
}

function applyContact(
  kart: KartState,
  contact: HazardContact,
  effect: HazardEffect,
  events: SimEvent[],
): void {
  if (effect === 'squash') {
    // Flattened where it stands: stopped dead, and out of control for longer than an item hit.
    if (!hitKart(kart, HAZARD_HITTER, 'hazard', events)) return;
    kart.velocity = { x: 0, y: 0, z: 0 };
    kart.speed = 0;
    const spin = tuning.spinSeconds * tuning.hazards.squashSpinFactor;
    kart.spinTimer = spin;
    kart.invulnerableTimer = spin + tuning.hitInvulnerableSeconds;
    return;
  }
  // Bump and spin both push the kart clear, so it never drives through the hazard.
  kart.position = {
    ...kart.position,
    x: kart.position.x + contact.nx * contact.depth,
    z: kart.position.z + contact.nz * contact.depth,
  };
  // Bounce off: outward speed becomes a share of the impact speed, and at least a small shove.
  const out = kart.velocity.x * contact.nx + kart.velocity.z * contact.nz;
  const into = Math.max(0, -out);
  const target = Math.max(into * tuning.hazards.bumpBounce, tuning.hazards.bumpMinSpeed);
  if (out < target) {
    kart.velocity = {
      x: kart.velocity.x + contact.nx * (target - out),
      y: kart.velocity.y,
      z: kart.velocity.z + contact.nz * (target - out),
    };
  }
  if (effect === 'spin' && hitKart(kart, HAZARD_HITTER, 'hazard', events)) return;
  events.push({ type: 'wallHit', kartId: kart.id, strength: into });
}
