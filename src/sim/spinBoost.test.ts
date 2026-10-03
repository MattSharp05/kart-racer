import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_RAMP_ID, TEST_RAMP_LAYOUT as L } from '../mk8/content/courses/test-ramp';
import { registerTestRamp } from '../mk8/content/courses/test-ramp/register';
import spinBoostScenarios from '../scenarios/mk8/spinBoost';
import { resolveKartCollisions } from './collisions';
import type { Vec3 } from './math';
import type { RouteZone } from './route';
import { hitBumpers } from './spinBoost';
import { createSimState, type KartSpawn } from './state';
import { step } from './step';
import { tuning } from './tuning';
import { NEUTRAL_INPUT, type KartState, type SimEvent, type SimState } from './types';

/**
 * Anti-gravity spin boost (MK-108) on the synthetic `mk8-test-ramp`: its tunnel (A, x 30–85) has a
 * 90° anti-gravity wall on the right (z = 7, facing −Z) with a boost bumper on it; the rest of the
 * course is plain road, with another bumper beside the road at x 140.
 */
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const WALL_Z = L.roadHalfWidth;
/** Heading that faces +X (down straight A). */
const ALONG_A = -Math.PI / 2;
/** Up of a kart on the tunnel's anti-gravity wall. */
const ON_WALL = v(0, 0, -1);
const TOP = tuning.topSpeed[150];
const THROTTLE = { ...NEUTRAL_INPUT, throttle: 1 };

beforeAll(registerTestRamp);

function race(karts: KartSpawn[]): SimState {
  return createSimState({
    seed: 1,
    trackId: TEST_RAMP_ID,
    engineClass: 150,
    itemsOn: false,
    karts,
  });
}

/** Steps `n` ticks, every kart at full throttle; each tick's karts and all events. */
function run(state: SimState, n: number): { ticks: KartState[][]; events: SimEvent[] } {
  let s = state;
  const ticks: KartState[][] = [];
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = step(
      s,
      s.karts.map(() => THROTTLE),
    );
    s = r.state;
    events.push(...r.events);
    ticks.push(structuredClone(s.karts));
  }
  return { ticks, events };
}

const spins = (events: SimEvent[], kartId: number) =>
  events.filter((e) => e.type === 'spinBoost' && e.kartId === kartId).length;

/** Kart 0 at top speed catching kart 1 (slower, 6 m ahead) on a line along A at `y`, `z`. */
function chase(y: number, z: number, x: number, up?: Vec3): SimState {
  return race([
    { position: v(x, y, z), heading: ALONG_A, speed: TOP, ...(up ? { up } : {}) },
    { position: v(x + 6, y, z), heading: ALONG_A, speed: 10, ...(up ? { up } : {}) },
  ]);
}

describe('spin boost from kart bumps (MK-108)', () => {
  it('two karts bumping on anti-gravity ground both gain speed for the tuned time', () => {
    // High on the wall, clear of its bumper.
    const { ticks, events } = run(chase(6, WALL_Z, 32, ON_WALL), 150);
    expect(spins(events, 0)).toBeGreaterThanOrEqual(1);
    expect(spins(events, 1)).toBeGreaterThanOrEqual(1);
    const first = events.findIndex((e) => e.type === 'spinBoost');
    expect(events.slice(0, first).some((e) => e.type === 'bump')).toBe(true);
    const boostTicks = Math.round(tuning.mk8.spinBoost.seconds * 60);
    for (const id of [0, 1]) {
      const timers = ticks.map((karts) => karts[id]?.spinBoostTimer ?? 0);
      const start = timers.findIndex((t) => t > 0);
      expect(start).toBeGreaterThan(0);
      // Runs for the tuned time (±1 tick), then stops.
      const length = timers.slice(start).findIndex((t) => t === 0);
      expect(Math.abs(length - boostTicks)).toBeLessThanOrEqual(1);
      // Faster than a kart can drive on its own while it runs; back under top speed after.
      const speeds = ticks.map((karts) => karts[id]?.speed ?? 0);
      expect(Math.max(...speeds.slice(start, start + boostTicks))).toBeGreaterThan(TOP * 1.1);
      expect(speeds[speeds.length - 1]).toBeLessThan(TOP * 1.02);
      expect(ticks[start]?.[id]?.antigrav).toBe(true);
    }
  });

  it('the same bump on plain road gives no boost', () => {
    // On the floor at the start of A, beside the dash panel.
    const { ticks, events } = run(chase(0, 4, -30), 150);
    expect(events.some((e) => e.type === 'bump')).toBe(true);
    expect(events.some((e) => e.type === 'spinBoost')).toBe(false);
    for (const karts of ticks) {
      for (const k of karts) {
        expect(k.spinBoostTimer ?? 0).toBe(0);
        expect(k.speed).toBeLessThan(TOP * 1.02);
      }
    }
  });

  it('needs both karts in anti-gravity, and heavier karts still push lighter ones', () => {
    const kart = (id: number, x: number, vx: number, antigrav: boolean): KartState => {
      const k = chase(0, 0, 0).karts[0] as KartState;
      return {
        ...structuredClone(k),
        id,
        kartType: id === 0 ? 'boulder' : 'pixie',
        position: v(x, 0, 0),
        velocity: v(vx, 0, 0),
        up: v(0, 1, 0),
        forward: v(1, 0, 0),
        antigrav,
      };
    };
    for (const [aOn, bOn, boosted] of [
      [true, true, true],
      [true, false, false],
      [false, false, false],
    ] as const) {
      const a = kart(0, 0, 10, aOn);
      const b = kart(1, 2.5, -10, bOn);
      const events: SimEvent[] = [];
      resolveKartCollisions([a, b], new Map(), events);
      expect(events.some((e) => e.type === 'bump')).toBe(true);
      expect(spins(events, 0) + spins(events, 1)).toBe(boosted ? 2 : 0);
      expect((a.spinBoostTimer ?? 0) > 0).toBe(boosted);
      expect((b.spinBoostTimer ?? 0) > 0).toBe(boosted);
      // The heavy kart (boulder) loses less of its speed than the light one (pixie).
      expect(a.velocity.x).toBeGreaterThan(-b.velocity.x);
    }
  });

  it('a running spin boost is not restarted by another bump', () => {
    const k = chase(0, 0, 0).karts[0] as KartState;
    const a = { ...structuredClone(k), id: 0, position: v(0, 0, 0), velocity: v(5, 0, 0) };
    const b = { ...structuredClone(k), id: 1, position: v(2.5, 0, 0), velocity: v(-5, 0, 0) };
    for (const x of [a, b])
      Object.assign(x, { up: v(0, 1, 0), forward: v(1, 0, 0), antigrav: true });
    a.spinBoostTimer = 0.1;
    const events: SimEvent[] = [];
    resolveKartCollisions([a, b], new Map(), events);
    expect(a.spinBoostTimer).toBe(0.1);
    expect(spins(events, 0)).toBe(0);
    expect(spins(events, 1)).toBe(1);
  });
});

