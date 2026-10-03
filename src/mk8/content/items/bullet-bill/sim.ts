// Bullet Bill (MK-120): the kart becomes a bullet that rides the lap on its own for
// `tuning.mk8.bulletTime` s at `bulletSpeed` × the engine class's top speed, along the route's AI
// line and with the route's up (so it follows walls, ceilings and anti-gravity like the road does,
// and flies straight over gaps). It can't be hit, and it spins out every kart it touches. Its
// driver's input is ignored meanwhile, item button included. When it ends the kart drives on with a
// small boost, on the road: never inside a wall, over a gap or off the road (it's put on the first
// safe spot further along the route if it would be). Pure sim code.
import { groundAt as trackGroundAt, trackGeometry } from '../../../../sim/track';
import { applyBoost, cancelDrift } from '../../../../sim/drift';
import { endGlide } from '../../../../sim/glide';
import { applyEffect, getEffect, isIntangible } from '../../../../sim/items/effects';
import { tryHit } from '../../../../sim/items/hit';
import {
  kartLapS,
  lapFrame,
  lapLength,
  lapPosition,
  lapTrack,
  wrapLap,
  type LapFrame,
} from '../../../../sim/items/routeFollow';
import { kartTopSpeed } from '../../../../sim/kart';
import {
  add,
  clamp,
  cross,
  dot,
  forwardFromHeading,
  headingOf,
  length,
  normalize,
  scale,
  sub,
  type Vec3,
} from '../../../../sim/math';
import { raycastMesh, surfaceMask, wallContact } from '../../../../sim/meshTrack';
import { routeGeometry } from '../../../../sim/route';
import { TICK_RATE, tuning } from '../../../../sim/tuning';
import type { KartEffect, KartState, SimEvent, SimState } from '../../../../sim/types';
import { mk8ItemSim } from '../sim';

/** The item, and the effect that turns its user into the bullet. */
export const BULLET = 'bullet-bill';

/** What the effect keeps in `data`: metres round the lap, and metres right of the centreline. */
export enum BulletData {
  s = 0,
  lateral = 1,
}

/** Ground a bullet rides on (not walls, water or a kill floor). */
const RIDES_ON = surfaceMask('road', 'offroad', 'boost', 'antigrav', 'glide');
/** Ground a kart may be left on when the bullet ends (not offroad). */
const SAFE = surfaceMask('road', 'boost', 'antigrav', 'glide');
/** Steps along the route while looking for a safe spot at the end, m. */
const SAFE_STEP = 2;

type LapTrack = NonNullable<ReturnType<typeof lapTrack>>;

/** The bullet's speed in this race, m/s. */
export function bulletSpeed(state: SimState): number {
  return tuning.topSpeed[state.engineClass] * tuning.mk8.bulletSpeed;
}

/** Whether `kart` is a bullet right now. */
export function isBullet(kart: KartState): boolean {
  const effect = getEffect(kart, BULLET);
  return effect !== undefined && effect.ticksLeft > 0;
}

/** How far right of the centreline a kart can be at lap distance `s`, m (either way). */
function room(track: LapTrack, frame: LapFrame, s: number): number {
  const width =
    track.kind === 'mesh'
      ? routeGeometry(track.route).frameAt(s / lapLength(track)).width
      : trackGeometry(track).project(frame.position).width;
  return Math.max(0, width / 2 - tuning.kartHalfWidth);
}

/** The AI line's offset at `s` on a mesh route (spline tracks: the centreline), m. */
function aiLine(track: LapTrack, s: number): number {
  return track.kind === 'mesh' ? routeGeometry(track.route).racingLineAt(s) : 0;
}

/** The ground under a point of the lap: on a mesh track along its up, else the spline's height. */
function groundUnder(
  track: LapTrack,
  frame: LapFrame,
  mask: number,
): { point: Vec3; surface: string } | null {
  if (track.kind === 'mesh') {
    const probe = tuning.mk8.bulletProbe;
    const hit = raycastMesh(
      track.collision,
      add(frame.position, scale(frame.up, probe)),
      scale(frame.up, -1),
      probe * 2,
      mask,
    );
    return hit ? { point: hit.point, surface: hit.surface } : null;
  }
  const ground = trackGroundAt(track, frame.position);
  if (ground.surface === 'out') return null;
  return { point: { ...frame.position, y: ground.height }, surface: ground.surface };
}

/** Whether a kart can be left at this point of the lap: on the road and clear of walls. */
function safeAt(track: LapTrack, frame: LapFrame): Vec3 | null {
  const ground = groundUnder(track, frame, SAFE);
  if (!ground) return null;
  if (track.kind !== 'mesh') {
    return ground.surface === 'rough' || ground.surface === 'offroad' ? null : ground.point;
  }
  const centre = add(ground.point, scale(frame.up, tuning.mk8.wallLift));
  return wallContact(track.collision, centre, tuning.mk8.wallRadius, frame.up)
    ? null
    : ground.point;
}

/** Puts the kart on the lap at `s`, `lateral` m right of the centreline, facing along it. */
function place(
  kart: KartState,
  track: LapTrack,
  frame: LapFrame,
  position: Vec3,
  speed: number,
): void {
  kart.position = position;
  kart.velocity = scale(frame.tangent, speed);
  kart.speed = speed;
  kart.heading = headingOf(frame.tangent, kart.heading);
  if (track.kind === 'mesh') {
    kart.forward = { ...frame.tangent };
    kart.up = { ...frame.up };
  }
}

