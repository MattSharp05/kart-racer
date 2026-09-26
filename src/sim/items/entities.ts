import { entitySpecs, type RegisteredEntitySpec } from '../../content/items/registries';
import { forwardFromHeading } from '../math';
import { positionOf } from '../race';
import { getTrack, trackGeometry } from '../track';
import { tuning } from '../tuning';
import type { ItemEntity, KartState, SimEvent, SimState } from '../types';
import { nextEntityId } from './banana';
import { isIntangible } from './effects';
import { hitKart } from './hit';
import { steerTowards } from './shell';

/** Picks the kart a homing entity chases, when it's spawned (−1 = none: it flies straight). */
export type TargetRule = (owner: KartState, state: SimState) => number;

/** The kart one place ahead of the owner (a red shell's target); none from 1st. */
export const targetAhead: TargetRule = (owner, state) => {
  const place = positionOf(state, owner.id);
  return place > 1 ? (state.positions[place - 2] ?? -1) : -1;
};

/** The race leader, unless that's the owner. */
export const targetLeader: TargetRule = (owner, state) => {
  const leader = state.positions[0] ?? -1;
  return leader === owner.id ? -1 : leader;
};

/** The nearest other kart, anywhere. */
export const targetNearest: TargetRule = (owner, state) => {
  let best = -1;
  let bestD = Infinity;
  for (const kart of state.karts) {
    if (kart.id === owner.id) continue;
    const d = Math.hypot(kart.position.x - owner.position.x, kart.position.z - owner.position.z);
    if (d < bestD) {
      bestD = d;
      best = kart.id;
    }
  }
  return best;
};

/** How an entity moves (MK-52). Turn rates are rad/s. */
export type Movement =
  /** Straight along its direction (a green shell). */
  | { type: 'straight' }
  /**
   * Chases the kart `target` picks at spawn. Beyond `followTrackBeyond` m it follows the track
   * (aiming `lookAhead` m down it, like a red shell) instead of cutting across.
   */
  | {
      type: 'homing';
      target: TargetRule;
      turnRate: number;
      followTrackBeyond?: number;
      lookAhead?: number;
    }
  /** Flies straight for `outTicks`, then turns back and chases its owner; gone once it's back. */
  | { type: 'returning'; outTicks: number; turnRate: number }
  /** Stays where it was spawned (a slick, a cloud) until its life runs out. */
  | { type: 'area' };

/** What's going on during one entity's tick, for its hooks and collision rules. */
export interface EntityContext {
  state: SimState;
  events: SimEvent[];
  dt: number;
  spec: RegisteredEntitySpec;
  /** Removes another entity by id at the end of the tick (this one: return true instead). */
  remove(id: number): void;
  /** Whether an entity is already gone this tick (removed or used up). */
  isGone(id: number): boolean;
}

/** A collision rule: checked after the entity moves; returns true when the entity is used up. */
export type CollisionRule = (entity: ItemEntity, ctx: EntityContext) => boolean;

/**
 * A general item entity (MK-52): an item lists these in `ItemContent.entities` and spawns them
 * with `spawnEntity`. Behaviour = one `movement` plus a list of `collide` rules, so a new
 * projectile or trap is mostly data.
 */
export interface EntitySpec {
  /** Global id; by convention the item's id, or `<item>-<name>` when an item has several. */
  id: string;
  order?: number;
  movement: Movement;
  /** Speed as a fraction of the engine class's top speed (0 for areas). */
  speed: number;
  /** Ticks before it disappears (an area's duration). */
  lifeTicks: number;
  /** Touch radius, m. */
  radius: number;
  /** Metres in front of the owner it appears (negative = behind). */
  spawnDistance: number;
  /**
   * Walls and edges: `bounce` off walls (gone after `maxBounces`), `break` on them, or `ghost`
   * through both. Bouncing and breaking entities fall off where there's no wall.
   */
  walls: 'bounce' | 'break' | 'ghost';
  maxBounces?: number;
  /** Ticks its owner can't touch it after spawning (a returning entity also skips it on the way back). */
  ownerImmuneTicks: number;
  /** Checked in order each tick after it moves; the first to return true removes it. */
  collide: readonly CollisionRule[];
  /** Every tick before moving: return true to keep it, false to remove it. */
  onTick?(entity: ItemEntity, ctx: EntityContext): boolean;
  /** A returning entity is back with its owner (it's removed after this). */
  onReturn?(entity: ItemEntity, owner: KartState, ctx: EntityContext): void;
}

