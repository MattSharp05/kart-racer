import { tuning } from '../tuning';
import type { KartState, SimState } from '../types';

/**
 * Hands `kart` to the AI (MK-70: an online player dropped): controller `ai` with the fixed takeover
 * personality from `tuning.ai`. Mutates `kart`; a kart the AI already drives is left as it is.
 */
export function driveByAi(kart: KartState): void {
  if (kart.controller === 'ai' && kart.ai) return;
  const ai = tuning.ai;
  kart.controller = 'ai';
  kart.ai = {
    lineOffset: ai.takeoverLineOffset,
    skill: ai.takeoverSkill,
    aggression: ai.takeoverAggression,
    stuckTime: 0,
    recoverTime: 0,
  };
}

/**
 * `state` with kart `kartId` driven by the AI from the next tick on (see `driveByAi`). Pure: returns
 * a new state and leaves `state` as it was. The race then ends once the remaining people finish.
 */
export function handToAi(state: SimState, kartId: number): SimState {
  const kart = state.karts[kartId];
  if (!kart || (kart.controller === 'ai' && kart.ai)) return state;
  const next = structuredClone(state);
  const taken = next.karts[kartId];
  if (taken) driveByAi(taken);
  return next;
}
