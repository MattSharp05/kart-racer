import type { ItemContent } from '..';
import { cancelDrift } from '../../../sim/drift';
import { applyEffect } from '../../../sim/items/effects';
import {
  canTouch,
  spawnEntity,
  targetAhead,
  type CollisionRule,
} from '../../../sim/items/entities';
import { screenHit } from '../../../sim/items/hit';
import { forwardFromHeading, scale, wrapAngleDelta } from '../../../sim/math';
import { positionOf } from '../../../sim/race';
import { DT } from '../../../sim/tuning';
import type { KartState, SimState } from '../../../sim/types';

/** Ticks per second (the sim runs at 60 Hz). */
const S = Math.round(1 / DT);

/** Hornets per use. */
export const HORNETS = 3;
/** Each hornet lives 6 s. */
export const HORNET_TICKS = 6 * S;
/** Speed as a fraction of top speed (a red shell is 1.5). */
export const HORNET_SPEED = 1.6;
/** Turn rate, rad/s (a red shell's is 6). */
export const HORNET_TURN_RATE = 7;
/** Beyond this distance from its target (m) a hornet follows the track, aiming this far down it. */
export const HORNET_FOLLOW_TRACK_BEYOND = 20;
export const HORNET_LOOK_AHEAD = 8;
/** Touch radius, m. */
export const HORNET_RADIUS = 1.4;
/** They set off this far in front of the kart, fanned out this much (rad) either side. */
export const HORNET_SPAWN_DISTANCE = 2.5;
export const HORNET_SPREAD = 0.3;

/** A sting: the kart keeps this fraction of its speed… */
export const STING_SPEED_FACTOR = 0.7;
/** …and wobbles for 0.6 s: its heading swings `STING_WOBBLES` times each way, peak yaw rate rad/s. */
export const STING_TICKS = Math.round(0.6 * S);
export const STING_WOBBLES = 2;
export const STING_YAW = 2;
/**
 * After a sting the kart can't be hit for this long (seconds, the kart's usual invulnerability,
 * like a blocked hit's 0.5 s): as long as the wobble, so a swarm can't chain-stun anyone (at most
 * one sting per 0.5 s) and a new sting never cuts a wobble short and leaves the kart turned.
 */
export const STING_GAP_SECONDS = STING_TICKS / S;

/** AI: use it when 1–3 karts are within this many metres ahead. */
export const AI_RANGE = 60;
export const AI_MAX_TARGETS = 3;

/**
 * The karts the swarm chases: the 1st, 2nd and 3rd ahead of `owner` (nearest first). With fewer
 * ahead, the extras chase the nearest one; from 1st place there's no one (−1: they fly straight).
 */
export function hornetTargets(owner: KartState, state: SimState): number[] {
  const place = positionOf(state, owner.id);
  const ahead = state.positions.slice(0, Math.max(0, place - 1)).reverse();
  return Array.from({ length: HORNETS }, (_, i) => ahead[i] ?? ahead[0] ?? -1);
}

/**
 * Collision rule: a hornet stings only the kart it chases (with no target, the first it touches;
 * never its owner). Every touch uses it up. The sting goes through `screenHit`, so a kart that
 * can't be hit shrugs it off and a Bubble Shield blocks it (and pops); a phased kart can't be
 * touched at all (`canTouch`), so the hornet flies through and keeps chasing.
 */
const sting: CollisionRule = (entity, { state, events, spec }) => {
  const kart =
    entity.targetId >= 0
      ? state.karts[entity.targetId]
      : state.karts.find((k) => k.id !== entity.ownerId && canTouch(entity, k, spec));
  if (!kart || kart.id === entity.ownerId || !canTouch(entity, kart, spec)) return false;
  if (screenHit(kart, entity.ownerId, 'hornet-swarm', events) === 'hit') {
    applyEffect(kart, 'hornet-swarm', STING_TICKS, state, events, { by: entity.ownerId });
    kart.invulnerableTimer = Math.max(kart.invulnerableTimer, STING_GAP_SECONDS);
    events.push({ type: 'itemFx', kartId: kart.id, item: 'hornet-swarm', fx: 'sting' });
  }
  return true;
};

