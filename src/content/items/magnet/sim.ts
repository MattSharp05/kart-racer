import type { ItemContent } from '..';
import { kartGap } from '../../../sim/collisions';
import { isDrifting } from '../../../sim/drift';
import { applyEffect, isIntangible } from '../../../sim/items/effects';
import { clamp, forwardFromHeading, wrapAngleDelta } from '../../../sim/math';
import { getTrack, trackGeometry } from '../../../sim/track';
import { DT } from '../../../sim/tuning';
import type { KartEffect, KartState, SimEvent, SimState } from '../../../sim/types';

/** Ticks per second (the sim runs at 60 Hz). */
const S = Math.round(1 / DT);

/** The pull lasts 4 s, or until you touch the kart it pulls you to. */
export const MAGNET_TICKS = 4 * S;
/** It pulls towards the nearest kart ahead within this many metres. */
export const MAGNET_RANGE = 40;
/**
 * The pull is a top-speed bonus that grows as you close in: × (1 + `MAGNET_BONUS_FAR`) at the
 * edge of its range, up to × (1 + `MAGNET_BONUS_NEAR`) when touching (a strong slipstream).
 */
export const MAGNET_BONUS_FAR = 0.12;
export const MAGNET_BONUS_NEAR = 0.35;
/**
 * It also turns you towards the target, at most this fast (rad/s, at full closeness), when it's
 * within `MAGNET_STEER_CONE` rad of where you're heading (not while drifting, airborne or spinning).
 */
export const MAGNET_STEER = 0.6;
export const MAGNET_STEER_CONE = Math.PI / 3;
/** Touching: the karts' bodies are this close, m (`kartGap`; bumps push them apart to 0). */
export const MAGNET_CONTACT = 0.3;

/** `effect.data`: the kart it pulls towards (−1 = none) and the speed factor it gives. */
const TARGET = 0;
const FACTOR = 1;

/**
 * The kart a magnet on `kart` pulls towards (the nearest still racing ahead), with its distance
 * (m); none within range.
 */
export function magnetTarget(
  kart: KartState,
  state: SimState,
): { id: number; distance: number } | undefined {
  const track = getTrack(state.trackId);
  const geometry = track.kind === 'spline' ? trackGeometry(track) : undefined;
  const myS = geometry?.project(kart.position).s ?? 0;
  const forward = forwardFromHeading(kart.heading);
  let best: { id: number; distance: number } | undefined;
  for (const other of state.karts) {
    if (other.id === kart.id || other.respawnTimer > 0) continue;
    // Finished karts (on autopilot) are out of the race: nothing to chase or take.
    if (other.race.finishTick !== undefined) continue;
    const dx = other.position.x - kart.position.x;
    const dz = other.position.z - kart.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > MAGNET_RANGE || (best && distance >= best.distance)) continue;
    // Ahead: further along the lap (on a spline track), else in front of the kart.
    let ahead: boolean;
    if (geometry) {
      let d = geometry.project(other.position).s - myS;
      if (d > geometry.length / 2) d -= geometry.length;
      if (d <= -geometry.length / 2) d += geometry.length;
      ahead = d > 0;
    } else ahead = dx * forward.x + dz * forward.z > 0;
    if (ahead) best = { id: other.id, distance };
  }
  return best;
}

/**
 * Touching the target: take its item if your slot is empty and it holds one (not mid-roulette),
 * with its uses. Not a hit: shields don't stop it. Neither kart may be intangible (Phase).
 */
function trySteal(kart: KartState, target: KartState, events: SimEvent[]): void {
  if (kart.item.held !== null || kart.item.roulette > 0) return;
  if (target.item.held === null || target.item.roulette > 0) return;
  kart.item.held = target.item.held;
  kart.item.uses = target.item.uses;
  target.item.held = null;
  target.item.uses = 0;
  events.push(
    { type: 'itemFx', kartId: kart.id, item: 'magnet', fx: 'steal' },
    { type: 'itemFx', kartId: target.id, item: 'magnet', fx: 'stolen' },
  );
}

/** One tick of the pull: find the target, set the speed bonus, turn towards it, steal on contact. */
function pull(
  kart: KartState,
  effect: KartEffect,
  state: SimState,
  dt: number,
  events: SimEvent[],
) {
  effect.data[TARGET] = -1;
  effect.data[FACTOR] = 1;
  if (kart.respawnTimer > 0) return;
  const found = magnetTarget(kart, state);
  const target = found && state.karts[found.id];
  if (!found || !target) return;
  const closeness = 1 - Math.min(1, found.distance / MAGNET_RANGE);
  effect.data[TARGET] = found.id;
  effect.data[FACTOR] = 1 + MAGNET_BONUS_FAR + (MAGNET_BONUS_NEAR - MAGNET_BONUS_FAR) * closeness;

  if (kartGap(kart, target) <= MAGNET_CONTACT) {
    if (isIntangible(kart) || isIntangible(target)) return;
    trySteal(kart, target, events);
    effect.ticksLeft = 0;
    return;
  }
  if (!isDrifting(kart) && kart.grounded && kart.spinTimer === 0) {
    const desired = Math.atan2(
      -(target.position.x - kart.position.x),
      -(target.position.z - kart.position.z),
    );
    const error = wrapAngleDelta(desired - kart.heading);
    if (Math.abs(error) < MAGNET_STEER_CONE) {
      const turn = MAGNET_STEER * closeness * dt;
      kart.heading = wrapAngleDelta(kart.heading + clamp(error, -turn, turn));
    }
  }
}

/**
 * Magnet (MK-68): for 4 s you're pulled towards the nearest kart ahead within 40 m, a top-speed
 * bonus that grows as you close in (and a gentle turn towards it). Touch it and you take its item
 * (if your slot is empty) and the pull ends. The steal isn't a hit: a Bubble Shield doesn't stop
 * it (it guards against hits), but a phased kart can't be touched (`intangible`), on either side.
 * Its look and sounds are in `./render.ts`.
 */
export default {
  id: 'magnet',
  name: 'Magnet',
  order: 190,
  // Back positions (1st place … 8th place); relative weights, the balance pass (MK-72) tunes them.
  odds: [0, 0, 0, 0, 0.04, 0.08, 0.12, 0.14],
  onUse: (kart, state, events) =>
    applyEffect(kart, 'magnet', MAGNET_TICKS, state, events, { data: [-1, 1] }),
  // AI: when a kart is within range ahead.
  aiUse: (kart, state) => magnetTarget(kart, state) !== undefined,
  effects: [
    {
      id: 'magnet',
      speedFactor: (_kart, effect) => effect.data[FACTOR] ?? 1,
      onTick: pull,
    },
  ],
} satisfies ItemContent;
