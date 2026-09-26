import type { ItemContent } from '..';
import { applyBoost } from '../../../sim/drift';
import { tuning } from '../../../sim/tuning';

/** Boosts per pickup. */
export const TURBO_TRIO_USES = 3;

/**
 * Turbo Trio (MK-65): three boosts, one per press, each exactly a mushroom's (`mushroomSeconds`).
 * A multi-use item (MK-52): the HUD shows the uses left. The AI saves each boost for a straight.
 */
export default {
  id: 'turbo-trio',
  name: 'Turbo Trio',
  order: 110,
  // Mostly mid-to-back (1st place … 8th place); balanced in MK-72 (each row sums to 1).
  odds: [0, 0, 0.04, 0.09, 0.12, 0.15, 0.15, 0.14],
  uses: TURBO_TRIO_USES,
  onUse: (kart, _state, events) => applyBoost(kart, tuning.mushroomSeconds, events),
  aiUse: (_kart, _state, { straightAhead, giveUp }) =>
    giveUp || straightAhead(tuning.ai.straightLookAhead) < tuning.ai.straightCurvature,
} satisfies ItemContent;
