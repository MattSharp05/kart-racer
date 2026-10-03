// MK8's triple shells and triple bananas (MK-112): while a kart holds one, its shells circle it or
// its bananas trail behind it, one world entity per use left. They are the item's `uses` made
// visible: each press fires (or drops) one, each hit they stop from behind uses one up, and one
// that touches another kart or an item knocks it out and is used up too. The item clears when the
// last one goes. Pure sim code.
import { entitySpecs } from '../../../content/items/registries';
import { blockItems, type EntityContext, type EntitySpec } from '../../../sim/items/entities';
import { isIntangible } from '../../../sim/items/effects';
import { nextEntityId } from '../../../sim/items/banana';
import { tryHit } from '../../../sim/items/hit';
import { forwardFromHeading } from '../../../sim/math';
import { DT, tuning } from '../../../sim/tuning';
import type { Entity, ItemEntity, KartState, SimState } from '../../../sim/types';
import type { ItemContent } from '../../../content/items';
import type { IncomingHit } from '../../../sim/items/effects';

/** How a triple item's escorts sit: circling the kart (shells) or in a line behind it (bananas). */
export type Formation = 'orbit' | 'trail';

/** Escort specs, by entity spec id (= the item's id). */
const formations = new Map<string, Formation>();

/** Whether `e` is a triple item's escort. */
export function isEscort(e: Entity): e is ItemEntity {
  return e.kind === 'item' && formations.has(e.spec);
}

/** The escort item whose escorts `kart` should have now (slot 1, roulette over), if any. */
function escortItem(kart: KartState): string | null {
  const { held, roulette } = kart.item;
  return held !== null && roulette === 0 && formations.has(held) ? held : null;
}

/** One of `owner`'s `item` escorts is gone: one use fewer, and the item clears at 0. */
function useOne(owner: KartState | undefined, item: string): void {
  if (!owner || owner.item.held !== item) return;
  if (owner.item.uses > 1) owner.item.uses -= 1;
  else {
    owner.item.held = null;
    owner.item.uses = 0;
  }
}

/** Removes entity `e` at the end of the tick; an escort also uses up one of its owner's uses. */
function knockOut(e: Entity, ctx: EntityContext): void {
  ctx.remove(e.id);
  if (isEscort(e)) useOne(ctx.state.karts[e.ownerId], e.spec);
}

/** Where rank `k` of `n` escorts sits around `kart` at `tick`, and the way it faces. */
export function escortPose(
  formation: Formation,
  kart: KartState,
  k: number,
  n: number,
  tick: number,
): { x: number; z: number; direction: { x: number; z: number } } {
  const forward = forwardFromHeading(kart.heading);
  if (formation === 'trail') {
    const behind = tuning.mk8.trailFirst + k * tuning.mk8.trailSpacing;
    return {
      x: kart.position.x - forward.x * behind,
      z: kart.position.z - forward.z * behind,
      direction: { x: forward.x, z: forward.z },
    };
  }
  const angle = tick * DT * tuning.mk8.orbitSpeed + (k / Math.max(n, 1)) * Math.PI * 2;
  const r = tuning.mk8.orbitRadius;
  return {
    x: kart.position.x + Math.cos(angle) * r,
    z: kart.position.z + Math.sin(angle) * r,
    // Along the circle, the way it turns.
    direction: { x: -Math.sin(angle), z: Math.cos(angle) },
  };
}

/**
 * Keeps every kart's escorts in step with its slot: one per use left of the escort item it holds
 * (newest removed first, missing ones added), placed by rank around or behind it.
 */
function updateEscorts(state: SimState, item: string, formation: Formation): void {
  const mine = new Map<number, ItemEntity[]>();
  for (const e of state.entities) {
    if (e.kind !== 'item' || e.spec !== item) continue;
    const list = mine.get(e.ownerId) ?? [];
    list.push(e);
    mine.set(e.ownerId, list);
  }
  const extra = new Set<number>();
  for (const kart of state.karts) {
    const want = escortItem(kart) === item && kart.respawnTimer === 0 ? kart.item.uses : 0;
    const have = mine.get(kart.id) ?? [];
    for (const e of have.slice(want)) extra.add(e.id);
    const kept = have.slice(0, want);
    while (kept.length < want) {
      const e: ItemEntity = {
        id: nextEntityId(state),
        kind: 'item',
        spec: item,
        position: { ...kart.position },
        direction: { x: 0, z: -1 },
        speed: 0,
        age: 0,
        ownerId: kart.id,
        targetId: -1,
        returning: 0,
        bounces: 0,
        data: [],
      };
      state.entities.push(e);
      kept.push(e);
    }
    kept.forEach((e, k) => {
      const pose = escortPose(formation, kart, k, kept.length, state.tick);
      e.position = { x: pose.x, y: kart.position.y, z: pose.z };
      e.direction = pose.direction;
    });
  }
  // Karts that left the race or no longer hold the item.
  for (const [ownerId, list] of mine) {
    if (!state.karts[ownerId]) for (const e of list) extra.add(e.id);
  }
  if (extra.size) state.entities = state.entities.filter((e) => !extra.has(e.id));
}

