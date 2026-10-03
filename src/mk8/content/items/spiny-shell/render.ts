import type { ItemView } from '../../../../content/items/views';
import { ItemEntityRenderer } from '../../../../render/entities';
import { TICK_RATE, tuning } from '../../../../sim/tuning';
import { animateExplosion, explosionModel, spinyModel } from '../looks';
import { SPINY_BLAST } from './sim';

/**
 * How the Spiny Shell (MK-113) looks in our HUD and without a pack: a winged blue shell and its
 * explosion (with a pack, the `mk8` item skin draws the shell with the pack's model); see `./sim.ts`.
 */
export default {
  id: 'spiny-shell',
  icon: '<path d="M10 38a22 20 0 0 1 44 0z" fill="#2f6fe4" stroke="#163f8f" stroke-width="2"/><ellipse cx="32" cy="40" rx="24" ry="7" fill="#fff"/><path d="M18 22l3 8M32 14v10M46 22l-3 8M25 17l2 9M39 17l-2 9" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M6 30l-4-8 10 4zM58 30l4-8-10 4z" fill="#fff"/>',
  useSound: 'shell',
  renderer: ItemEntityRenderer,
  entityModel: (entity) => (entity.spec === SPINY_BLAST ? explosionModel() : spinyModel()),
  animateEntity: (model, entity) => {
    if (entity.spec !== SPINY_BLAST) return;
    const life = Math.round(tuning.mk8.spinyBlastSeconds * TICK_RATE);
    animateExplosion(model, entity.age, life, tuning.mk8.spinyRadius);
  },
} satisfies ItemView;
