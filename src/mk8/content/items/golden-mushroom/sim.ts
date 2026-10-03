import { onStraight } from '../../../../sim/ai/itemTactics';
import { applyBoost } from '../../../../sim/drift';
import { applyEffect, hasEffect } from '../../../../sim/items/effects';
import { TICK_RATE, tuning } from '../../../../sim/tuning';
import { mk8ItemSim } from '../sim';

/** The Golden Mushroom's timer: a kart effect, so it counts down in the sim and in snapshots. */
export const GOLDEN = 'golden-mushroom';

/**
 * Golden Mushroom (MK-112): a mushroom's boost on every press, as often as you like, for
 * `tuning.mk8.goldenTime` s from the first; then it's gone. The item stays in slot 1 meanwhile (each
 * use puts it back), and the timer's effect clears it when it runs out.
 */
export default mk8ItemSim({
  id: GOLDEN,
  name: 'Golden Mushroom',
  order: 350,
  onUse: (kart, state, events) => {
    applyBoost(kart, tuning.mushroomSeconds, events);
    if (!hasEffect(kart, GOLDEN)) {
      applyEffect(kart, GOLDEN, Math.round(tuning.mk8.goldenTime * TICK_RATE), state, events);
    }
    // The press emptied the slot (one use): it stays until the timer ends.
    kart.item.held = GOLDEN;
    kart.item.uses = 1;
  },
  // AI (MK-129): the first boost on a straight; then boost after boost, each as the last runs out.
  aiUse: (kart, _state, ctx) =>
    hasEffect(kart, GOLDEN)
      ? kart.boostTimer < tuning.mk8.aiGoldenChain
      : onStraight(ctx) || ctx.giveUp,
  effects: [
    {
      id: GOLDEN,
      onExpire: (kart) => {
        if (kart.item.held !== GOLDEN || kart.item.roulette > 0) return;
        kart.item.held = null;
        kart.item.uses = 0;
      },
    },
  ],
});
