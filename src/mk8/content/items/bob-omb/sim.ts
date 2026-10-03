import { kartsAlongLap } from '../../../../sim/ai/itemTactics';
import type { EntityContext, EntitySpec } from '../../../../sim/items/entities';
import { spawnEntity, touchKarts } from '../../../../sim/items/entities';
import { nextEntityId } from '../../../../sim/items/banana';
import { tryHit } from '../../../../sim/items/hit';
import { add, forwardFromHeading, lerp, scale, WORLD_UP, type Vec3 } from '../../../../sim/math';
import { getTrack, groundAt } from '../../../../sim/track';
import { TICK_RATE, tuning } from '../../../../sim/tuning';
import type { ItemEntity, KartState, SimEvent, SimState } from '../../../../sim/types';
import { mk8ItemSim } from '../sim';

export const BOBOMB = 'bob-omb';
/** The blast's entity: it stays up a moment, hitting karts that drive into it. */
export const BOBOMB_BLAST = 'bob-omb-blast';

/**
 * A Bob-omb's `data`: where it was let go (x, y, z), where it lands (x, y, z) and its arc's height
 * (m; 0 when dropped).
 */
const D = { fromX: 0, fromY: 1, fromZ: 2, toX: 3, toY: 4, toZ: 5, arc: 6 } as const;

const ticks = (seconds: number) => Math.round(seconds * TICK_RATE);

/** Whether the Bob-omb is still in the air. */
export function bobombFlying(e: ItemEntity): boolean {
  return e.age < ticks(tuning.mk8.bobombFlightSeconds);
}

/** A kart's road up (+Y off mesh tracks). */
const upOf = (kart: KartState): Vec3 => kart.up ?? WORLD_UP;

/** A kart caught in the blast spins out (longer than a shell's) and is thrown up along its up. */
function blowUp(kart: KartState, by: number, at: Vec3, events: SimEvent[]): void {
  if (tryHit(kart, by, BOBOMB, events, { from: at }) !== 'hit') return;
  const m = tuning.mk8;
  kart.spinTimer = Math.max(kart.spinTimer, m.bobombSpinSeconds);
  kart.invulnerableTimer = Math.max(
    kart.invulnerableTimer,
    m.bobombSpinSeconds + tuning.hitInvulnerableSeconds,
  );
  kart.velocity = add(kart.velocity, scale(upOf(kart), m.bobombLaunchSpeed));
  kart.grounded = false;
}

/** Whether `kart` is inside the blast (3D distance). */
export function inBobombBlast(blast: { position: Vec3 }, kart: KartState): boolean {
  if (kart.respawnTimer > 0) return false;
  const p = kart.position;
  const b = blast.position;
  return Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) <= tuning.mk8.bobombRadius;
}

/** The Bob-omb goes off where it is: every kart within `bobombRadius` blows up. */
function explode(bobomb: ItemEntity, { state, events }: EntityContext): void {
  const blast: ItemEntity = {
    id: nextEntityId(state),
    kind: 'item',
    spec: BOBOMB_BLAST,
    position: { ...bobomb.position },
    direction: { ...bobomb.direction },
    speed: 0,
    age: 0,
    ownerId: bobomb.ownerId,
    targetId: -1,
    returning: 0,
    bounces: 0,
    data: [],
  };
  state.entities.push(blast);
  for (const kart of state.karts) {
    if (inBobombBlast(blast, kart)) blowUp(kart, bobomb.ownerId, blast.position, events);
  }
  events.push({ type: 'itemFx', kartId: bobomb.ownerId, item: BOBOMB, fx: 'explode' });
}

/** In the air it follows its arc; on the ground it waits. It goes off when the fuse runs out. */
function bobombTick(bobomb: ItemEntity, ctx: EntityContext): boolean {
  const m = tuning.mk8;
  if (bobomb.age >= ticks(m.bobombFuse)) {
    explode(bobomb, ctx);
    return false;
  }
  const flight = ticks(m.bobombFlightSeconds);
  if (bobomb.age > flight) return true;
  const d = bobomb.data;
  const from = { x: d[D.fromX] ?? 0, y: d[D.fromY] ?? 0, z: d[D.fromZ] ?? 0 };
  const to = { x: d[D.toX] ?? 0, y: d[D.toY] ?? 0, z: d[D.toZ] ?? 0 };
  const k = bobomb.age / flight;
  const p = lerp(from, to, k);
  bobomb.position = { ...p, y: p.y + 4 * k * (1 - k) * (d[D.arc] ?? 0) };
  return true;
}