export interface SpawnOptions {
  /** XZ unit direction (default: the way the owner faces). */
  direction?: { x: number; z: number };
  /** Homing: overrides the spec's target rule. */
  targetId?: number;
  data?: number[];
}

/** Spawns an entity of `specId` for `owner`, `spawnDistance` in front of it. */
export function spawnEntity(
  state: SimState,
  specId: string,
  owner: KartState,
  { direction, targetId, data = [] }: SpawnOptions = {},
): ItemEntity {
  const spec = entitySpecs.get(specId);
  const forward = forwardFromHeading(owner.heading);
  const dir = direction ?? { x: forward.x, z: forward.z };
  const target =
    targetId ?? (spec.movement.type === 'homing' ? spec.movement.target(owner, state) : -1);
  const entity: ItemEntity = {
    id: nextEntityId(state),
    kind: 'item',
    spec: specId,
    position: {
      x: owner.position.x + forward.x * spec.spawnDistance,
      y: owner.position.y,
      z: owner.position.z + forward.z * spec.spawnDistance,
    },
    direction: { ...dir },
    speed: tuning.topSpeed[state.engineClass] * spec.speed,
    age: 0,
    ownerId: owner.id,
    targetId: target,
    returning: 0,
    bounces: 0,
    data: [...data],
  };
  state.entities.push(entity);
  return entity;
}

/**
 * Whether `kart` can touch `entity` now (the owner is skipped while immune and on the way back; an
 * intangible kart, MK-66, never touches it).
 */
export function canTouch(entity: ItemEntity, kart: KartState, spec: RegisteredEntitySpec): boolean {
  if (kart.respawnTimer > 0 || isIntangible(kart)) return false;
  if (kart.id === entity.ownerId && (entity.age <= spec.ownerImmuneTicks || entity.returning)) {
    return false;
  }
  const d = Math.hypot(kart.position.x - entity.position.x, kart.position.z - entity.position.z);
  return d <= spec.radius && Math.abs(kart.position.y - entity.position.y) <= tuning.itemHitHeight;
}

/**
 * Collision rule: spins out the first kart it touches (as a hit by its item) and is used up.
 * With `pierce` it carries on through karts instead.
 */
export function hitKarts({ pierce = false } = {}): CollisionRule {
  return (entity, { state, events, spec }) => {
    for (const kart of state.karts) {
      if (!canTouch(entity, kart, spec)) continue;
      hitKart(kart, entity.ownerId, spec.item, events);
      if (!pierce) return true;
    }
    return false;
  };
}

/**
 * Collision rule: calls `onTouch` for each kart it touches (apply an effect, pull, splat ink…);
 * `onTouch` returns true when that uses the entity up.
 */
export function touchKarts(
  onTouch: (entity: ItemEntity, kart: KartState, ctx: EntityContext) => boolean,
): CollisionRule {
  return (entity, ctx) => {
    for (const kart of ctx.state.karts) {
      if (canTouch(entity, kart, ctx.spec) && onTouch(entity, kart, ctx)) return true;
    }
    return false;
  };
}

/**
 * Collision rule: knocks out a shell, a landed banana or another entity with this rule that it
 * touches (both vanish, like two shells).
 */
export const blockItems: CollisionRule = (entity, { state, spec, remove, isGone }) => {
  const other = state.entities.find((e) => {
    if (e.id === entity.id || isGone(e.id)) return false;
    const solid =
      e.kind === 'shell' ||
      (e.kind === 'banana' && e.flightTimer === 0) ||
      (e.kind === 'item' && entitySpecs.get(e.spec).collide.includes(blockItems));
    if (!solid) return false;
    const d = Math.hypot(e.position.x - entity.position.x, e.position.z - entity.position.z);
    return d < spec.radius;
  });
  if (!other) return false;
  remove(other.id);
  return true;
};

