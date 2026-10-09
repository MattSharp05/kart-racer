import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_RAMP_ID } from '../mk8/content/courses/test-ramp';
import { registerTestRamp } from '../mk8/content/courses/test-ramp/register';
import { testRampRoute } from '../mk8/content/courses/test-ramp/route';
import { coinLineTs, routeCoins, updateCoins } from './coins';
import { kartTopSpeed } from './kart';
import { WORLD_UP } from './math';
import { groundAt } from './meshTrack';
import { createSimState, type KartSpawn } from './state';
import { step } from './step';
import { getTrack } from './track';
import { DT, tuning } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from './types';

/**
 * Coins (MK-109) on the synthetic `mk8-test-ramp`: its first coin line is 5 coins on the centreline
 * of straight A from x 18 to x 26 (2 m apart), its second 5 coins 3 m left of C's centreline.
 */
const C = tuning.mk8.coins;
/** Heading that faces +X (down straight A). */
const ALONG_A = -Math.PI / 2;
const THROTTLE: InputFrame = { ...NEUTRAL_INPUT, throttle: 1 };

beforeAll(registerTestRamp);

function onRamp(karts: KartSpawn[]): SimState {
  return createSimState({
    seed: 1,
    trackId: TEST_RAMP_ID,
    engineClass: 150,
    itemsOn: false,
    karts,
  });
}

/** A kart on straight A at `x` (centreline), facing +X at `speed`. */
const onA = (x: number, speed = 0, z = 0): KartSpawn => ({
  position: { x, y: 0, z },
  heading: ALONG_A,
  speed,
});

