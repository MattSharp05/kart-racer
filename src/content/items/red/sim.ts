import type { ItemContent } from '..';
import { fireShell, updateShells } from '../../../sim/items/shell';

/** Red shell (MK-19): homes in on the kart ahead. */
export default {
  id: 'red',
  name: 'Red shell',
  order: 40,
  // 1st place … 8th place.
  odds: [0, 0.1, 0.17, 0.2, 0.17, 0.15, 0.13, 0.11],
  onUse: (kart, state, _events, input) => fireShell(kart, state, input, 'red'),
  update: updateShells,
} satisfies ItemContent;
