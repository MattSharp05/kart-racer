import { updateKart } from './kart';
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

  for (const kart of next.karts) {
    updateKart(kart, inputs[kart.id] ?? NEUTRAL_INPUT, next.engineClass, track, dt, events);
  }

  return { state: next, events };
}
