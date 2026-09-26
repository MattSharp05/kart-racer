import { countDown } from '../math';
import { positionOf } from '../race';
import { tuning } from '../tuning';
import type { KartState, SimEvent, SimState } from '../types';
import { hitKart, tryHit } from './hit';

/** Star (MK-20): 6 s of speed, immunity, and knocking over anyone you touch. */
export function useStar(kart: KartState, events: SimEvent[]): void {
  kart.starTimer = tuning.starSeconds;
  events.push({ type: 'star', kartId: kart.id });
}

/** How long lightning shrinks a kart in `place` (1 = leader) out of `count`: 8 s for 1st → 3 s last. */
export function shrinkSeconds(place: number, count: number): number {
  if (count <= 1) return tuning.shrinkSecondsFirst;
  const f = (place - 1) / (count - 1);
  return tuning.shrinkSecondsFirst + (tuning.shrinkSecondsLast - tuning.shrinkSecondsFirst) * f;
}

/**
 * Lightning (MK-20): every other kart spins out, drops its item and shrinks (longer for karts
 * further ahead). Starred karts are immune.
 */
export function useLightning(kart: KartState, state: SimState, events: SimEvent[]): void {
  events.push({ type: 'lightning', kartId: kart.id });
  for (const other of state.karts) {
    if (other.id === kart.id || other.starTimer > 0 || other.respawnTimer > 0) continue;
    // A kart whose effect blocks it (a shield, MK-52) is spared; others (even spinning ones) shrink.
    if (tryHit(other, kart.id, 'lightning', events) === 'blocked') continue;
    other.item = { ...other.item, held: null, uses: 0, roulette: 0 };
    other.shrinkTimer = shrinkSeconds(positionOf(state, other.id), state.karts.length);
  }
}

/** Timers, star knocks and running over shrunk karts, once per tick. */
export function updateStarLightning(state: SimState, dt: number, events: SimEvent[]): void {
  for (const kart of state.karts) {
    kart.starTimer = countDown(kart.starTimer, dt);
    kart.shrinkTimer = countDown(kart.shrinkTimer, dt);
  }
  for (const kart of state.karts) {
    if (kart.respawnTimer > 0) continue;
    const starred = kart.starTimer > 0;
    const fullSize = kart.shrinkTimer === 0;
    if (!starred && !fullSize) continue;
    for (const other of state.karts) {
      if (other.id === kart.id || other.respawnTimer > 0) continue;
      const d = Math.hypot(other.position.x - kart.position.x, other.position.z - kart.position.z);
      if (starred && d <= tuning.starHitRadius) hitKart(other, kart.id, 'star', events);
      else if (fullSize && other.shrinkTimer > 0 && d <= tuning.squashRadius) {
        hitKart(other, kart.id, 'squash', events);
      }
    }
  }
}
