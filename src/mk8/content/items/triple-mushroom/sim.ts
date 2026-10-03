import { mushroomTactic } from '../../../../sim/ai/itemTactics';
import { applyBoost } from '../../../../sim/drift';
import { tuning } from '../../../../sim/tuning';
import { mk8ItemSim } from '../sim';
import { TRIPLE_USES } from '../triple-green/sim';

/**
 * Triple Mushrooms (MK-112): three boosts, one per press, each a mushroom's. MK8 races hand it out
 * in place of our Turbo Trio (the same item with our look).
 */
export default mk8ItemSim({
  id: 'triple-mushroom',
  name: 'Triple Mushrooms',
  order: 340,
  uses: TRIPLE_USES,
  onUse: (kart, _state, events) => applyBoost(kart, tuning.mushroomSeconds, events),
  // AI (MK-129): each boost on a straight, like a mushroom.
  aiUse: mushroomTactic,
});
