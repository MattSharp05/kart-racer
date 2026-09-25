import type { ItemContent } from '..';
import { fireShell, updateShells } from '../../../sim/items/shell';

/** Red shell (MK-19): homes in on the kart ahead. */
export default {
  id: 'red',
  name: 'Red shell',
  order: 40,
  // 1st place … 8th place.
  odds: [0, 0.2, 0.35, 0.4, 0.35, 0.3, 0.25, 0.2],
  onUse: (kart, state, _events, input) => fireShell(kart, state, input, 'red'),
  update: updateShells,
} satisfies ItemContent;