/** Turns towards its target or owner. */
function steer(entity: ItemEntity, spec: RegisteredEntitySpec, state: SimState, dt: number): void {
  const m = spec.movement;
  if (m.type === 'returning') {
    if (!entity.returning && entity.age >= m.outTicks) entity.returning = 1;
    const owner = state.karts[entity.ownerId];
    if (entity.returning && owner) {
      steerTowards(entity, owner.position.x, owner.position.z, m.turnRate * dt);
    }
    return;
  }
  if (m.type !== 'homing') return;
  const target = state.karts[entity.targetId];
  if (!target) return;
  const maxTurn = m.turnRate * dt;
  const track = getTrack(state.trackId);
  const d = Math.hypot(
    target.position.x - entity.position.x,
    target.position.z - entity.position.z,
  );
  if (m.followTrackBeyond !== undefined && d > m.followTrackBeyond && track.kind === 'spline') {
    const geometry = trackGeometry(track);
    const here = geometry.project(entity.position);
    const ahead = geometry.pointAt(
      here.t + (m.lookAhead ?? m.followTrackBeyond) / geometry.length,
      0,
    );
    steerTowards(entity, ahead.x, ahead.z, maxTurn);
    return;
  }
  steerTowards(entity, target.position.x, target.position.z, maxTurn);
}

/** Moves one entity and handles walls and edges. Returns false when it's gone. */
function move(
  entity: ItemEntity,
  spec: RegisteredEntitySpec,
  state: SimState,
  dt: number,
): boolean {
  if (spec.movement.type === 'area') return true;
  steer(entity, spec, state, dt);
  entity.position = {
    x: entity.position.x + entity.direction.x * entity.speed * dt,
    y: entity.position.y,
    z: entity.position.z + entity.direction.z * entity.speed * dt,
  };
  const track = getTrack(state.trackId);
  if (track.kind !== 'spline') return true;
  const geometry = trackGeometry(track);
  const p = geometry.project(entity.position);
  const wall = geometry.wallOffset(p.width) - spec.radius;
  if (spec.walls !== 'ghost' && Math.abs(p.lateral) > wall) {
    const side = p.lateral >= 0 ? 1 : -1;
    if (!geometry.hasWall(p.t, side === 1 ? 'right' : 'left')) {
      if (p.surface === 'out') return false; // off the edge where there's no wall
    } else {
      if (spec.walls === 'break') return false;
      entity.bounces += 1;
      if (entity.bounces > (spec.maxBounces ?? 0)) return false;
      // Reflect off the wall (its normal points out of the track on this side) and step back.
      const n = { x: p.normal.x * side, z: p.normal.z * side };
      const into = entity.direction.x * n.x + entity.direction.z * n.z;
      if (into > 0) {
        entity.direction = {
          x: entity.direction.x - 2 * into * n.x,
          z: entity.direction.z - 2 * into * n.z,
        };
      }
      const over = Math.abs(p.lateral) - wall;
      entity.position = {
        ...entity.position,
        x: entity.position.x - n.x * over,
        z: entity.position.z - n.z * over,
      };
    }
  }
  const ground = geometry.project(entity.position);
  if (ground.surface !== 'out') entity.position = { ...entity.position, y: ground.groundY };
  return true;
}

/** A returning entity that's back with its owner. */
function caught(entity: ItemEntity, spec: RegisteredEntitySpec, state: SimState): KartState | null {
  if (!entity.returning) return null;
  const owner = state.karts[entity.ownerId];
  if (!owner) return null;
  const d = Math.hypot(owner.position.x - entity.position.x, owner.position.z - entity.position.z);
  return d <= spec.radius ? owner : null;
}

/** Moves every general item entity one tick and runs its collision rules (MK-52). */
export function updateItemEntities(state: SimState, dt: number, events: SimEvent[]): void {
  const list = state.entities.filter((e): e is ItemEntity => e.kind === 'item');
  if (list.length === 0) return;
  const gone = new Set<number>();
  const remove = (id: number) => gone.add(id);
  const isGone = (id: number) => gone.has(id);
  for (const entity of list) {
    if (gone.has(entity.id)) continue;
    const spec = entitySpecs.get(entity.spec);
    const ctx: EntityContext = { state, events, dt, spec, remove, isGone };
    entity.age += 1;
    if (
      entity.age > spec.lifeTicks ||
      spec.onTick?.(entity, ctx) === false ||
      !move(entity, spec, state, dt)
    ) {
      gone.add(entity.id);
      continue;
    }
    const owner = caught(entity, spec, state);
    if (owner) {
      spec.onReturn?.(entity, owner, ctx);
      gone.add(entity.id);
      continue;
    }
    if (spec.collide.some((rule) => rule(entity, ctx))) gone.add(entity.id);
  }
  if (gone.size) state.entities = state.entities.filter((e) => !gone.has(e.id));
}
