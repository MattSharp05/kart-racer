import { applyBoost } from '../../../../sim/drift';
import { applyEffect, getEffect, isIntangible } from '../../../../sim/items/effects';
import { canBeHit, tryHit } from '../../../../sim/items/hit';
import { dot, forwardFromHeading, length, sub, type Vec3 } from '../../../../sim/math';
import { TICK_RATE, tuning } from '../../../../sim/tuning';
import type { Entity, KartEffect, KartState, SimEvent, SimState } from '../../../../sim/types';
import { BOBOMB, bobombFlying } from '../bob-omb/sim';
import { gainCoins } from '../coin/sim';
import { escortDestroyed, isEscort } from '../escort';
import { FIREBALL } from '../fire-flower/sim';
import { mk8ItemSim } from '../sim';

/** The Piranha Plant's item id, and its effect's: the effect is the plant out in front. */
export const PIRANHA = 'piranha-plant';

/**
 * The effect's `data`: ticks until it can lunge again, ticks since its last lunge (for the bite's
 * look; large before the first) and the last lunge's direction on the XZ plane (unit).
 */
export const PIRANHA_DATA = { cooldown: 0, since: 1, dirX: 2, dirZ: 3 } as const;
/** `since` before the first lunge. */
const NEVER = 9999;

const ticks = (seconds: number) => Math.round(seconds * TICK_RATE);

/** What a lunge goes for: a kart, an item entity or a coin, and where it is. */
type Target =
  | { kind: 'kart'; kart: KartState; at: Vec3 }
  | { kind: 'entity'; entity: Entity; at: Vec3 }
  | { kind: 'coin'; index: number; at: Vec3 };

/** Item entities a lunge eats: bananas and shells on the road, Bob-ombs, fireballs, escorts. */
function edible(e: Entity, eater: KartState): boolean {
  if (e.kind === 'banana') return e.flightTimer === 0;
  if (e.kind === 'shell') return true;
  if (e.kind !== 'item') return false;
  if (e.spec === BOBOMB) return !bobombFlying(e);
  if (e.spec === FIREBALL) return true;
  return isEscort(e) && e.ownerId !== eater.id;
}

/** Whether `at` is within the plant's reach in front of `kart`; its distance if so. */
function inReach(kart: KartState, at: Vec3): number | null {
  const d = sub(at, kart.position);
  const dist = length(d);
  if (dist > tuning.mk8.piranhaReach) return null;
  // On a mesh track the kart's own facing (it may be on a wall); +Y tracks: its heading.
  const forward = kart.forward ?? forwardFromHeading(kart.heading);
  return dot(d, forward) >= dist * Math.cos(tuning.mk8.piranhaCone) ? dist : null;
}

/** The nearest thing the plant can go for, if any. */
function nearestTarget(kart: KartState, state: SimState): Target | null {
  let best: Target | null = null;
  let bestDist = Infinity;
  const consider = (target: Target) => {
    const dist = inReach(kart, target.at);
    if (dist !== null && dist < bestDist) {
      best = target;
      bestDist = dist;
    }
  };
  for (const other of state.karts) {
    // Karts that can't be hit right now (spinning, starred, just respawned) are left alone.
    if (other.id === kart.id || !canBeHit(other) || isIntangible(other)) continue;
    consider({ kind: 'kart', kart: other, at: other.position });
  }
  for (const entity of state.entities) {
    if (edible(entity, kart)) consider({ kind: 'entity', entity, at: entity.position });
  }
  state.coins?.forEach((coin, index) => {
    if (coin.respawnTimer > 0) return;
    if (coin.ownerId === kart.id && (coin.ownerImmune ?? 0) > 0) return;
    consider({ kind: 'coin', index, at: coin.position });
  });
  return best;
}

/** The plant bites `target`: a kart spins out, an item is eaten, a coin is the eater's. */
function bite(kart: KartState, target: Target, state: SimState, events: SimEvent[]): void {
  if (target.kind === 'kart') {
    tryHit(target.kart, kart.id, PIRANHA, events, { from: kart.position });
  } else if (target.kind === 'entity') {
    const e = target.entity;
    if (e.kind === 'item' && isEscort(e)) escortDestroyed(state, e);
    state.entities = state.entities.filter((other) => other.id !== e.id);
  } else if (state.coins) {
    const coin = state.coins[target.index];
    if (!coin) return;
    // A dropped coin is gone once taken; a line coin comes back.
    if (coin.life !== undefined) state.coins.splice(target.index, 1);
    else coin.respawnTimer = tuning.mk8.coins.respawn;
    gainCoins(kart, 1, events);
  }
}

/** Every tick out front: counts down to the next lunge, then goes for the nearest thing in reach. */
function piranhaTick(
  kart: KartState,
  effect: KartEffect,
  state: SimState,
  events: SimEvent[],
): void {
  // Gone from the slot (lightning, a fall): the plant goes too.
  if (kart.item.held !== PIRANHA) {
    effect.ticksLeft = 0;
    return;
  }
  const d = effect.data;
  d[PIRANHA_DATA.since] = (d[PIRANHA_DATA.since] ?? NEVER) + 1;
  const cooldown = Math.max(0, (d[PIRANHA_DATA.cooldown] ?? 0) - 1);
  d[PIRANHA_DATA.cooldown] = cooldown;
  if (cooldown > 0 || kart.respawnTimer > 0) return;
  const target = nearestTarget(kart, state);
  if (!target) return;
  bite(kart, target, state, events);
  const dx = target.at.x - kart.position.x;
  const dz = target.at.z - kart.position.z;
  const flat = Math.hypot(dx, dz) || 1;
  d[PIRANHA_DATA.cooldown] = ticks(tuning.mk8.piranhaLungeSeconds);
  d[PIRANHA_DATA.since] = 0;
  d[PIRANHA_DATA.dirX] = dx / flat;
  d[PIRANHA_DATA.dirZ] = dz / flat;
  applyBoost(kart, tuning.mk8.piranhaBoostSeconds, events);
  events.push({ type: 'itemFx', kartId: kart.id, item: PIRANHA, fx: 'lunge' });
}

/**
 * Piranha Plant (MK-126): the first press puts it out in front of the kart for
 * `tuning.mk8.piranhaTime` s (the item stays in slot 1 meanwhile; presses do nothing more). Every
 * `piranhaLungeSeconds` it lunges at the nearest kart, item or coin within `piranhaReach` m ahead:
 * a kart spins out, a banana, shell, Bob-omb, fireball or another kart's circling shell is eaten,
 * a coin is the user's. Each lunge gives a small boost. Its timer is a kart effect that clears the
 * slot when it runs out. Drawn by `./render.ts` (and the `mk8` item skin with a pack).
 */
export default mk8ItemSim({
  id: PIRANHA,
  name: 'Piranha Plant',
  order: 410,
  onUse: (kart, state, events) => {
    if (!getEffect(kart, PIRANHA)) {
      applyEffect(kart, PIRANHA, ticks(tuning.mk8.piranhaTime), state, events, {
        data: [0, NEVER, 0, 0],
      });
    }
    // The press emptied the slot (one use): it stays until the timer ends.
    kart.item.held = PIRANHA;
    kart.item.uses = 1;
  },
  effects: [
    {
      id: PIRANHA,
      onTick: (kart, effect, state, _dt, events) => piranhaTick(kart, effect, state, events),
      onExpire: (kart) => {
        if (kart.item.held !== PIRANHA || kart.item.roulette > 0) return;
        kart.item.held = null;
        kart.item.uses = 0;
      },
    },
  ],
});
