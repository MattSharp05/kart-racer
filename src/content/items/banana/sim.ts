import type { ItemContent } from '..';
import { updateBananas, useBanana } from '../../../sim/items/banana';

/** Banana (MK-17): dropped behind, or thrown ahead while accelerating; spins out whoever hits it. */
export default {
  id: 'banana',
  name: 'Banana',
  order: 20,
  // 1st place … 8th place.
  odds: [0.28, 0.16, 0.1, 0.06, 0, 0, 0, 0],
  onUse: (kart, state, _events, input) => useBanana(kart, state, input),
  update: updateBananas,
} satisfies ItemContent;
