import type { Scenario } from '../../../scenarios/registry';
import { kartOnTrack } from '../../../scenarios/tracks';
import { giveItem } from '../../../sim/items';
import { tuning } from '../../../sim/tuning';

/** Turbo Trio (MK-65): registered from this folder (`content/items/scenarios.ts`). */
const scenarios: Scenario[] = [
  {
    name: 'item-turbo-trio',
    group: 'Items',
    description:
      'Turbo Trio (MK-65): rolling down Sunny Circuit’s main straight holding it (×3). Each press is a mushroom boost; the slot counts ×3 → ×2 → ×1, then empties.',
    defaultSeed: 1,
    setup: (seed) => {
      const state = kartOnTrack(seed, 'sunny-circuit', 0.02, {
        speed: tuning.topSpeed[100] * 0.5,
      });
      const [kart] = state.karts;
      if (kart) giveItem(kart, 'turbo-trio');
      return { state };
    },
  },
];

export default scenarios;
