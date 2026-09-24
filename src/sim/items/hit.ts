import { cancelDrift } from '../drift';
import { scale } from '../math';
import { tuning } from '../tuning';
import type { HitKind, KartState, SimEvent } from '../types';

/** Whether items can hit this kart right now. */
export function canBeHit(kart: KartState): boolean {
  return (
    kart.invulnerableTimer === 0 &&
    kart.respawnTimer === 0 &&
    kart.spinTimer === 0 &&
    kart.starTimer === 0
  );
}

/**
 * The generic item hit (MK-17): the kart spins out, losing most of its speed and all control for
 * `spinSeconds`, then stays invulnerable a little longer. Drifts and boosts are cancelled.
 * Returns false (and does nothing) if the kart can't be hit.
 */
export function hitKart(kart: KartState, by: number, kind: HitKind, events: SimEvent[]): boolean {
  if (!canBeHit(kart)) return false;
  kart.speed *= tuning.hitSpeedFactor;
  kart.velocity = scale(kart.velocity, tuning.hitSpeedFactor);
  cancelDrift(kart, events);
  kart.boostTimer = 0;
  kart.spinTimer = tuning.spinSeconds;
  kart.invulnerableTimer = tuning.spinSeconds + tuning.hitInvulnerableSeconds;
  events.push({ type: 'kartHit', kartId: kart.id, by, kind });
  return true;
}