/**
 * Whether an escort knocks `e` out: shells, landed bananas, item entities that block items (as
 * `blockItems` sees them) and other karts' escorts. Areas (a slick, a cloud) stay.
 */
function solid(e: Entity): boolean {
  if (e.kind === 'shell') return true;
  if (e.kind === 'banana') return e.flightTimer === 0;
  if (e.kind !== 'item') return false;
  if (formations.has(e.spec)) return true;
  return entitySpecs.has(e.spec) && entitySpecs.get(e.spec).collide.includes(blockItems);
}

/**
 * An escort's collisions: it knocks out a shell, landed banana or item entity of another kart's
 * (both go), else hits another kart it touches and is used up (a kart that can't be hit passes).
 */
function escortCollide(entity: ItemEntity, ctx: EntityContext): boolean {
  const { state, events, spec } = ctx;
  const owner = state.karts[entity.ownerId];
  const other = state.entities.find(
    (e) =>
      e.id !== entity.id &&
      !ctx.isGone(e.id) &&
      e.kind !== 'itemBox' &&
      e.ownerId !== entity.ownerId &&
      solid(e) &&
      Math.hypot(e.position.x - entity.position.x, e.position.z - entity.position.z) < spec.radius,
  );
  if (other) {
    knockOut(other, ctx);
    useOne(owner, spec.item);
    return true;
  }
  for (const kart of state.karts) {
    if (kart.id === entity.ownerId || kart.respawnTimer > 0 || isIntangible(kart)) continue;
    const d = Math.hypot(kart.position.x - entity.position.x, kart.position.z - entity.position.z);
    if (d > spec.radius || Math.abs(kart.position.y - entity.position.y) > tuning.itemHitHeight) {
      continue;
    }
    // A kart that can't be hit right now (just spun out, starred) passes without using it up.
    if (tryHit(kart, entity.ownerId, spec.item, events, { from: entity.position }) === 'immune') {
      continue;
    }
    useOne(owner, spec.item);
    return true;
  }
  return false;
}

/** Whether `from` is behind `kart` (the far side of the line across its centre). */
export function isBehind(kart: KartState, from: { x: number; z: number }): boolean {
  const forward = forwardFromHeading(kart.heading);
  return (from.x - kart.position.x) * forward.x + (from.z - kart.position.z) * forward.z < 0;
}

/** A hit from behind is stopped by one of the escorts, which is used up. */
function guardFromBehind(kart: KartState, hit: IncomingHit): boolean {
  if (!hit.from || !isBehind(kart, hit.from)) return false;
  const item = escortItem(kart);
  if (item === null || kart.item.uses < 1) return false;
  useOne(kart, item);
  return true;
}

/**
 * The parts of a triple item that come from its escorts: its entity spec (stays put; placed every
 * tick by `update`), the per-tick update and the hit guard. Spread into the item's sim.
 */
export function escorts(
  item: string,
  formation: Formation,
): Pick<ItemContent, 'entities' | 'update' | 'guardHit'> {
  formations.set(item, formation);
  const spec: EntitySpec = {
    id: item,
    movement: { type: 'area' },
    speed: 0,
    // It lasts as long as its owner holds the item.
    lifeTicks: Number.MAX_SAFE_INTEGER,
    radius: tuning.mk8.escortRadius,
    spawnDistance: 0,
    walls: 'ghost',
    ownerImmuneTicks: Number.MAX_SAFE_INTEGER,
    collide: [escortCollide],
  };
  return {
    entities: [spec],
    update: (state) => updateEscorts(state, item, formation),
    guardHit: (kart, hit) => guardFromBehind(kart, hit),
  };
}
