import type { ItemContent } from '..';
import { cancelDrift } from '../../../sim/drift';
import { applyEffect, effectsBlockHit, hasEffect } from '../../../sim/items/effects';
import { spawnEntity, touchKarts } from '../../../sim/items/entities';
import { canBeHit } from '../../../sim/items/hit';
import { forwardFromHeading, wrapAngleDelta } from '../../../sim/math';
import { getTrack, groundAt } from '../../../sim/track';
import { DT, tuning } from '../../../sim/tuning';
import type { KartState, SimEvent } from '../../../sim/types';

/** Ticks per second (the sim runs at 60 Hz). */
const S = Math.round(1 / DT);

/** The puddle: 3 m across, dropped this far behind the kart, and it lasts 15 s. */
export const SLICK_RADIUS = 1.5;
export const SLICK_DROP_DISTANCE = -3;
export const SLICK_TICKS = 15 * S;
/** Its owner can't slip on it for this long after dropping it. */
export const SLICK_OWNER_IMMUNE_TICKS = S;

/**
 * A kart that drives through slides this long, then recovers (no spin-out stop). 1.4 s since QA
 * round 2 ("even more dramatic"; was 1 s).
 */
export const SLIDE_TICKS = Math.round(1.4 * S);
/**
 * While sliding, the kart keeps this fraction of the grip it would have: its path stays close to
 * the way it was going when it touched the oil, whatever way it points or steers.
 */
export const SLIDE_GRIP = 0.12;
/** Speed lost while sliding, 1/s (a drag, not a spin-out stop: about 43 % over the slide). */
export const SLIDE_DRAG = 0.4;
/**
 * The kart spins round this many full turns while it slides (QA round 2: it only fishtailed
 * ±23° before). It spins up and winds down smoothly (yaw rate ∝ 1 − cos(2π · progress)), so it
 * ends pointing the way it started and drives straight on.
 */
export const SLIDE_SPINS = 1;

/**
 * Oil Slick (MK-65): dropped behind the kart, a 3 m puddle that stays for 15 s. A kart driving
 * through loses most of its grip and spins round once as it slides (`oil-slick` kart effect, 1.4 s),
 * then recovers.
 * Karts that items can't hit (a star, just hit, respawning) or whose effects block the hit (a
 * shield, phasing: any effect with an `onHit` that cancels it) aren't affected.
 * Its look and sounds are in `./render.ts`.
 */
