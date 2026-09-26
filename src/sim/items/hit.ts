import { cancelDrift } from '../drift';
import { scale } from '../math';
import { tuning } from '../tuning';
import type { HitKind, KartState, SimEvent } from '../types';
import { effectsBlockHit } from './effects';

/** Whether items can hit this kart right now. */
export function canBeHit(kart: KartState): boolean {
  return (
    kart.invulnerableTimer === 0 &&
    kart.respawnTimer === 0 &&
    kart.spinTimer === 0 &&
    kart.starTimer === 0
  );
}

/** Extra facts about a hit (`IncomingHit`): a crusher's hit is a `crush`. */
export interface HitOptions {
  crush?: boolean;
}

/** How a hit went: it landed, the kart couldn't be hit, or one of its effects blocked it. */
export type HitResult = 'hit' | 'immune' | 'blocked';

/**
 * The generic item hit (MK-17): the kart spins out, losing most of its speed and all control for
 * `spinSeconds`, then stays invulnerable a little longer. Drifts and boosts are cancelled.
 * Nothing happens if the kart can't be hit (`immune`), or one of its effects (a shield, MK-52)
 * cancels the hit (`blocked`: the kart is then briefly invulnerable, so whatever it touched can't
 * hit it again on the next tick).
 */
export function tryHit(
  kart: KartState,
  by: number,
  kind: HitKind,
  events: SimEvent[],
  options: HitOptions = {},
): HitResult {
  const result = screenHit(kart, by, kind, events, options);
  if (result !== 'hit') return result;
  kart.speed *= tuning.hitSpeedFactor;
  kart.velocity = scale(kart.velocity, tuning.hitSpeedFactor);
  cancelDrift(kart, events);
  kart.boostTimer = 0;
  kart.spinTimer = tuning.spinSeconds;
  kart.invulnerableTimer = tuning.spinSeconds + tuning.hitInvulnerableSeconds;
  events.push({ type: 'kartHit', kartId: kart.id, by, kind });
  return 'hit';
}

/**
 * The first half of `tryHit` (MK-67): whether a hit would land, without knocking the kart about.
 * `immune` and `blocked` work exactly as in `tryHit` (a blocking effect, such as a shield, is used
 * up and the kart gets the short blocked-hit invulnerability). On `hit` nothing has been done to
 * the kart yet: items with a lighter hit than a spin-out (a hornet's sting) apply their own.
 */
export function screenHit(
  kart: KartState,
  by: number,
  kind: HitKind,
  events: SimEvent[],
  { crush = false }: HitOptions = {},
): HitResult {
  if (!canBeHit(kart)) return 'immune';
  if (effectsBlockHit(kart, { by, kind, crush }, events)) {
    kart.invulnerableTimer = Math.max(kart.invulnerableTimer, tuning.blockedHitInvulnerableSeconds);
    return 'blocked';
  }
  return 'hit';
}

/** `tryHit`, true when the hit landed. */
export function hitKart(
  kart: KartState,
  by: number,
  kind: HitKind,
  events: SimEvent[],
  options: HitOptions = {},
): boolean {
  return tryHit(kart, by, kind, events, options) === 'hit';
}
