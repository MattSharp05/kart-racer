import type { EntityContext, EntitySpec } from '../../../../sim/items/entities';
import { canTouch, spawnEntity, touchKarts } from '../../../../sim/items/entities';
import { nextEntityId } from '../../../../sim/items/banana';
import { hitKart, tryHit } from '../../../../sim/items/hit';
import {
  kartLapS,
  lapFrame,
  lapGap,
  lapLength,
  lapPosition,
  lapTrack,
  wrapLap,
} from '../../../../sim/items/routeFollow';
import { add, lerp, scale, WORLD_UP, type Vec3 } from '../../../../sim/math';
import { DT, TICK_RATE, tuning } from '../../../../sim/tuning';
import type { ItemEntity, KartState, SimEvent, SimState } from '../../../../sim/types';
import { mk8ItemSim } from '../sim';

export const SPINY = 'spiny-shell';
/** The explosion's entity: it stays up a moment, hitting karts that drive into it. */
export const SPINY_BLAST = 'spiny-shell-blast';

/** Where a spiny is in its flight (`data[0]`). */
export const SpinyPhase = { ground: 0, air: 1, dive: 2 } as const;

/**
 * A spiny's `data`: phase, distance round the lap (m), offset right of the centreline (m), height
 * above the route along its up (m), ticks in this phase, and where its dive started (x, y, z).
 */
const D = {
  phase: 0,
  s: 1,
  lateral: 2,
  height: 3,
  ticks: 4,
  startX: 5,
  startY: 6,
  startZ: 7,
} as const;

const ticks = (seconds: number) => Math.round(seconds * TICK_RATE);

/** The phase of a spiny entity. */
export function spinyPhase(e: ItemEntity): number {
  return e.data[D.phase] ?? SpinyPhase.ground;
}

/** A kart's road up (+Y off mesh tracks). */
const upOf = (kart: KartState): Vec3 => kart.up ?? WORLD_UP;

/** The race leader (the spiny's target). */
const leader = (state: SimState): number => state.positions[0] ?? -1;

/**
 * A kart caught in the explosion: a spin-out (longer than a shell's) and thrown up along its up.
 * A kart that can't be hit, or whose shield stops it, is left alone.
 */
function blowUp(kart: KartState, by: number, at: Vec3, events: SimEvent[]): void {
  if (tryHit(kart, by, SPINY, events, { from: at }) !== 'hit') return;
  const m = tuning.mk8;
  kart.spinTimer = Math.max(kart.spinTimer, m.spinySpinSeconds);
  kart.invulnerableTimer = Math.max(
    kart.invulnerableTimer,
    m.spinySpinSeconds + tuning.hitInvulnerableSeconds,
  );
  kart.velocity = add(kart.velocity, scale(upOf(kart), m.spinyLaunchSpeed));
  kart.grounded = false;
}

/** The spiny lands at `at`: every kart within `spinyRadius` blows up, and the blast stays up. */
function explode(spiny: ItemEntity, at: Vec3, ctx: EntityContext): void {
  const { state, events } = ctx;
  const blast: ItemEntity = {
    id: nextEntityId(state),
    kind: 'item',
    spec: SPINY_BLAST,
    position: { ...at },
    direction: { ...spiny.direction },
    speed: 0,
    age: 0,
    ownerId: spiny.ownerId,
    targetId: spiny.targetId,
    returning: 0,
    bounces: 0,
    data: [],
  };
  state.entities.push(blast);
  for (const kart of state.karts) {
    if (inBlast(blast, kart)) blowUp(kart, spiny.ownerId, at, events);
  }
  events.push({ type: 'itemFx', kartId: spiny.targetId, item: SPINY, fx: 'explode' });
}

/** Whether `kart` is inside the blast (3D: the road may be a wall or a ceiling there). */
function inBlast(blast: ItemEntity, kart: KartState): boolean {
  if (kart.respawnTimer > 0) return false;
  const dx = kart.position.x - blast.position.x;
  const dy = kart.position.y - blast.position.y;
  const dz = kart.position.z - blast.position.z;
  return Math.hypot(dx, dy, dz) <= tuning.mk8.spinyRadius;
}

