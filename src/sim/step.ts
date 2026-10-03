import { cloneJson } from './clone';
import { resolveKartCollisions } from './collisions';
import { hazardGrip, hazardPush, trackHazards, updateHazards } from './hazards';
import { updateKart } from './kart';
import { updateRace } from './race';
import { afterRace, beforeMovement } from './raceFlow';
import { updateItems } from './items';
import { driveByEffect } from './items/effects';
import { isRespawning, updateRespawns } from './respawn';
import { updateMeshKart } from './surfaceKart';
import { getTrack } from './track';
import { DT } from './tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type KartState,
  type SimEvent,
  type SimState,
  type StepResult,
} from './types';

/** A kart-only step's stand-in invulnerability while items move (`StepOptions.only`), s. */
const HOST_DECIDES_HITS = 1e9;

export interface StepOptions {
  /**
   * Simulate only this kart (MK-74: an online client predicting just its own kart). Every other
   * kart coasts on its velocity: no input, no AI thinking, no bumps, and its laps, falls, item
   * boxes and race position stay as they were; no item or hazard touches it, and no item hits
   * anyone (the host's snapshots put all that right). This kart and thrown items run as usual.
   */
  only?: number;
}

/**
 * Advances the simulation by one fixed tick. Pure: never mutates `state`.
 * `inputs[i]` drives kart i; missing inputs count as neutral.
 */
export function step(
  state: SimState,
  inputs: readonly InputFrame[],
  dt = DT,
  options: StepOptions = {},
): StepResult {
  const next = cloneJson(state);
  const events: SimEvent[] = [];
  const track = getTrack(next.trackId);
  next.tick += 1;

  const { only } = options;
  const { inputs: resolved, frozen } = beforeMovement(next, inputs, track, events, only);
  if (frozen) return { state: next, events };

  const positionsBefore = new Map(next.karts.map((kart) => [kart.id, kart.position]));
  const hazards = trackHazards(track);
  for (const kart of next.karts) {
    if (isRespawning(kart)) continue;
    if (only !== undefined && kart.id !== only) {
      coast(kart, dt);
      continue;
    }
    // An effect may drive the kart itself (MK-120: Bullet Bill), ignoring its input.
    if (driveByEffect(kart, next, dt, events, resolved)) continue;
    const input = kart.spinTimer > 0 ? NEUTRAL_INPUT : (resolved[kart.id] ?? NEUTRAL_INPUT);
    // Mesh tracks (MK-99, ADR 0011): surface-frame physics, so karts can drive walls and ceilings.
    if (track.kind === 'mesh') {
      updateMeshKart(kart, input, next.engineClass, track, dt, events, next.tick);
      continue;
    }
    const grip = hazards.length ? hazardGrip(hazards, next.tick, kart.position) : 1;
    const push = hazards.length ? hazardPush(hazards, next.tick, kart.position) : undefined;
    updateKart(kart, input, next.engineClass, track, dt, events, {
      tick: next.tick,
      grip,
      ...(push ? { push } : {}),
    });
  }
  // Hazards (MK-49) push, spin or squash karts that touch them; their poses depend only on the tick.
  if (hazards.length) updateHazards(next, hazards, events, only);
  // Karts being carried by the pickup drone don't collide. Simulating one kart, the others are
  // guesses: bumps with them are the host's to decide (MK-74), and arrive with its snapshots.
  if (only === undefined)
    resolveKartCollisions(
      next.karts.filter((kart) => !isRespawning(kart)),
      positionsBefore,
      events,
    );
  updateRespawns(next, resolved, track, dt, events, only);
  // Item hits are the host's to decide too: in a kart-only step, nobody can be hit while items move.
  const invulnerable = only === undefined ? null : next.karts.map((kart) => kart.invulnerableTimer);
  if (invulnerable) for (const kart of next.karts) kart.invulnerableTimer = HOST_DECIDES_HITS;
  updateItems(next, resolved, dt, events, only);
  if (invulnerable)
    next.karts.forEach((kart, i) => (kart.invulnerableTimer = invulnerable[i] ?? 0));
  updateRace(next, track, events, dt, only);
  afterRace(next, events);

  return { state: next, events };
}

/** A kart `step` doesn't simulate (`StepOptions.only`): it carries on along its velocity. */
function coast(kart: KartState, dt: number): void {
  kart.position = {
    x: kart.position.x + kart.velocity.x * dt,
    y: kart.position.y + kart.velocity.y * dt,
    z: kart.position.z + kart.velocity.z * dt,
  };
}
