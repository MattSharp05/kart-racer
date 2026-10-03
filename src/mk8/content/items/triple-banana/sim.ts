import { useBanana } from '../../../../sim/items/banana';
import { escorts } from '../escort';
import { mk8ItemSim } from '../sim';
import { TRIPLE_USES } from '../triple-green/sim';

/**
 * Triple Bananas (MK-112): three bananas trail behind the kart, each stopping one hit from behind
 * (and spinning out a kart that runs into it); each press drops one behind, or throws it ahead
 * while accelerating, like a banana.
 */
export default mk8ItemSim({
  id: 'triple-banana',
  name: 'Triple Bananas',
  order: 330,
  uses: TRIPLE_USES,
  onUse: (kart, state, _events, input) => useBanana(kart, state, input),
  ...escorts('triple-banana', 'trail'),
});
