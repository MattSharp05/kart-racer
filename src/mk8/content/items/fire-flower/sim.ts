import { applyEffect, hasEffect } from '../../../../sim/items/effects';
import { hitKarts, spawnEntity, type EntitySpec } from '../../../../sim/items/entities';
import { add, forwardFromHeading, scale } from '../../../../sim/math';
import { TICK_RATE, tuning } from '../../../../sim/tuning';
import type { KartState, SimState } from '../../../../sim/types';
import { mk8ItemSim } from '../sim';

/** The Fire Flower's timer: a kart effect, so it counts down in the sim and in snapshots. */
export const FIRE = 'fire-flower';
export const FIREBALL = 'fire-flower-fireball';

const ticks = (seconds: number) => Math.round(seconds * TICK_RATE);

/** Fireballs appear this far ahead of (or behind) the kart, m. */
const SPAWN_DISTANCE = 2;
/** Its shooter can't be hit by a fireball for this long, s (one coming straight back can). */
const OWNER_IMMUNE_SECONDS = 0.5;

/** Shoots one fireball ahead (behind while braking). */
export function shootFireball(kart: KartState, state: SimState, backwards: boolean): void {
  const forward = forwardFromHeading(kart.heading);
  const dir = backwards ? scale(forward, -1) : forward;
  const ball = spawnEntity(state, FIREBALL, kart, { direction: { x: dir.x, z: dir.z } });
  if (backwards) ball.position = add(kart.position, scale(dir, SPAWN_DISTANCE));
}

const fireballSpec: EntitySpec = {
  id: FIREBALL,
  movement: { type: 'straight' },
  speed: tuning.mk8.fireballSpeed,
  lifeTicks: ticks(tuning.mk8.fireballLifeSeconds),
  radius: tuning.mk8.fireballRadius,
  spawnDistance: SPAWN_DISTANCE,
  walls: 'bounce',
  maxBounces: tuning.mk8.fireballBounces,
  ownerImmuneTicks: ticks(OWNER_IMMUNE_SECONDS),
  // Spins out the first kart it hits and is gone.
  collide: [hitKarts()],
};

/**
 * Fire Flower (MK-114): each press shoots a fireball ahead (behind while braking) that bounces off
 * walls and spins out the first kart it hits, gone after `fireballBounces` bounces. Up to
 * `fireShots` fireballs for `tuning.mk8.fireTime` s from the first; then it's gone. The timer is a
 * kart effect that clears the slot when it runs out. Drawn by `./render.ts`.
 */
export default mk8ItemSim({
  id: FIRE,
  name: 'Fire Flower',
  order: 390,
  uses: tuning.mk8.fireShots,
  onUse: (kart, state, events, input) => {
    shootFireball(kart, state, input.brake > 0 && input.throttle <= 0);
    if (kart.item.held === null) {
      // The last shot: the slot is already empty, so the timer has nothing left to clear.
      kart.effects = kart.effects.filter((e) => e.kind !== FIRE);
    } else if (kart.item.uses === tuning.mk8.fireShots - 1 || !hasEffect(kart, FIRE)) {
      // A new flower's first shot starts its own timer (replacing any left from one lightning took).
      applyEffect(kart, FIRE, ticks(tuning.mk8.fireTime), state, events);
    }
  },
  entities: [fireballSpec],
  effects: [
    {
      id: FIRE,
      onExpire: (kart) => {
        if (kart.item.held !== FIRE || kart.item.roulette > 0) return;
        kart.item.held = null;
        kart.item.uses = 0;
      },
    },
  ],
});
