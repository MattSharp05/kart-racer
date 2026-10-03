import { entitySpecs } from '../../../../content/items/registries';
import type { EntitySpec } from '../../../../sim/items/entities';
import { nextEntityId } from '../../../../sim/items/banana';
import { isIntangible } from '../../../../sim/items/effects';
import { tryHit } from '../../../../sim/items/hit';
import { TICK_RATE, tuning } from '../../../../sim/tuning';
import type { Entity, ItemEntity, KartState, SimEvent, SimState } from '../../../../sim/types';
import type { AiItemContext } from '../../../../sim/ai/items';
import { escortDestroyed, isEscort } from '../escort';
import { mk8ItemSim } from '../sim';
import { SPINY, SPINY_BLAST } from '../spiny-shell/sim';

export const HORN = 'super-horn';
/** The shockwave's entity: drawn round the user for `hornWaveSeconds`, it touches nothing. */
export const HORN_WAVE = 'super-horn-wave';

/** Entities a shockwave leaves alone: item boxes, explosions already landed, other shockwaves. */
const SPARED = new Set([SPINY_BLAST, HORN_WAVE]);

/** Straight-line distance, m (3D: a diving spiny is overhead). */
function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Whether the shockwave destroys entity `e` (an item of any kind but the user's own escorts). */
function breakable(e: Entity, user: KartState): boolean {
  if (e.kind === 'itemBox') return false;
  if (e.kind !== 'item') return true;
  if (SPARED.has(e.spec) || !entitySpecs.has(e.spec)) return false;
  return !(isEscort(e) && e.ownerId === user.id);
}

/**
 * The shockwave: every item within `hornRadius` of the user is destroyed (bananas, shells, item
 * entities, a Spiny Shell overhead or diving on them) and every other kart that close spins out.
 */
export function hornBlast(user: KartState, state: SimState, events: SimEvent[]): void {
  const r = tuning.mk8.hornRadius;
  const gone = new Set<number>();
  for (const e of state.entities) {
    if (!breakable(e, user) || distance(e.position, user.position) > r) continue;
    gone.add(e.id);
    if (e.kind === 'item' && isEscort(e)) escortDestroyed(state, e);
    if (e.kind === 'item' && e.spec === SPINY) {
      events.push({ type: 'itemFx', kartId: user.id, item: HORN, fx: 'spinyDown' });
    }
  }
  if (gone.size) state.entities = state.entities.filter((e) => !gone.has(e.id));
  for (const kart of state.karts) {
    if (kart.id === user.id || kart.respawnTimer > 0 || isIntangible(kart)) continue;
    if (distance(kart.position, user.position) > r) continue;
    tryHit(kart, user.id, HORN, events, { from: user.position });
  }
  const wave: ItemEntity = {
    id: nextEntityId(state),
    kind: 'item',
    spec: HORN_WAVE,
    position: { ...user.position },
    direction: { x: 0, z: -1 },
    speed: 0,
    age: 0,
    ownerId: user.id,
    targetId: -1,
    returning: 0,
    bounces: 0,
    data: [],
  };
  state.entities.push(wave);
  events.push({ type: 'itemFx', kartId: user.id, item: HORN, fx: 'blast' });
}

const waveSpec: EntitySpec = {
  id: HORN_WAVE,
  movement: { type: 'area' },
  speed: 0,
  lifeTicks: Math.round(tuning.mk8.hornWaveSeconds * TICK_RATE),
  radius: tuning.mk8.hornRadius,
  spawnDistance: 0,
  walls: 'ghost',
  ownerImmuneTicks: Number.MAX_SAFE_INTEGER,
  collide: [],
  // Drawn round its user as it spreads.
  onTick: (wave, { state }) => {
    const user = state.karts[wave.ownerId];
    if (user) wave.position = { ...user.position };
    return user !== undefined;
  },
};

/**
 * AI (MK-129): blown the moment a Spiny Shell is within reach (overhead or diving: destroyed, the
 * user unhurt), and saved while one is on its way to this kart; otherwise blown into a crowd (at
 * least `aiHornCrowd` karts or items within its reach), or on giving up.
 */
export function hornAiUse(kart: KartState, state: SimState, { giveUp }: AiItemContext): boolean {
  const r = tuning.mk8.hornRadius;
  const spinies = state.entities.filter(
    (e): e is ItemEntity => e.kind === 'item' && e.spec === SPINY,
  );
  if (spinies.some((e) => distance(e.position, kart.position) <= r * tuning.mk8.aiHornSpinyShare)) {
    return true;
  }
  if (spinies.some((e) => e.targetId === kart.id)) return false;
  const karts = state.karts.filter(
    (other) =>
      other.id !== kart.id &&
      other.respawnTimer <= 0 &&
      distance(other.position, kart.position) <= r,
  ).length;
  // Others' bananas, shells and item entities it would destroy (not its own).
  const things = state.entities.filter(
    (e) =>
      e.kind !== 'itemBox' &&
      e.ownerId !== kart.id &&
      breakable(e, kart) &&
      distance(e.position, kart.position) <= r,
  ).length;
  return karts + things >= tuning.mk8.aiHornCrowd || giveUp;
}

/**
 * Super Horn (MK-113): a shockwave round the user. Karts within `tuning.mk8.hornRadius` spin out
 * and items that close are destroyed, a Spiny Shell among them: timed while it's within reach
 * (overhead, or diving on the user), it never explodes and the user is unhurt. Its look is in
 * `./render.ts`.
 */
export default mk8ItemSim({
  id: HORN,
  name: 'Super Horn',
  order: 370,
  onUse: (kart, state, events) => hornBlast(kart, state, events),
  aiUse: hornAiUse,
  entities: [waveSpec],
});
