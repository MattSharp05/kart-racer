import type { ItemContent } from '..';
import {
  canTouch,
  spawnEntity,
  type CollisionRule,
  type EntitySpec,
} from '../../../sim/items/entities';
import { tryHit } from '../../../sim/items/hit';
import { forwardFromHeading, wrapAngleDelta } from '../../../sim/math';
import { DT } from '../../../sim/tuning';
import type { ItemEntity, KartState, SimState } from '../../../sim/types';

/** Ticks per second (the sim runs at 60 Hz). */
const S = Math.round(1 / DT);

/** Throws per pickup: the first, and one more if you catch it (`kart.item.uses` starts here). */
export const THROWS = 2;
/** Speed as a fraction of top speed (a green shell is 1.5): fast enough to come back to you. */
export const BOOMERANG_SPEED = 1.8;
/** It flies straight out this long (about 40 m) before it curves back… */
export const OUT_TICKS = Math.round(0.9 * S);
/**
 * Thrown backwards it's flying away from you at your speed plus its own, and has to catch you up
 * from behind on the way back: it turns back sooner (about as far from you as a forward throw).
 */
export const BACK_OUT_TICKS = Math.round(0.35 * S);
/** …turning back at this rate (rad/s), then chasing the thrower wherever they've got to. */
export const TURN_RATE = 6;
/** Each throw is gone 4 s after it leaves your hand, caught or not. */
export const LIFE_TICKS = 4 * S;
/** Touch radius, m (for hits and for the catch). */
export const BOOMERANG_RADIUS = 1.6;
/** It leaves this far in front of the kart (behind it when thrown backwards). */
export const SPAWN_DISTANCE = 2.5;
/** Wall bounces before it's gone (the first one also turns it back early). */
export const MAX_BOUNCES = 3;

/** AI: throw when a kart is this many metres ahead… */
export const AI_MIN_RANGE = 10;
export const AI_MAX_RANGE = 40;
/** …lined up: within this angle of straight ahead (rad), or this many metres off the line. */
export const AI_ANGLE = (8 * Math.PI) / 180;
export const AI_LATERAL = 2;

/**
 * The entity's `data`: which throw it is (1 or 2), whether it has faced its thrower on the way
 * back (1 = yes: turning away again means it went past them, a miss), then the ids of the karts
 * it has hit on this throw.
 */
const THROW = 0;
const FACED = 1;
const HIT_FROM = 2;

/** The karts a boomerang has hit (or been blocked by) on this throw. */
export function hitOnThisThrow(entity: ItemEntity): number[] {
  return entity.data.slice(HIT_FROM);
}

/** Which throw a boomerang is: 1, or 2 after a catch. */
export function throwNumber(entity: ItemEntity): number {
  return entity.data[THROW] ?? 1;
}

/**
 * Throws a boomerang for `kart`: forwards, or backwards when `backwards` (spawned behind it).
 * `throwNo` is 1 or 2.
 */
export function throwBoomerang(
  kart: KartState,
  state: SimState,
  throwNo: number,
  backwards: boolean,
): ItemEntity {
  const forward = forwardFromHeading(kart.heading);
  const sign = backwards ? -1 : 1;
  const entity = spawnEntity(state, backwards ? 'boomerang-back' : 'boomerang', kart, {
    direction: { x: forward.x * sign, z: forward.z * sign },
    data: [throwNo, 0],
  });
  if (backwards) {
    entity.position = {
      ...entity.position,
      x: kart.position.x - forward.x * SPAWN_DISTANCE,
      z: kart.position.z - forward.z * SPAWN_DISTANCE,
    };
  }
  return entity;
}

/**
 * Collision rule: spins out every kart it touches (a green shell's hit, through `tryHit`, so a
 * Bubble Shield blocks it and a phased kart can't be touched at all: `canTouch`), each at most once
 * per throw, and flies on. Never its thrower (immune for the whole flight; the catch isn't a hit).
 */
const strike: CollisionRule = (entity, { state, events, spec }) => {
  for (const kart of state.karts) {
    if (kart.id === entity.ownerId || entity.data.indexOf(kart.id, HIT_FROM) >= 0) continue;
    if (!canTouch(entity, kart, spec)) continue;
    // A kart that can't be hit right now (spinning, a star, just respawned) isn't counted.
    if (tryHit(kart, entity.ownerId, 'boomerang', events) !== 'immune') entity.data.push(kart.id);
  }
  return false;
};

