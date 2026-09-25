import type { ItemContent } from '..';
import { updateStarLightning, useLightning } from '../../../sim/items/starLightning';

/** Lightning (MK-20): every rival spins out and shrinks (longer for karts further ahead). */
export default {
  id: 'lightning',
  name: 'Lightning',
  order: 60,
  // 1st place … 8th place.
  odds: [0, 0, 0, 0, 0.08, 0.15, 0.2, 0.25],
  onUse: (kart, state, events) => useLightning(kart, state, events),
  update: updateStarLightning,
} satisfies ItemContent;
