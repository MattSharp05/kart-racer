import type { ItemContent } from '..';
import { applyBoost } from '../../../sim/drift';
import { tuning } from '../../../sim/tuning';

/** Mushroom (MK-16): a short speed boost. */
export default {
  id: 'mushroom',
  name: 'Mushroom',
  order: 10,
  // 1st place … 8th place.
  odds: [0.15, 0.25, 0.3, 0.35, 0.35, 0.35, 0.3, 0.25],
  onUse: (kart, _state, events) => applyBoost(kart, tuning.mushroomSeconds, events),
} satisfies ItemContent;
