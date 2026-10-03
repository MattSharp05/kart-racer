import type { ItemView } from '../../../../content/items/views';
import { ItemEntityRenderer } from '../../../../render/entities';
import { TICK_RATE, tuning } from '../../../../sim/tuning';
import { waveModel } from '../looks';

/**
 * How the Super Horn (MK-113) looks in our HUD and its shockwave, a ring spreading to its reach (the
 * held horn is the pack's model with a pack); see `./sim.ts`.
 */
export default {
  id: 'super-horn',
  icon: '<path d="M8 26h10l24-14v40L18 38H8z" fill="#f4b400" stroke="#8a5a00" stroke-width="2" stroke-linejoin="round"/><path d="M48 22c5 5 5 15 0 20M54 16c9 9 9 23 0 32" stroke="#ffe066" stroke-width="4" fill="none" stroke-linecap="round"/>',
  useSound: 'bump',
  renderer: ItemEntityRenderer,
  entityModel: () => waveModel(),
  animateEntity: (model, entity) => {
    const life = Math.round(tuning.mk8.hornWaveSeconds * TICK_RATE);
    const k = Math.min(1, entity.age / Math.max(1, life));
    model.scale.setScalar(tuning.mk8.hornRadius * (0.2 + 0.8 * k));
  },
} satisfies ItemView;
