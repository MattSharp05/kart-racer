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
  // Mostly mid-to-back (1st place … 8th place); relative weights, the balance pass (MK-72) tunes them.
  odds: [0, 0, 0.05, 0.1, 0.15, 0.2, 0.2, 0.15],
  uses: TURBO_TRIO_USES,
  onUse: (kart, _state, events) => applyBoost(kart, tuning.mushroomSeconds, events),
  aiUse: (_kart, _state, { straightAhead }) =>
    straightAhead(tuning.ai.straightLookAhead) < tuning.ai.straightCurvature,
} satisfies ItemContent;
