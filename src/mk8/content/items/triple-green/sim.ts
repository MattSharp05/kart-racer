import { fireShell } from '../../../../sim/items/shell';
import { escorts } from '../escort';
import { mk8ItemSim } from '../sim';

/** Uses per pickup of a triple item: three shells, bananas or mushrooms. */
export const TRIPLE_USES = 3;

/**
 * Triple Green Shells (MK-112): three green shells circle the kart, each stopping one hit from
 * behind (and breaking on a kart or item it touches); each press fires one, straight like a green
 * shell (backwards while braking).
 */
export default mk8ItemSim({
  id: 'triple-green',
  name: 'Triple Green Shells',
  order: 310,
  uses: TRIPLE_USES,
  onUse: (kart, state, _events, input) => fireShell(kart, state, input, 'green'),
  ...escorts('triple-green', 'orbit'),
});