/** Starts the dive onto the target from where the spiny is. */
function startDive(spiny: ItemEntity, events: SimEvent[]): void {
  const { x, y, z } = spiny.position;
  spiny.data[D.phase] = SpinyPhase.dive;
  spiny.data[D.ticks] = 0;
  spiny.data[D.startX] = x;
  spiny.data[D.startY] = y;
  spiny.data[D.startZ] = z;
  events.push({ type: 'itemFx', kartId: spiny.targetId, item: SPINY, fx: 'dive' });
}

/** XZ unit direction of `v` (or `fallback` when it's vertical). */
function flat(v: Vec3, fallback: { x: number; z: number }): { x: number; z: number } {
  const l = Math.hypot(v.x, v.z);
  return l > 1e-9 ? { x: v.x / l, z: v.z / l } : fallback;
}

/**
 * Along the route: skims the road for `spinyGroundSeconds`, then climbs to `spinyAirHeight`,
 * following whoever leads; dives once the leader is `spinyDiveDistance` ahead (or behind).
 * Returns false when there's no lap to follow (an arena): it dives from where it is.
 */
function flyRoute(spiny: ItemEntity, state: SimState, events: SimEvent[]): boolean {
  const track = lapTrack(state);
  const target = state.karts[spiny.targetId];
  if (!track || !target) return false;
  const m = tuning.mk8;
  const length = lapLength(track);
  const d = spiny.data;
  const phase =
    d[D.phase] === SpinyPhase.ground && (d[D.ticks] ?? 0) + 1 >= ticks(m.spinyGroundSeconds)
      ? SpinyPhase.air
      : (d[D.phase] ?? SpinyPhase.ground);
  const s = wrapLap((d[D.s] ?? 0) + spiny.speed * DT, length);
  const lateral = (d[D.lateral] ?? 0) * Math.exp(-m.spinyCentreRate * DT);
  const height =
    phase === SpinyPhase.air
      ? Math.min(m.spinyAirHeight, (d[D.height] ?? 0) + m.spinyClimbRate * DT)
      : m.spinyGroundHeight;
  const frame = lapFrame(track, s, lateral);
  spiny.position = add(frame.position, scale(frame.up, height));
  spiny.direction = flat(frame.tangent, spiny.direction);
  d[D.ticks] = phase === d[D.phase] ? (d[D.ticks] ?? 0) + 1 : 0;
  d[D.phase] = phase;
  d[D.s] = s;
  d[D.lateral] = lateral;
  d[D.height] = height;
  if (lapGap(s, kartLapS(track, target), length) <= m.spinyDiveDistance) startDive(spiny, events);
  return true;
}

/**
 * The dive: it closes in over the target at `spinyAirHeight`, then drops onto it for the last
 * `spinyDropShare` of `spinyDiveSeconds`, and explodes. Returns false once it has.
 */
function dive(spiny: ItemEntity, target: KartState, ctx: EntityContext): boolean {
  const m = tuning.mk8;
  const d = spiny.data;
  const n = (d[D.ticks] ?? 0) + 1;
  d[D.ticks] = n;
  const total = ticks(m.spinyDiveSeconds);
  if (n >= total) {
    explode(spiny, target.position, ctx);
    return false;
  }
  const k = n / total;
  const closeIn = 1 - m.spinyDropShare;
  const up = upOf(target);
  const drop = Math.max(0, (k - closeIn) / m.spinyDropShare);
  const above = add(target.position, scale(up, m.spinyAirHeight * (1 - drop * drop)));
  const start = { x: d[D.startX] ?? 0, y: d[D.startY] ?? 0, z: d[D.startZ] ?? 0 };
  // Smoothstep in, then right over it.
  const c = Math.min(1, k / closeIn);
  const before = spiny.position;
  spiny.position = lerp(start, above, c * c * (3 - 2 * c));
  spiny.direction = flat(
    { x: spiny.position.x - before.x, y: 0, z: spiny.position.z - before.z },
    spiny.direction,
  );
  return true;
}