/** One tick of the bullet's ride: on along the lap and onto the AI line, on the road. */
function ride(kart: KartState, effect: KartEffect, state: SimState, dt: number): void {
  const track = lapTrack(state);
  if (!track) return;
  const speed = bulletSpeed(state);
  const s = wrapLap((effect.data[BulletData.s] ?? 0) + speed * dt, lapLength(track));
  const line = aiLine(track, s);
  const was = effect.data[BulletData.lateral] ?? 0;
  let lateral = was + clamp(line - was, -tuning.mk8.bulletSteer * dt, tuning.mk8.bulletSteer * dt);
  const centre = lapFrame(track, s);
  const reach = room(track, centre, s);
  lateral = clamp(lateral, -reach, reach);
  effect.data = [s, lateral];

  const frame = lapFrame(track, s, lateral);
  // On the road where there is some (the route needn't sit exactly on it); over a gap, on the route.
  const ground = groundUnder(track, frame, RIDES_ON);
  place(kart, track, frame, ground?.point ?? frame.position, speed);
  kart.grounded = true;
  kart.airTime = 0;
  if (track.kind === 'mesh') {
    if (ground?.surface === 'antigrav') kart.antigrav = true;
    else if (ground && ground.surface !== 'offroad') kart.antigrav = false;
    kart.gravityDir = kart.antigrav ? scale(frame.up, -1) : { x: 0, y: -1, z: 0 };
  }
}

/**
 * The bullet spins out every kart it touches, knocking it aside. An effect tick, so it runs with the
 * other item hits after karts move (a client predicting only its own kart can't hit anyone there).
 */
function knockAside(kart: KartState, state: SimState, events: SimEvent[]): void {
  const right = rightOfKart(kart);
  for (const other of state.karts) {
    if (other.id === kart.id || other.respawnTimer > 0 || isIntangible(other)) continue;
    if (length(sub(other.position, kart.position)) > tuning.mk8.bulletRadius) continue;
    if (tryHit(other, kart.id, BULLET, events, { from: kart.position }) !== 'hit') continue;
    // Knocked aside, away from the bullet's line.
    const side = dot(sub(other.position, kart.position), right) < 0 ? -1 : 1;
    other.velocity = add(other.velocity, scale(right, side * tuning.mk8.bulletKnock));
  }
}

/** The kart's right: across its facing in its own plane (+Y up off mesh tracks). */
function rightOfKart(kart: KartState): Vec3 {
  const forward = kart.forward ?? forwardFromHeading(kart.heading);
  const up = kart.up ?? { x: 0, y: 1, z: 0 };
  return normalize(cross(forward, up));
}

/**
 * The bullet ends: the kart is left on the road, clear of walls, where the bullet is (or on the
 * centreline there, or the first safe spot within `bulletSafeSearch` m further on), driving on at
 * its top speed with a boost.
 */
function finish(kart: KartState, effect: KartEffect, state: SimState, events: SimEvent[]): void {
  const track = lapTrack(state);
  if (track) {
    const s = effect.data[BulletData.s] ?? kartLapS(track, kart);
    const lateral = effect.data[BulletData.lateral] ?? 0;
    const tries: [number, number][] = [
      [s, lateral],
      [s, 0],
    ];
    for (let d = SAFE_STEP; d <= tuning.mk8.bulletSafeSearch; d += SAFE_STEP)
      tries.push([s + d, 0]);
    for (const [at, side] of tries) {
      const frame = lapFrame(track, at, side);
      const spot = safeAt(track, frame);
      if (!spot) continue;
      place(kart, track, frame, spot, kartTopSpeed(kart, state.engineClass));
      if (track.kind === 'mesh')
        kart.antigrav = groundUnder(track, frame, SAFE)?.surface === 'antigrav';
      break;
    }
  }
  kart.grounded = true;
  kart.airTime = 0;
  applyBoost(kart, tuning.mk8.bulletEndBoost, events);
}

/**
 * Bullet Bill (MK-120): see the top of this file. Using it starts the `bullet-bill` effect where
 * the kart is on the lap; the effect's `drive` moves the kart each tick in place of its physics.
 */
export default mk8ItemSim({
  id: BULLET,
  name: 'Bullet Bill',
  order: 390,
  onUse: (kart, state, events) => {
    applyEffect(kart, BULLET, Math.round(tuning.mk8.bulletTime * TICK_RATE), state, events);
  },
  effects: [
    {
      id: BULLET,
      onApply: (kart, effect, state, events) => {
        const track = lapTrack(state);
        if (!track) {
          // No lap to follow (an arena): just a boost.
          effect.ticksLeft = 0;
          return;
        }
        const hint = kart.race.lastT >= 0 ? kart.race.lastT : undefined;
        const here = lapPosition(track, kart.position, hint);
        effect.data = [here.s, here.lateral];
        cancelDrift(kart, events);
        endGlide(kart, events);
      },
      drive: ride,
      onTick: (kart, _effect, state, _dt, events) => knockAside(kart, state, events),
      // Nothing hurts a bullet, and it doesn't bump karts: it goes through them, spinning them
      // out and knocking them aside (`ride`), rather than shoving them along in front of it.
      onHit: () => true,
      intangible: true,
      onExpire: finish,
    },
  ],
});