/** Collision rule: the first wall it bounces off turns it back early. */
const wallTurnsBack: CollisionRule = (entity) => {
  if (entity.bounces > 0) entity.returning = 1;
  return false;
};

/**
 * On the way back it chases its thrower; once it has faced them, turning away from them again
 * means it flew past (a miss): it's gone.
 */
function missed(entity: ItemEntity, state: SimState): boolean {
  if (!entity.returning) return false;
  const owner = state.karts[entity.ownerId];
  if (!owner) return true;
  const toward = Math.atan2(
    owner.position.x - entity.position.x,
    owner.position.z - entity.position.z,
  );
  const facing = Math.atan2(entity.direction.x, entity.direction.z);
  const ahead = Math.abs(wrapAngleDelta(toward - facing)) < Math.PI / 2;
  if (ahead) entity.data[FACED] = 1;
  return !ahead && entity.data[FACED] === 1;
}

/** The flying boomerang; `outTicks` is how long it flies out before turning back. */
function boomerangSpec(id: string, outTicks: number): EntitySpec {
  return {
    id,
    movement: { type: 'returning', outTicks, turnRate: TURN_RATE },
    speed: BOOMERANG_SPEED,
    lifeTicks: LIFE_TICKS,
    radius: BOOMERANG_RADIUS,
    spawnDistance: SPAWN_DISTANCE,
    walls: 'bounce',
    maxBounces: MAX_BOUNCES,
    // Never touches its thrower (coming back, it's caught instead).
    ownerImmuneTicks: LIFE_TICKS,
    collide: [wallTurnsBack, strike],
    onTick: (entity, { state }) => !missed(entity, state),
    // Caught: the first throw goes back in the slot (if it's free) for one more.
    onReturn: (entity, owner, { events }) => {
      const slot = owner.item;
      if (throwNumber(entity) === 1 && slot.held === null && slot.roulette === 0) {
        slot.held = 'boomerang';
        slot.uses = 1;
      }
      events.push({ type: 'itemFx', kartId: owner.id, item: 'boomerang', fx: 'catch' });
    },
  };
}

/**
 * Boomerang (MK-69): thrown forwards (backwards while braking), it flies about 40 m out, curves
 * back and chases its thrower's moving kart. It spins out karts on the way out and on the way back
 * (a green shell's hit, at most once per kart per throw) and never hits its thrower. A wall turns
 * it back early. Catch the first throw and it's back in your slot for a second (2 throws max);
 * each throw is gone after 4 s, or as soon as it flies past you. Its look and sounds are in
 * `./render.ts`.
 */
export default {
  id: 'boomerang',
  name: 'Boomerang',
  order: 170,
  // Front and mid (1st place … 8th place); relative weights, the balance pass (MK-72) tunes them.
  odds: [0.1, 0.15, 0.15, 0.12, 0.08, 0.04, 0, 0],
  uses: THROWS,
  // `kart.item.uses` is already lowered here: 1 left = the first throw (from a fresh pickup), 0 =
  // the second (after a catch). The first throw empties the slot: only a catch gives it back.
  onUse: (kart, state, _events, input) => {
    const first = kart.item.uses > 0;
    if (first) {
      kart.item.held = null;
      kart.item.uses = 0;
    }
    const backwards = input.brake > 0 && input.throttle === 0;
    throwBoomerang(kart, state, first ? 1 : THROWS, backwards);
  },
  // AI: when a kart is 10–40 m ahead and lined up.
  aiUse: (kart, state) => {
    const forward = forwardFromHeading(kart.heading);
    const heading = Math.atan2(forward.x, forward.z);
    return state.karts.some((other) => {
      if (other.id === kart.id || other.respawnTimer > 0) return false;
      const dx = other.position.x - kart.position.x;
      const dz = other.position.z - kart.position.z;
      const d = Math.hypot(dx, dz);
      if (d < AI_MIN_RANGE || d > AI_MAX_RANGE) return false;
      const cone = Math.max(AI_ANGLE, Math.atan2(AI_LATERAL, d));
      return Math.abs(wrapAngleDelta(Math.atan2(dx, dz) - heading)) < cone;
    });
  },
  entities: [
    boomerangSpec('boomerang', OUT_TICKS),
    boomerangSpec('boomerang-back', BACK_OUT_TICKS),
  ],
} satisfies ItemContent;
