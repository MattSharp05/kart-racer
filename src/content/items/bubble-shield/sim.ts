import type { ItemContent } from '..';
import { applyEffect } from '../../../sim/items/effects';
import { positionOf } from '../../../sim/race';
import { DT } from '../../../sim/tuning';
import type { KartState, SimState } from '../../../sim/types';

/** Ticks per second (the sim runs at 60 Hz). */
const S = Math.round(1 / DT);

/** The bubble lasts 8 s, or until it blocks a hit. */
export const SHIELD_TICKS = 8 * S;
/** AI: a projectile this close (m)… */
export const INCOMING_RANGE = 30;
/** …flying at it within this cone (cosine of the angle between its path and the kart) is incoming. */
export const INCOMING_CONE = 0.8;

/**
 * Bubble Shield (MK-66): a bubble around the kart for 8 s that blocks the next hit (shells,
 * bananas, oil, other items' entities, lightning, spinning hazards) and pops. A crusher still
 * flattens a shielded kart (`IncomingHit.crush`). Its look and sounds are in `./render.ts`.
 */
export default {
  id: 'bubble-shield',
  name: 'Bubble Shield',
  order: 140,
  // Front and mid (1st place … 8th place); relative weights, the balance pass (MK-72) tunes them.
  odds: [0.15, 0.15, 0.12, 0.1, 0.06, 0, 0, 0],
  onUse: (kart, state, events) => applyEffect(kart, 'bubble-shield', SHIELD_TICKS, state, events),
  // AI: raise it when a projectile is coming, or straight away when leading.
  aiUse: (kart, state) => positionOf(state, kart.id) === 1 || projectileIncoming(kart, state),
  effects: [
    {
      id: 'bubble-shield',
      // Blocks one hit (not a crusher), then pops.
      onHit: (kart, effect, hit, events) => {
        if (hit.crush) return false;
        effect.ticksLeft = 0;
        events.push({ type: 'itemFx', kartId: kart.id, item: 'bubble-shield', fx: 'pop' });
        return true;
      },
    },
  ],
} satisfies ItemContent;

/**
 * Whether someone else's shell or item projectile is heading for `kart`: chasing it, or within
 * `INCOMING_RANGE` m and flying at it.
 */
export function projectileIncoming(kart: KartState, state: SimState): boolean {
  return state.entities.some((e) => {
    if ((e.kind !== 'shell' && e.kind !== 'item') || e.ownerId === kart.id) return false;
    if (e.kind === 'item' && e.speed === 0) return false;
    const dx = kart.position.x - e.position.x;
    const dz = kart.position.z - e.position.z;
    const d = Math.hypot(dx, dz);
    if (d > INCOMING_RANGE) return false;
    if (e.targetId === kart.id) return true;
    return d > 0 && (e.direction.x * dx + e.direction.z * dz) / d > INCOMING_CONE;
  });
}