function run(
  state: SimState,
  n: number,
  input = THROTTLE,
): { state: SimState; events: SimEvent[] } {
  let s = state;
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = step(
      s,
      s.karts.map(() => input),
    );
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

const coinEvents = (events: SimEvent[], kartId = 0) =>
  events.filter((e) => e.type === 'coin' && e.kartId === kartId).length;

describe('coin layout', () => {
  it('spreads a line’s coins evenly from `from` to `to`, also across the start line', () => {
    expect(coinLineTs({ from: 0.1, to: 0.2, lateral: 0, count: 3 })).toEqual([
      0.1,
      expect.closeTo(0.15, 12),
      expect.closeTo(0.2, 12),
    ]);
    const wrapped = coinLineTs({ from: 0.95, to: 0.05, lateral: 0, count: 3 });
    expect(wrapped[0]).toBeCloseTo(0.95, 12);
    expect(wrapped[1]).toBeCloseTo(0, 12);
    expect(wrapped[2]).toBeCloseTo(0.05, 12);
    expect(coinLineTs({ from: 0.3, to: 0.4, lateral: 0, count: 1 })).toEqual([0.3]);
  });

  it('puts the test ramp’s coins on its coin lines, every kart at 0 coins', () => {
    const state = onRamp([onA(0), onA(-10)]);
    expect(state.coins).toHaveLength(10);
    const track = getTrack(TEST_RAMP_ID);
    if (track.kind !== 'mesh') throw new Error('not a mesh track');
    // On the ground (MK-143): the route's spots dropped onto the collision surface.
    expect(state.coins).toEqual(routeCoins(testRampRoute, track.collision));
    state.coins?.forEach((coin, k) => {
      const spot = routeCoins(testRampRoute)[k]?.position;
      if (!spot) throw new Error('no spot');
      expect(Math.hypot(coin.position.x - spot.x, coin.position.z - spot.z)).toBeLessThan(0.05);
      expect(groundAt(track.collision, coin.position, WORLD_UP)?.height).toBeCloseTo(0, 4);
    });
    const first = state.coins?.slice(0, 5).map((c) => c.position);
    first?.forEach((p, k) => {
      expect(Math.abs(p.x - (18 + 2 * k))).toBeLessThan(0.2);
      expect(p.z).toBeCloseTo(0, 6);
    });
    expect(state.karts.map((k) => k.coins)).toEqual([0, 0]);
  });

  it('leaves tracks without coin lines exactly as before (no coin fields at all)', () => {
    const state = createSimState({ seed: 1, trackId: 'sunny-circuit', karts: [{}] });
    expect('coins' in state).toBe(false);
    expect('coins' in (state.karts[0] ?? {})).toBe(false);
    const after = run(state, 30).state;
    expect('coins' in after).toBe(false);
    expect('coins' in (after.karts[0] ?? {})).toBe(false);
  });
});

describe('coin speed', () => {
  it('10 coins raise top speed by exactly 10 × coins.speed', () => {
    const [kart] = onRamp([onA(0)]).karts;
    if (!kart) throw new Error('no kart');
    const none = kartTopSpeed({ ...kart, coins: 0 }, 150);
    const ten = kartTopSpeed({ ...kart, coins: 10 }, 150);
    expect(ten - none).toBeCloseTo(10 * C.speed, 10);
    expect(kartTopSpeed({ ...kart, coins: undefined }, 150)).toBe(none);
  });

  it('a kart with 10 coins holds a top speed 10 × coins.speed higher at full throttle', () => {
    // Side by side on straight C (x 160 → 100, before the water), clear of its coin line
    // (z 83), each at its own top speed.
    const facingC = Math.PI / 2;
    const state = onRamp([
      { position: { x: 160, y: 0, z: 80 - 5 }, heading: facingC },
      { position: { x: 160, y: 0, z: 80 - 1 }, heading: facingC },
    ]);
    state.karts.forEach((kart, i) => {
      kart.coins = i === 1 ? 10 : 0;
      const top = kartTopSpeed(kart, 150);
      kart.speed = top;
      kart.velocity = { x: -top, y: 0, z: 0 };
    });
    const after = run(state, 100).state;
    const [a, b] = after.karts.map((k) => k.speed);
    expect((b ?? 0) - (a ?? 0)).toBeCloseTo(10 * C.speed, 2);
  });
});

describe('picking up coins', () => {
  it('a kart driving down a coin line takes every coin, one `coin` event each', () => {
    const { state, events } = run(onRamp([onA(14, 15)]), 60);
    expect(state.karts[0]?.coins).toBe(5);
    expect(coinEvents(events)).toBe(5);
    // Taken line coins wait to come back.
    state.coins?.slice(0, 5).forEach((coin) => expect(coin.respawnTimer).toBeGreaterThan(0));
    state.coins?.slice(5).forEach((coin) => expect(coin.respawnTimer).toBe(0));
  });

  it('never holds more than the most; a coin at the most still sends its event', () => {
    const state = onRamp([onA(14, 15)]);
    const kart = state.karts[0];
    if (kart) kart.coins = C.max - 2;
    const result = run(state, 60);
    expect(result.state.karts[0]?.coins).toBe(C.max);
    expect(coinEvents(result.events)).toBe(5);
  });

  it('gives a small push forward on pickup (never past top speed)', () => {
    const state = onRamp([onA(18 - C.radius - 0.05, 10)]);
    const coast = run(state, 3, NEUTRAL_INPUT);
    expect(coinEvents(coast.events)).toBe(1);
    const noCoins = structuredClone(state);
    noCoins.coins = [];
    const without = run(noCoins, 3, NEUTRAL_INPUT).state.karts[0]?.speed ?? 0;
    expect((coast.state.karts[0]?.speed ?? 0) - without).toBeCloseTo(C.pickupSpeed, 1);

    const fast = onRamp([onA(18 - C.radius - 0.05, 40)]);
    const top = kartTopSpeed(fast.karts[0] ?? ({} as never), 150);
    const fastAfter = run(fast, 1, NEUTRAL_INPUT).state.karts[0];
    expect(fastAfter?.coins).toBe(1);
    expect(fastAfter?.speed ?? 0).toBeLessThan(40);
    expect(fastAfter?.speed ?? 0).toBeGreaterThan(top);
  });

  it('comes back after coins.respawn seconds', () => {
    const s = run(onRamp([onA(14, 15)]), 60).state;
    // Park the kart out of the way, then wait.
    const kart = s.karts[0];
    if (kart) kart.position = { x: 60, y: 0, z: -5 };
    const coin = () => s.coins?.[0];
    const left = coin()?.respawnTimer ?? 0;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(C.respawn);
    for (let t = 0; t < Math.round(left / DT) - 1; t += 1) updateCoins(s, [], DT);
    expect(coin()?.respawnTimer).toBeGreaterThan(0);
    updateCoins(s, [], DT);
    expect(coin()?.respawnTimer).toBe(0);
  });
});

describe('losing coins', () => {
  function withCoins(n: number, others: KartSpawn[] = []): SimState {
    const state = onRamp([onA(50, 0), ...others]);
    const kart = state.karts[0];
    if (kart) kart.coins = n;
    return state;
  }
  const hit = (kartId = 0): SimEvent => ({ type: 'kartHit', kartId, by: 1, kind: 'green' });
  const dropped = (state: SimState) => state.coins?.filter((c) => c.life !== undefined) ?? [];

  it('a hit drops coins.lost coins round the kart', () => {
    const state = withCoins(5);
    updateCoins(state, [hit()], DT);
    expect(state.karts[0]?.coins).toBe(5 - C.lost);
    const loose = dropped(state);
    expect(loose).toHaveLength(C.lost);
    for (const coin of loose) {
      const d = Math.hypot(coin.position.x - 50, coin.position.z);
      expect(d).toBeCloseTo(C.scatterRadius, 6);
      expect(coin.ownerId).toBe(0);
    }
    expect(new Set(state.coins?.map((c) => c.id)).size).toBe(state.coins?.length);
  });

  it('never goes below 0 (drops only what it had)', () => {
    const state = withCoins(1);
    updateCoins(state, [hit()], DT);
    expect(state.karts[0]?.coins).toBe(0);
    expect(dropped(state)).toHaveLength(1);
    updateCoins(state, [hit()], DT);
    expect(state.karts[0]?.coins).toBe(0);
    expect(dropped(state)).toHaveLength(1);
  });

  it('dropped coins can be taken by another kart, not straight back by the one hit', () => {
    const state = withCoins(3, [onA(40, 0, 5)]);
    updateCoins(state, [hit()], DT);
    const coin = dropped(state)[0];
    if (!coin) throw new Error('no dropped coin');
    // The hit kart sits on it: too soon to take it back.
    const victim = state.karts[0];
    if (victim) victim.position = { ...coin.position };
    updateCoins(state, [], DT);
    expect(state.karts[0]?.coins).toBe(0);
    // Another kart drives over it.
    const other = state.karts[1];
    if (victim) victim.position = { x: 70, y: 0, z: -5 };
    if (other) other.position = { ...coin.position };
    const events: SimEvent[] = [];
    updateCoins(state, events, DT);
    expect(state.karts[1]?.coins).toBe(1);
    expect(events).toContainEqual({ type: 'coin', kartId: 1 });
    // A dropped coin is gone once taken (it doesn't come back).
    expect(state.coins?.some((c) => c.id === coin.id)).toBe(false);
  });

  it('dropped coins vanish after coins.scatterLife seconds', () => {
    const state = withCoins(3);
    updateCoins(state, [hit()], DT);
    const kart = state.karts[0];
    if (kart) kart.position = { x: 70, y: 0, z: -5 };
    const ticks = Math.round(C.scatterLife / DT);
    for (let t = 0; t < ticks - 2; t += 1) updateCoins(state, [], DT);
    expect(dropped(state)).toHaveLength(3);
    for (let t = 0; t < 2; t += 1) updateCoins(state, [], DT);
    expect(dropped(state)).toHaveLength(0);
    expect(state.coins).toHaveLength(10);
  });

  it('a real hit in a step costs coins', () => {
    const state = withCoins(4, [onA(46, 0)]);
    const shell = { ...NEUTRAL_INPUT };
    // Kart 1 behind kart 0 holds a green shell and throws it forwards.
    const thrower = state.karts[1];
    if (thrower) {
      thrower.item.held = 'green';
      thrower.item.uses = 1;
    }
    let s = state;
    let hitSeen = false;
    for (let i = 0; i < 60 && !hitSeen; i += 1) {
      const r = step(s, [shell, { ...NEUTRAL_INPUT, item: i === 0 }]);
      s = r.state;
      hitSeen = r.events.some((e) => e.type === 'kartHit' && e.kartId === 0);
    }
    expect(hitSeen).toBe(true);
    expect(s.karts[0]?.coins).toBe(4 - C.lost);
    expect(dropped(s)).toHaveLength(C.lost);
  });

  it('a fall (respawn) loses coins.lost coins, none dropped', () => {
    const state = withCoins(5);
    const r = step(state, [{ ...NEUTRAL_INPUT, respawn: true }]);
    expect(r.events.some((e) => e.type === 'respawn')).toBe(true);
    expect(r.state.karts[0]?.coins).toBe(5 - C.lost);
    expect(dropped(r.state)).toHaveLength(0);
  });
});

describe('determinism', () => {
  it('the same coin race twice gives the same state', () => {
    const start = onRamp([onA(14, 15), onA(10, 15, -3)]);
    expect(run(start, 120).state).toEqual(run(start, 120).state);
  });
});
