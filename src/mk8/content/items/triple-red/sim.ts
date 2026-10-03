import { fireShell } from '../../../../sim/items/shell';
import { escorts } from '../escort';
import { mk8ItemSim } from '../sim';
import { TRIPLE_USES } from '../triple-green/sim';

/**
 * Triple Red Shells (MK-112): three red shells circle the kart, each stopping one hit from behind
 * (and breaking on a kart or item it touches); each press fires one, homing on the kart ahead like
 * a red shell.
 */
export default mk8ItemSim({
  id: 'triple-red',
  name: 'Triple Red Shells',
  order: 320,
  uses: TRIPLE_USES,
  onUse: (kart, state, _events, input) => fireShell(kart, state, input, 'red'),
  ...escorts('triple-red', 'orbit'),
});
