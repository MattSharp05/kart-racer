import type { ItemContent } from '..';
import { updateStarLightning, useStar } from '../../../sim/items/starLightning';

/** Star (MK-20): faster and immune for a while; knocks karts it touches. */
export default {
  id: 'star',
  name: 'Star',
  order: 50,
  // 1st place … 8th place.
  odds: [0, 0, 0, 0, 0.12, 0.2, 0.25, 0.3],
  onUse: (kart, _state, events) => useStar(kart, events),
  update: updateStarLightning,
} satisfies ItemContent;