const bobombSpec: EntitySpec = {
  id: BOBOMB,
  // It moves itself along its arc (`bobombTick`): no generic movement.
  movement: { type: 'area' },
  speed: 0,
  lifeTicks: ticks(tuning.mk8.bobombFuse) + 1,
  radius: tuning.mk8.bobombTouchRadius,
  spawnDistance: 0,
  walls: 'ghost',
  ownerImmuneTicks: ticks(tuning.mk8.bobombOwnerImmuneSeconds),
  // A kart touching it sets it off; not its thrower catching up with one thrown ahead (the blast
  // can still catch them).
  collide: [
    touchKarts((bobomb, kart, ctx) => {
      if (kart.id === bobomb.ownerId && (bobomb.data[D.arc] ?? 0) > 0) return false;
      explode(bobomb, ctx);
      return true;
    }),
  ],
  onTick: bobombTick,
};

const blastSpec: EntitySpec = {
  id: BOBOMB_BLAST,
  movement: { type: 'area' },
  speed: 0,
  lifeTicks: ticks(tuning.mk8.bobombBlastSeconds),
  radius: tuning.mk8.bobombRadius,
  spawnDistance: 0,
  walls: 'ghost',
  ownerImmuneTicks: 0,
  // Karts driving into it while it's up blow up too.
  collide: [
    touchKarts((blast, kart, { events }) => {
      if (inBobombBlast(blast, kart)) blowUp(kart, blast.ownerId, blast.position, events);
      return false;
    }),
  ],
};

/** Lets a Bob-omb go: thrown ahead in an arc, or dropped just behind while braking. */
export function throwBobomb(kart: KartState, state: SimState, braking: boolean): ItemEntity {
  const m = tuning.mk8;
  const forward = forwardFromHeading(kart.heading);
  const spot = add(
    kart.position,
    scale(forward, braking ? -m.bobombDropDistance : m.bobombThrowDistance),
  );
  const ground = groundAt(getTrack(state.trackId), spot);
  const to = { ...spot, y: ground.surface === 'out' ? kart.position.y : ground.height };
  const bobomb = spawnEntity(state, BOBOMB, kart, { direction: { x: forward.x, z: forward.z } });
  // Dropped, it's already down: its "flight" stays where it is.
  const from = braking ? to : { ...kart.position };
  bobomb.position = { ...from };
  bobomb.data = [from.x, from.y, from.z, to.x, to.y, to.z, braking ? 0 : m.bobombArcHeight];
  return bobomb;
}

/**
 * Bob-omb (MK-114): thrown ahead in an arc to land `bobombThrowDistance` m on (dropped just behind
 * while braking). It goes off when a kart touches it, or `bobombFuse` s after it's let go: every
 * kart within `bobombRadius` (its thrower too) spins out and is thrown up, and the blast stays up a
 * moment. Drawn by `./render.ts` (and the `mk8` item skin with a pack).
 */
export default mk8ItemSim({
  id: BOBOMB,
  name: 'Bob-omb',
  order: 380,
  onUse: (kart, state, _events, input) => {
    throwBobomb(kart, state, input.brake > 0 && input.throttle <= 0);
  },
  // AI (MK-129): thrown forward into a pack (`aiBobombPack` karts within `aiBobombAhead` m), or
  // dropped behind (braking for the tick) on a kart right behind; else on giving up.
  aiUse: (kart, state, ctx) => {
    const m = tuning.mk8;
    if (kartsAlongLap(kart, state, ctx, m.aiBobombAhead, 1) >= m.aiBobombPack) return true;
    if (kartsAlongLap(kart, state, ctx, m.aiBobombBehind, -1) > 0) return { throttle: 0, brake: 1 };
    return ctx.giveUp;
  },
  entities: [bobombSpec, blastSpec],
});