/**
 * Hornet Swarm (MK-67): three hornets, one each at the 1st, 2nd and 3rd kart ahead (extras go for
 * the nearest). They follow the track like a red shell and home in once close; each sting is a
 * small bump (`hornet-swarm` kart effect): some speed lost and a 0.6 s wobble, lighter than a
 * shell's spin-out. They're gone after 6 s. Stings are hits (`screenHit`): Bubble Shield blocks
 * one, Phase lets them pass. Its look and sounds are in `./render.ts`.
 */
export default {
  id: 'hornet-swarm',
  name: 'Hornet Swarm',
  order: 160,
  // Mid and back (1st place … 8th place); balanced in MK-72 (each row sums to 1).
  odds: [0, 0, 0.04, 0.07, 0.1, 0.11, 0.09, 0.09],
  onUse: (kart, state) => {
    const forward = forwardFromHeading(kart.heading);
    hornetTargets(kart, state).forEach((targetId, i) => {
      // Fanned out: left, centre, right.
      const angle = (i - (HORNETS - 1) / 2) * HORNET_SPREAD;
      const [c, s] = [Math.cos(angle), Math.sin(angle)];
      const direction = { x: forward.x * c - forward.z * s, z: forward.x * s + forward.z * c };
      spawnEntity(state, 'hornet-swarm', kart, { direction, targetId });
    });
  },
  // AI: when 1–3 karts are within 60 m ahead, or having given up (never while leading).
  aiUse: (kart, state, { geometry, aheadMetres, giveUp }) => {
    // From 1st the hornets have no one to chase (they go by race position): even having given up,
    // it waits (MK-72).
    if (positionOf(state, kart.id) === 1) return false;
    if (giveUp) return true;
    const myS = geometry.project(kart.position).s;
    const ahead = state.karts.filter((other) => {
      if (other.id === kart.id) return false;
      const dx = other.position.x - kart.position.x;
      const dz = other.position.z - kart.position.z;
      if (dx * dx + dz * dz > AI_RANGE * AI_RANGE) return false;
      const d = aheadMetres(myS, geometry.project(other.position).s);
      return d > 0 && d <= AI_RANGE;
    }).length;
    return ahead >= 1 && ahead <= AI_MAX_TARGETS;
  },
  effects: [
    {
      id: 'hornet-swarm',
      // The bump: speed lost and the drift cancelled (the boost is kept: lighter than a shell).
      onApply: (kart, _effect, _state, events) => {
        kart.speed *= STING_SPEED_FACTOR;
        kart.velocity = scale(kart.velocity, STING_SPEED_FACTOR);
        cancelDrift(kart, events);
      },
      // The wobble: the heading swings each way and back (whole cycles, so it ends as it started).
      onTick: (kart, effect, _state, dt) => {
        if (kart.respawnTimer > 0) {
          effect.ticksLeft = 0;
          return;
        }
        const progress = 1 - effect.ticksLeft / STING_TICKS;
        const yaw = STING_YAW * Math.sin(2 * Math.PI * STING_WOBBLES * progress);
        kart.heading = wrapAngleDelta(kart.heading + yaw * dt);
      },
    },
  ],
  entities: [
    {
      id: 'hornet-swarm',
      // The target comes from `hornetTargets` at spawn; `targetAhead` is the fallback rule.
      movement: {
        type: 'homing',
        target: targetAhead,
        turnRate: HORNET_TURN_RATE,
        followTrackBeyond: HORNET_FOLLOW_TRACK_BEYOND,
        lookAhead: HORNET_LOOK_AHEAD,
      },
      speed: HORNET_SPEED,
      lifeTicks: HORNET_TICKS,
      radius: HORNET_RADIUS,
      spawnDistance: HORNET_SPAWN_DISTANCE,
      // Like a red shell: breaks on a wall, falls off an edge.
      walls: 'break',
      // Never stings its owner.
      ownerImmuneTicks: HORNET_TICKS,
      collide: [sting],
    },
  ],
} satisfies ItemContent;
