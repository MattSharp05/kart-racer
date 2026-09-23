import { add, forwardFromHeading, scale } from './math';
import { DT, PLACEHOLDER_SPEED } from './tuning';
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
  next.tick += 1;

  for (const kart of next.karts) {
    const input = inputs[kart.id] ?? NEUTRAL_INPUT;
    // Placeholder motion until real kart physics (MK-5).
    kart.speed = input.throttle * PLACEHOLDER_SPEED;
    kart.position = add(kart.position, scale(forwardFromHeading(kart.heading), kart.speed * dt));
  }

  return { state: next, events };
}