export default {
  id: 'oil-slick',
  name: 'Oil Slick',
  order: 120,
  // Front and mid (1st place … 8th place); balanced in MK-72 (each row sums to 1).
  odds: [0.08, 0.07, 0.06, 0.04, 0.02, 0, 0, 0],
  onUse: (kart, state) => {
    // On the road under where it lands, even when dropped mid-air (like a banana).
    const slick = spawnEntity(state, 'oil-slick', kart);
    const ground = groundAt(getTrack(state.trackId), slick.position);
    if (ground.surface !== 'out') slick.position = { ...slick.position, y: ground.height };
  },
  // AI: drop it when someone is close behind.
  aiUse: (kart, state, { geometry, aheadMetres, giveUp }) => {
    // Given up waiting: drop it anyway, it's a trap for whoever comes next.
    if (giveUp) return true;
    const range = tuning.ai.bananaDropRange;
    const myS = geometry.project(kart.position).s;
    return state.karts.some((other) => {
      if (other.id === kart.id) return false;
      const dx = other.position.x - kart.position.x;
      const dz = other.position.z - kart.position.z;
      if (dx * dx + dz * dz > range * range) return false;
      const behind = -aheadMetres(myS, geometry.project(other.position).s);
      return behind > 0 && behind < range;
    });
  },
  effects: [
    {
      id: 'oil-slick',
      // data = [x, z, ticks, side, speed]: the way the kart is sliding (unit), the ticks it has
      // slid, which way it spins (+1 = left: the side it was already sliding towards, if any), and
      // its sliding speed (no traction on oil: only the drag slows it, whatever the kart does).
      onApply: (kart, effect, _state, events) => {
        const speed = Math.hypot(kart.velocity.x, kart.velocity.z);
        const forward = forwardFromHeading(kart.heading);
        const [x, z] =
          speed > 0.01
            ? [kart.velocity.x / speed, kart.velocity.z / speed]
            : [forward.x, forward.z];
        // Sliding towards the right of the nose (+X at heading 0) swings the nose left, and back.
        const right = -forward.z * x + forward.x * z;
        effect.data = [x, z, 0, right < 0 ? -1 : 1, speed];
        cancelDrift(kart, events);
      },
      onTick: (kart, effect, _state, dt) => {
        // Off the edge: the pickup drone puts it back facing the right way, grip restored.
        if (kart.respawnTimer > 0) effect.ticksLeft = 0;
        else slide(kart, effect.data, dt);
      },
    },
  ],
  entities: [
    {
      id: 'oil-slick',
      movement: { type: 'area' },
      speed: 0,
      lifeTicks: SLICK_TICKS,
      radius: SLICK_RADIUS,
      spawnDistance: SLICK_DROP_DISTANCE,
      walls: 'ghost',
      ownerImmuneTicks: SLICK_OWNER_IMMUNE_TICKS,
      // The puddle stays: every kart that drives through slips (once per slide).
      collide: [
        touchKarts((entity, kart, { state, events }) => {
          if (hasEffect(kart, 'oil-slick') || !slips(kart, entity.ownerId, events)) return false;
          applyEffect(kart, 'oil-slick', SLIDE_TICKS, state, events, { by: entity.ownerId });
          events.push({ type: 'itemFx', kartId: kart.id, item: 'oil-slick', fx: 'slip' });
          return false;
        }),
      ],
    },
  ],
} satisfies ItemContent;

/**
 * Whether the oil gets this kart: not if items can't hit it now, nor if one of its effects blocks
 * the hit (which, as for any blocked hit, leaves it briefly invulnerable).
 */
function slips(kart: KartState, by: number, events: SimEvent[]): boolean {
  if (!canBeHit(kart)) return false;
  if (effectsBlockHit(kart, { by, kind: 'oil-slick' }, events)) {
    kart.invulnerableTimer = Math.max(kart.invulnerableTimer, tuning.blockedHitInvulnerableSeconds);
    return false;
  }
  return true;
}

/**
 * One tick of sliding, after the kart's own physics: pulls its velocity back towards the way it
 * was sliding (keeping `SLIDE_GRIP` of the turn it made), bleeds some speed and spins the kart round.
 */
function slide(kart: KartState, data: number[], dt: number): void {
  const [dirX = 0, dirZ = 0, ticks = 0, side = 1] = data;
  // No traction: the kart's own throttle or brakes (it faces backwards half the spin) don't count.
  const speed =
    (data[4] ?? Math.hypot(kart.velocity.x, kart.velocity.z)) * Math.max(0, 1 - SLIDE_DRAG * dt);
  data[4] = speed;
  let vx = dirX * speed * (1 - SLIDE_GRIP) + kart.velocity.x * SLIDE_GRIP;
  let vz = dirZ * speed * (1 - SLIDE_GRIP) + kart.velocity.z * SLIDE_GRIP;
  const blended = Math.hypot(vx, vz);
  if (blended > 1e-6) {
    vx *= speed / blended;
    vz *= speed / blended;
    data[0] = vx / speed;
    data[1] = vz / speed;
  }
  kart.velocity = { x: vx, y: kart.velocity.y, z: vz };
  // Yaw rate (rad/s) whose integral over the slide is exactly SLIDE_SPINS turns.
  const progress = (ticks + 0.5) / SLIDE_TICKS;
  const turn = (2 * Math.PI * SLIDE_SPINS) / (SLIDE_TICKS * DT);
  const yawRate = turn * (1 - Math.cos(2 * Math.PI * progress));
  kart.heading = wrapAngleDelta(kart.heading + side * yawRate * dt);
  data[2] = ticks + 1;
  const forward = forwardFromHeading(kart.heading);
  kart.speed = kart.velocity.x * forward.x + kart.velocity.z * forward.z;
}
