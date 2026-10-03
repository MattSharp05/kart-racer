// Coins (MK-109): MK8's coins. A course's route lays them out in coin lines; a kart picks one up by
// touching it (up to `tuning.mk8.coins.max`), each coin held adds `tuning.mk8.coins.speed` to its
// top speed (`kartTopSpeed`) and a pickup gives a small push. A hit (any `kartHit`) drops
// `coins.lost` of them as loose coins round the kart that anyone else can take for a few seconds;
// a fall (`respawn`) just loses them. Taken line coins come back after `coins.respawn` s.
// Only tracks whose route has coin lines have coins (`SimState.coins`, `KartState.coins`): every
// other track's state is exactly as before (`regression.test.ts`).
import { tracks } from '../content/tracks';
import {
  add,
  countDown,
  cross,
  dot,
  forwardFromHeading,
  normalize,
  scale,
  sub,
  type Vec3,
} from './math';
import { kartTopSpeed } from './kart';
import { routeGeometry, type CoinLine, type RouteDef } from './route';
import { isRespawning } from './respawn';
import { tuning } from './tuning';
import type { CoinEntity, KartState, SimEvent, SimState } from './types';

/** Turns successive drops' rings so they spread round evenly, radians. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Lap fractions of a coin line's coins: evenly from `from` to `to` (forwards round the lap). */
export function coinLineTs(line: CoinLine): number[] {
  const span = (line.to - line.from + 1) % 1;
  return Array.from({ length: line.count }, (_, k) => {
    const f = line.count > 1 ? k / (line.count - 1) : 0;
    return (line.from + span * f) % 1;
  });
}

/** The coins a route's coin lines lay out, on its centreline frame (ids from 0). */
export function routeCoins(route: RouteDef): CoinEntity[] {
  const geometry = routeGeometry(route);
  let id = 0;
  return route.coinLines.flatMap((line) =>
    coinLineTs(line).map((t) => ({
      id: id++,
      position: geometry.frameAt(t, line.lateral).position,
      respawnTimer: 0,
    })),
  );
}

/**
 * Gives a new race its coins when its track has coin lines (mesh tracks, MK-105): the line coins
 * in `state.coins` and every kart at 0 coins. Other tracks (and unknown ids) are left untouched.
 */
export function addCoins(state: SimState): SimState {
  if (!tracks.has(state.trackId)) return state;
  const track = tracks.get(state.trackId).def;
  if (track.kind !== 'mesh' || track.route.coinLines.length === 0) return state;
  state.coins = routeCoins(track.route);
  for (const kart of state.karts) kart.coins = 0;
  return state;
}

/**
 * Coins, once per tick after items and respawns: this tick's hits drop coins and falls lose them,
 * timers run, then karts pick up the coins they touch. Mutates `state` (the tick's clone). Simulating
 * one kart (`StepOptions.only`, MK-74), only that kart picks up coins.
 */
export function updateCoins(state: SimState, events: SimEvent[], dt: number, only?: number): void {
  const coins = state.coins;
  if (!coins) return;
  const c = tuning.mk8.coins;
  for (const event of [...events]) {
    if (event.type !== 'kartHit' && event.type !== 'respawn') continue;
    const kart = state.karts[event.kartId];
    if (!kart || kart.coins === undefined) continue;
    const lost = Math.min(c.lost, kart.coins);
    kart.coins -= lost;
    if (event.type === 'kartHit') coins.push(...dropCoins(kart, lost, coins, state.tick));
  }

  state.coins = coins.filter((coin) => {
    coin.respawnTimer = countDown(coin.respawnTimer, dt);
    if (coin.ownerImmune !== undefined) coin.ownerImmune = countDown(coin.ownerImmune, dt);
    if (coin.life === undefined) return true;
    coin.life = countDown(coin.life, dt);
    return coin.life > 0;
  });

  for (const kart of state.karts) {
    if (kart.coins === undefined || isRespawning(kart)) continue;
    if (only !== undefined && kart.id !== only) continue;
    state.coins = state.coins.filter((coin) => {
      if (!canTake(kart, coin)) return true;
      takeCoin(kart, state, events);
      if (coin.life !== undefined) return false;
      coin.respawnTimer = c.respawn;
      return true;
    });
  }
}

/** Whether `kart` is touching `coin` and may take it. */
function canTake(kart: KartState, coin: CoinEntity): boolean {
  if (coin.respawnTimer > 0) return false;
  if (coin.ownerId === kart.id && (coin.ownerImmune ?? 0) > 0) return false;
  const d = sub(kart.position, coin.position);
  return dot(d, d) <= tuning.mk8.coins.radius ** 2;
}

/** One more coin (none past the most), a small push forward and a `coin` event either way. */
function takeCoin(kart: KartState, state: SimState, events: SimEvent[]): void {
  const c = tuning.mk8.coins;
  kart.coins = Math.min(c.max, (kart.coins ?? 0) + 1);
  const forward = kart.forward ?? forwardFromHeading(kart.heading);
  const along = dot(kart.velocity, forward);
  const push = Math.min(c.pickupSpeed, kartTopSpeed(kart, state.engineClass) - along);
  if (push > 0) {
    kart.velocity = add(kart.velocity, scale(forward, push));
    kart.speed = dot(kart.velocity, forward);
  }
  events.push({ type: 'coin', kartId: kart.id });
}

/**
 * `count` loose coins on a ring round a hit kart, in its own plane (so a hit on a wall drops them on
 * the wall), turned a little each tick so drops don't all line up. Ids carry on from the highest.
 */
function dropCoins(
  kart: KartState,
  count: number,
  coins: readonly CoinEntity[],
  tick: number,
): CoinEntity[] {
  const c = tuning.mk8.coins;
  const up = kart.up ?? { x: 0, y: 1, z: 0 };
  const forward = kart.forward ?? forwardFromHeading(kart.heading);
  const right = normalize(cross(forward, up));
  let id = coins.reduce((max, coin) => Math.max(max, coin.id), -1) + 1;
  const turn = (tick * GOLDEN_ANGLE) % (2 * Math.PI);
  return Array.from({ length: count }, (_, k) => {
    const angle = turn + (2 * Math.PI * k) / count;
    const offset: Vec3 = add(
      scale(forward, Math.cos(angle) * c.scatterRadius),
      scale(right, Math.sin(angle) * c.scatterRadius),
    );
    return {
      id: id++,
      position: add(kart.position, offset),
      respawnTimer: 0,
      life: c.scatterLife,
      ownerId: kart.id,
      ownerImmune: c.scatterOwnerImmune,
    };
  });
}