describe('boost bumpers (MK-108)', () => {
  it('driving into the bumper on the anti-gravity wall bounces off it with a spin boost', () => {
    const at = L.wallBumper;
    const state = race([
      { position: v(at.x - 12, at.height, WALL_Z), heading: ALONG_A, speed: 20, up: ON_WALL },
    ]);
    const { ticks, events } = run(state, 120);
    // At full throttle it drives back into it once the boost is over: another boost.
    expect(spins(events, 0)).toBeGreaterThanOrEqual(1);
    const start = ticks.findIndex((karts) => (karts[0]?.spinBoostTimer ?? 0) > 0);
    expect(ticks[start]?.[0]?.antigrav).toBe(true);
    // It bounced: never inside the bumper, and its speed along A dropped at the hit.
    for (const karts of ticks) {
      const k = karts[0] as KartState;
      const gap = Math.hypot(k.position.x - at.x, k.position.y - at.height);
      expect(gap).toBeGreaterThan(at.radius + tuning.kartRadius - tuning.bumpCircleOffset - 0.05);
    }
    expect(ticks[start]?.[0]?.velocity.x ?? 0).toBeLessThan(ticks[start - 1]?.[0]?.velocity.x ?? 0);
  });

  it('the bumper beside plain road is just a collider: a bounce, no boost', () => {
    const at = L.bumper;
    const state = race([{ position: v(at.x - 12, 0, at.lateral), heading: ALONG_A, speed: 20 }]);
    const { ticks, events } = run(state, 120);
    expect(events.some((e) => e.type === 'wallHit')).toBe(true);
    expect(events.some((e) => e.type === 'spinBoost')).toBe(false);
    const xs = ticks.map((karts) => karts[0]?.position.x ?? 0);
    // Stopped short of the bumper (it's in the kart's way), then bounced back.
    expect(Math.max(...xs)).toBeLessThan(at.x - at.radius);
    expect(ticks.every((karts) => (karts[0]?.spinBoostTimer ?? 0) === 0)).toBe(true);
  });

  it('hitBumpers: anti-gravity decides the boost; out of reach along up is no contact', () => {
    const bumper: RouteZone = { kind: 'boostBumper', position: v(0, 0.5, 0), radius: 1 };
    const kartAt = (y: number, antigrav: boolean): KartState => ({
      ...structuredClone(chase(0, 0, 0).karts[0] as KartState),
      position: v(-2, y, 0),
      velocity: v(10, 0, 0),
      up: v(0, 1, 0),
      forward: v(1, 0, 0),
      antigrav,
    });
    for (const antigrav of [true, false]) {
      const k = kartAt(0, antigrav);
      const events: SimEvent[] = [];
      hitBumpers(k, [bumper], v(0, 1, 0), v(1, 0, 0), events);
      // Pushed back out and bouncing away.
      expect(k.position.x).toBeLessThan(-2);
      expect(k.velocity.x).toBeLessThan(0);
      expect(spins(events, k.id)).toBe(antigrav ? 1 : 0);
    }
    // A kart on a ceiling over it (3 m up) doesn't touch it.
    const above = kartAt(3, true);
    const events: SimEvent[] = [];
    hitBumpers(above, [bumper], v(0, 1, 0), v(1, 0, 0), events);
    expect(above.velocity.x).toBe(10);
    expect(events).toEqual([]);
  });
});

describe('spin boost scenarios (MK-108)', () => {
  it.each(['mk8-test-spinboost', 'mk8-test-bumper'])('%s gives the player a spin boost', (name) => {
    const scenario = spinBoostScenarios.find((s) => s.name === name);
    const setup = scenario?.setup(1);
    if (!setup || !('state' in setup) || !setup.state) throw new Error(`no ${name}`);
    const { events } = run(setup.state, 90);
    expect(spins(events, 0)).toBeGreaterThanOrEqual(1);
  });
});
