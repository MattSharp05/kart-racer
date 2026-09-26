import { resolveKartCollisions } from './collisions';
import { hazardGrip, hazardPush, trackHazards, updateHazards } from './hazards';
import { updateKart } from './kart';
import { updateRace } from './race';
import { afterRace, beforeMovement } from './raceFlow';
import { updateItems } from './items';
import { isRespawning, updateRespawns } from './respawn';
import { getTrack } from './track';
import { DT } from './tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type SimEvent,
  type SimState,
  type StepResult,
} from './types';

/**
 * Advances the simulation by one fixed tick. Pure: never mutates `state`.
 * `inputs[i]` drives kart i; missing inputs count as neutral.
 */
export function step(state: SimState, inputs: readonly InputFrame[], dt = DT): StepResult {
  const next = structuredClone(state);
  const events: SimEvent[] = [];
  const track = getTrack(next.trackId);
  next.tick += 1;

  const { inputs: resolved, frozen } = beforeMovement(next, inputs, track, events);
  if (frozen) return { state: next, events };

  const positionsBefore = new Map(next.karts.map((kart) => [kart.id, kart.position]));
  const hazards = trackHazards(track);
  for (const kart of next.karts) {
    if (isRespawning(kart)) continue;
    const input = kart.spinTimer > 0 ? NEUTRAL_INPUT : (resolved[kart.id] ?? NEUTRAL_INPUT);
    const grip = hazards.length ? hazardGrip(hazards, next.tick, kart.position) : 1;
    const push = hazards.length ? hazardPush(hazards, next.tick, kart.position) : undefined;
    updateKart(kart, input, next.engineClass, track, dt, events, {
      tick: next.tick,
      grip,
      ...(push ? { push } : {}),
    });
  }
  // Hazards (MK-49) push, spin or squash karts that touch them; their poses depend only on the tick.
  if (hazards.length) updateHazards(next, hazards, events);
  // Karts being carried by the pickup drone don't collide.
  resolveKartCollisions(
    next.karts.filter((kart) => !isRespawning(kart)),
    positionsBefore,
    events,
  );
  updateRespawns(next, resolved, track, dt, events);
  updateItems(next, resolved, dt, events);
  updateRace(next, track, events, dt);
  afterRace(next, events);

  return { state: next, events };
}