/** A spiny's tick: follow the leader along the route, then dive and explode. */
function spinyTick(spiny: ItemEntity, ctx: EntityContext): boolean {
  const { state, events } = ctx;
  if (spinyPhase(spiny) !== SpinyPhase.dive) {
    // Whoever leads now; a new leader is warned too.
    const now = leader(state);
    if (now !== spiny.targetId && now >= 0) {
      spiny.targetId = now;
      events.push({ type: 'itemFx', kartId: now, item: SPINY, fx: 'incoming' });
    }
    if (!state.karts[spiny.targetId]) return false;
    if (!flyRoute(spiny, state, events) && spinyPhase(spiny) !== SpinyPhase.dive) {
      startDive(spiny, events);
    }
  }
  const target = state.karts[spiny.targetId];
  if (spinyPhase(spiny) !== SpinyPhase.dive) return true;
  return target ? dive(spiny, target, ctx) : false;
}

/** On the ground leg it hits every kart in its path but the leader (whom the explosion is for). */
function groundHits(spiny: ItemEntity, ctx: EntityContext): boolean {
  if (spinyPhase(spiny) !== SpinyPhase.ground) return false;
  for (const kart of ctx.state.karts) {
    if (kart.id === spiny.targetId || !canTouch(spiny, kart, ctx.spec)) continue;
    hitKart(kart, spiny.ownerId, SPINY, ctx.events, { from: spiny.position });
  }
  return false;
}

const spinySpec: EntitySpec = {
  id: SPINY,
  // It moves itself along the route (`spinyTick`): no generic movement.
  movement: { type: 'area' },
  speed: tuning.mk8.spinySpeed,
  lifeTicks: ticks(tuning.mk8.spinyLifeSeconds),
  radius: tuning.mk8.spinyTouchRadius,
  spawnDistance: 2,
  walls: 'ghost',
  // It never hits its owner on the way out (the explosion can).
  ownerImmuneTicks: ticks(tuning.mk8.spinyGroundSeconds),
  collide: [groundHits],
  onTick: spinyTick,
  chases: true,
};

const blastSpec: EntitySpec = {
  id: SPINY_BLAST,
  movement: { type: 'area' },
  speed: 0,
  lifeTicks: ticks(tuning.mk8.spinyBlastSeconds),
  radius: tuning.mk8.spinyRadius,
  spawnDistance: 0,
  walls: 'ghost',
  ownerImmuneTicks: 0,
  // Karts driving into it while it's up blow up too.
  collide: [
    touchKarts((blast, kart, { events }) => {
      if (inBlast(blast, kart)) blowUp(kart, blast.ownerId, blast.position, events);
      return false;
    }),
  ],
};

/**
 * Spiny Shell (MK-113): flies along the route (a mesh track's route, with its up; a spline track's
 * centreline) to whoever leads. For its first `spinyGroundSeconds` it skims the road and hits every
 * kart in its path; then it flies over everyone. Once the leader is close it closes in above them,
 * drops and explodes: everyone within `spinyRadius` spins out and is thrown up. A Super Horn
 * within reach destroys it (`../super-horn/sim.ts`). The HUD warns its target (`chases`, and an
 * `incoming` itemFx when it's thrown or the lead changes); it's drawn by `./render.ts`.
 */
export default mk8ItemSim({
  id: SPINY,
  name: 'Spiny Shell',
  order: 360,
  onUse: (kart, state, events) => {
    const spiny = spawnEntity(state, SPINY, kart, { targetId: leader(state) });
    const track = lapTrack(state);
    const at = track ? lapPosition(track, spiny.position) : { s: 0, lateral: 0 };
    spiny.position = add(spiny.position, scale(upOf(kart), tuning.mk8.spinyGroundHeight));
    spiny.data = [SpinyPhase.ground, at.s, at.lateral, tuning.mk8.spinyGroundHeight, 0, 0, 0, 0];
    if (spiny.targetId >= 0) {
      events.push({ type: 'itemFx', kartId: spiny.targetId, item: SPINY, fx: 'incoming' });
    }
  },
  entities: [spinySpec, blastSpec],
});
