import type { ItemContent } from '..';
import { applyEffect } from '../../../sim/items/effects';
import { positionOf } from '../../../sim/race';
import { rngRange } from '../../../sim/rng';
import { DT } from '../../../sim/tuning';
import type { KartEffect, KartState, SimState } from '../../../sim/types';

/** Ticks per second (the sim runs at 60 Hz). */
const S = Math.round(1 / DT);

/** Ink lasts 4 s… */
export const INK_TICKS = 4 * S;
/** …and wears off this many times as fast while the kart is boosting (a boost clears it). */
export const INK_BOOST_CLEAR = 3;
/** The splats fade out over the last this-many ticks (the HUD overlay's opacity). */
export const INK_FADE_TICKS = Math.round(1.5 * S);
/**
 * Inked AI drivers: a seeded random nudge on the wheel of up to ± this (steer is −1…1), a new one
 * every `INK_NOISE_TICKS`, and they look only this fraction as far down the racing line.
 */
export const INK_STEER_NOISE = 0.45;
export const INK_NOISE_TICKS = Math.round(0.35 * S);
export const INK_LOOK_AHEAD = 0.5;

/** `effect.data`: the current steering nudge, and ticks until the next one. */
const NUDGE = 0;
const NEXT_NUDGE = 1;

/** The karts ahead of `kart` in the race that are still racing (the ones it inks). */
export function inkTargets(kart: KartState, state: SimState): KartState[] {
  const place = positionOf(state, kart.id);
  return state.positions
    .slice(0, Math.max(0, place - 1))
    .flatMap((id) => state.karts[id] ?? [])
    .filter((k) => k.race.finishTick === undefined);
}

/** How opaque the ink on a player's screen is: solid, then fading over the last 1.5 s. */
export function inkOpacity(effect: KartEffect): number {
  return Math.max(0, Math.min(1, effect.ticksLeft / INK_FADE_TICKS));
}

/** One inked tick: a boost wipes it faster; AI karts get a new seeded wheel nudge now and then. */
function inkTick(kart: KartState, effect: KartEffect, state: SimState) {
  if (kart.boostTimer > 0) effect.ticksLeft -= INK_BOOST_CLEAR - 1;
  if (kart.controller !== 'ai') return;
  effect.data[NEXT_NUDGE] = (effect.data[NEXT_NUDGE] ?? 0) - 1;
  if (effect.data[NEXT_NUDGE] > 0) return;
  effect.data[NUDGE] = rngRange(state, -INK_STEER_NOISE, INK_STEER_NOISE);
  effect.data[NEXT_NUDGE] = INK_NOISE_TICKS;
}

/**
 * Ink Cloud (MK-68): every racer ahead of you gets inked for 4 s. Players see ink splats over
 * about 40% of the screen (the HUD overlay in `./render.ts`, fading out; a boost clears it faster);
 * AI drivers get seeded steering noise and a shorter look-ahead (`aiDriving`). It's sim state (a
 * kart effect), so online the host decides who's inked and each client draws its own overlay.
 * It isn't a hit: shields, Phase and stars don't stop ink.
 */
export default {
  id: 'ink-cloud',
  name: 'Ink Cloud',
  order: 200,
  // Mid and back (1st place … 8th place); balanced in MK-72 (each row sums to 1).
  odds: [0, 0, 0.03, 0.06, 0.07, 0.08, 0.08, 0.07],
  onUse: (kart, state, events) => {
    for (const target of inkTargets(kart, state)) {
      applyEffect(target, 'ink-cloud', INK_TICKS, state, events, { by: kart.id, data: [0, 0] });
      events.push({ type: 'itemFx', kartId: target.id, item: 'ink-cloud', fx: 'splat' });
    }
  },
  // AI: when in the back half of the field; having given up, from anywhere but 1st (no one to ink).
  aiUse: (kart, state, ctx) => {
    const place = positionOf(state, kart.id);
    return place > state.karts.length / 2 || (ctx.giveUp && place > 1);
  },
  effects: [
    {
      id: 'ink-cloud',
      onTick: (kart, effect, state) => inkTick(kart, effect, state),
      aiDriving: (_kart, effect) => ({ steer: effect.data[NUDGE] ?? 0, lookAhead: INK_LOOK_AHEAD }),
    },
  ],
} satisfies ItemContent;
