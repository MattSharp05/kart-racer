import type { ItemContent } from '..';
import { updateStarLightning, useLightning } from '../../../sim/items/starLightning';

/** Lightning (MK-20): every rival spins out and shrinks (longer for karts further ahead). */
export default {
  id: 'lightning',
  name: 'Lightning',
  order: 60,
  // 1st place … 8th place.
  odds: [0, 0, 0, 0, 0.02, 0.04, 0.06, 0.08],
  onUse: (kart, state, events) => useLightning(kart, state, events),
  update: updateStarLightning,
} satisfies ItemContent;
