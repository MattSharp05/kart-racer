import type { ItemContent } from '..';
import { fireShell, updateShells } from '../../../sim/items/shell';

/** Green shell (MK-18): flies straight and bounces off walls. */
export default {
  id: 'green',
  name: 'Green shell',
  order: 30,
  // 1st place … 8th place.
  odds: [0.4, 0.3, 0.2, 0.15, 0.1, 0, 0, 0],
  onUse: (kart, state, _events, input) => fireShell(kart, state, input, 'green'),
  update: updateShells,
} satisfies ItemContent;
