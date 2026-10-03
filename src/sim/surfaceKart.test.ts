import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tracks } from '../content/tracks';
import { TEST_RAMP_ID, TEST_RAMP_LAYOUT as L } from '../mk8/content/courses/test-ramp';
import { tOnA } from '../mk8/content/courses/test-ramp/layout';
import { registerTestRamp } from '../mk8/content/courses/test-ramp/register';
import { cross, dot, normalize, scale, type Vec3 } from './math';
import { collisionFromTriangles, MESH_SURFACES, type MeshSurface } from './meshTrack';
import { createSimState, type KartSpawn } from './state';
import { step } from './step';
import { tuning } from './tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type KartState,
  type SimEvent,
  type SimState,
} from './types';

/**
 * Surface-frame kart physics on mesh tracks (MK-99, ADR 0011), on the synthetic `mk8-test-ramp`:
 * its tunnel (A, x 30–85) has a 90° anti-gravity wall on the right (z = 7, facing −Z) and an
 * anti-gravity ceiling 8 m up; the rest is plain road with 1.5 m walls along both edges.
 */
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const WALL_Z = L.roadHalfWidth;
/** Heading that faces +X (down straight A). */
const ALONG_A = -Math.PI / 2;

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

const input = (frame: Partial<InputFrame>): InputFrame => ({ ...NEUTRAL_INPUT, ...frame });

/** Steer that turns kart `k` towards world direction `d` (laid into its plane). */
function steerTowards(k: KartState, d: Vec3): number {
  const f = k.forward ?? v(0, 0, -1);
  const u = k.up ?? v(0, 1, 0);
  const want = normalize(d);
  const left = dot(want, cross(u, f));
  if (dot(want, f) < 0) return left > 0 ? -1 : 1;
  return Math.max(-1, Math.min(1, -3 * left));
}

interface Run {
  state: SimState;
  events: SimEvent[];
  ticks: KartState[];
}

/** Steps `state` `n` ticks with `drive(kart 0, tick)` for kart 0 (others: `others`). */
function run(
  state: SimState,
  n: number,
  drive: (k: KartState, i: number) => InputFrame,
  others: InputFrame[] = [],
): Run {
  let s = state;
  const events: SimEvent[] = [];
  const ticks: KartState[] = [];
  for (let i = 0; i < n; i += 1) {
    const kart = s.karts[0];
    if (!kart) throw new Error('no kart');
    const r = step(s, [drive(kart, i), ...others]);
    s = r.state;
    events.push(...r.events);
    ticks.push(structuredClone(s.karts[0] as KartState));
  }
  return { state: s, events, ticks };
}

describe('anti-gravity on the test ramp (MK-99)', () => {
  it('at 150cc a kart drives up the 90° wall, along the ceiling and back down without leaving the surface', () => {
    // At the wall's foot, angled 36° towards it.
    let phase = 0;
    const phases: number[] = [];
    const targets = [v(0.5, 0, 1), v(0.2, 1, 0), v(0.2, 0, 1), v(0.2, -1, 0), v(1, 0, 0)];
    const r = run(race([{ position: v(32, 0, 2), heading: -0.8 * Math.PI }]), 300, (k) => {
      const up = k.up ?? v(0, 1, 0);
      if (phase === 0 && up.y < 0.3) phase = 1; // on the wall: head for the ceiling
      if (phase === 1 && up.y < -0.7) phase = 2; // on the ceiling: back to the wall
      if (phase === 2 && up.y > -0.3) phase = 3; // on the wall again: down
      if (phase === 3 && up.y > 0.9) phase = 4; // on the floor
      phases.push(phase);
      const steer = phase === 0 ? 0 : steerTowards(k, targets[phase] ?? v(1, 0, 0));
      return input({ throttle: 0.75, steer });
    });
    const ups = r.ticks.map((k) => k.up ?? v(0, 1, 0));
    const done = phases.indexOf(4);
    expect(done).toBeGreaterThan(0);
    // It went up the wall, upside down along the ceiling, and back down the wall to the floor…
    expect(ups.some((u) => u.z < -0.99)).toBe(true);
    expect(Math.min(...ups.map((u) => u.y))).toBeLessThan(-0.99);
    expect(ups[done]?.y).toBeGreaterThan(0.9);
    const end = r.ticks[done] as KartState;
    expect(end.position.y).toBeCloseTo(0, 1);
    expect(end.position.x).toBeLessThan(L.tunnel.to);
    // …on the ground every tick, never more than a few cm off the tunnel's floor/wall/ceiling box…
    const route = r.ticks.slice(0, done + 1);
    expect(route.every((k) => k.grounded)).toBe(true);
    for (const k of route) {
      const { y, z } = k.position;
      const gap = Math.min(Math.abs(y), Math.abs(z - WALL_Z), Math.abs(y - L.tunnel.height));
      // On a face, or bridging a 90° corner: wheels 1 m ahead and behind on the two faces put
      // the kart's centre up to 1 m × sin 45° ≈ 0.71 m off each.
      expect(gap).toBeLessThan(tuning.mk8.wheelForward * Math.SQRT1_2 + 0.05);
      expect(y).toBeGreaterThan(-0.15);
      expect(y).toBeLessThan(L.tunnel.height + 0.15);
      expect(z).toBeLessThan(WALL_Z + 0.15);
    }
    // …in anti-gravity mode while off the floor, and back to normal gravity on it.
    expect(route.filter((k) => (k.up?.y ?? 1) < 0.5).every((k) => k.antigrav)).toBe(true);
    expect(r.ticks.at(-1)?.antigrav).toBe(false);
    expect(r.ticks.at(-1)?.gravityDir).toEqual(v(0, -1, 0));
    // `up` turns smoothly: at most 10° a tick, even round the tunnel's sharp 90° corners.
    for (let i = 1; i < ups.length; i += 1) {
      const a = ups[i - 1] as Vec3;
      const b = ups[i] as Vec3;
      expect(Math.acos(Math.min(1, dot(a, b)))).toBeLessThan((10 * Math.PI) / 180);
    }
  });

  it('upside down on the ceiling, gravity pulls into it: a kart left alone stays there', () => {
    const r = run(
      race([{ position: v(45, L.tunnel.height, 0), heading: ALONG_A, up: v(0, -1, 0) }]),
      120,
      () => NEUTRAL_INPUT,
    );
    const k = r.state.karts[0] as KartState;
    expect(k.grounded).toBe(true);
    expect(k.antigrav).toBe(true);
    expect(k.position.y).toBeCloseTo(L.tunnel.height, 5);
    expect(k.gravityDir).toEqual(v(-0, 1, -0));
  });

  it('a kart driving at a plain wall is stopped by it and can’t climb it', () => {
    // Straight A before the tunnel: the left 1.5 m wall at z = −11, driven at head-on at 150cc.
    const r = run(race([{ position: v(20, 0, -5), heading: 0 }]), 120, () =>
      input({ throttle: 1 }),
    );
    expect(r.events.some((e) => e.type === 'wallHit')).toBe(true);
    for (const k of r.ticks) {
      expect(k.position.z).toBeGreaterThan(-11 + tuning.mk8.wallRadius - 0.3);
      expect(k.position.y).toBeCloseTo(0, 5);
      expect(k.up).toEqual(v(0, 1, 0));
      expect(k.antigrav).toBe(false);
    }
    expect(Math.abs(r.state.karts[0]?.speed ?? 99)).toBeLessThan(6);
  });

  it('drifting works on the wall: a tier 2 mini-turbo charges there and boosts', () => {
    // On the wall, 4.8 m up, heading 40° below +X at drift speed. Drift right (curving up the
    // wall), steering out of it so the arc is wide enough to stay on the wall until tier 2.
    const start = race([
      { position: v(40, 4.8, WALL_Z), heading: ALONG_A, up: v(0, 0, -1), speed: 13 },
    ]);
    const kart = start.karts[0] as KartState;
    const down = normalize(v(Math.cos((40 * Math.PI) / 180), -Math.sin((40 * Math.PI) / 180), 0));
    kart.forward = down;
    kart.velocity = scale(down, 13);
    let released = false;
    const r = run(start, 110, (k, i) => {
      released ||= k.drift.tier === 2;
      if (released) return input({ throttle: 0.5 });
      return input({ throttle: 0.5, steer: i < 2 ? 1 : -1, drift: i >= 1 });
    });
    const at = r.events.findIndex((e) => e.type === 'driftTier' && e.tier === 2);
    expect(at).toBeGreaterThan(0);
    const tier2 = r.ticks.find((k) => k.drift.tier === 2);
    expect(tier2?.up?.z).toBeLessThan(-0.95);
    expect(tier2?.position.z).toBeCloseTo(WALL_Z, 1);
    // On the wall the whole time, and letting go gives an orange mini-turbo there.
    expect(r.events).toContainEqual({ type: 'miniTurbo', kartId: 0, tier: 2 });
    const boosted = r.ticks.findIndex((k) => k.boostTimer > 0);
    expect(boosted).toBeGreaterThan(0);
    expect(r.ticks.slice(0, boosted + 1).every((k) => (k.up?.z ?? 0) < -0.95)).toBe(true);
  });

  it('a drift hop on the wall comes back down onto the wall', () => {
    const s = race([{ position: v(40, 4, WALL_Z), heading: ALONG_A, up: v(0, 0, -1), speed: 20 }]);
    const r = run(s, 40, (_, i) => input({ throttle: 1, drift: i === 2 }));
    expect(r.events.some((e) => e.type === 'hop')).toBe(true);
    expect(r.ticks.some((k) => !k.grounded)).toBe(true);
    const k = r.state.karts[0] as KartState;
    expect(k.grounded).toBe(true);
    expect(k.position.z).toBeCloseTo(WALL_Z, 3);
    expect(k.up?.z).toBeLessThan(-0.99);
  });

  it('two karts colliding on the wall push apart along the wall', () => {
    // Head-on along the wall, 4 m up.
    const s = race([
      { position: v(50, 4, WALL_Z), heading: ALONG_A, up: v(0, 0, -1), speed: 12 },
      { position: v(56, 4, WALL_Z), heading: Math.PI / 2, up: v(0, 0, -1), speed: 12 },
    ]);
    let state = s;
    const events: SimEvent[] = [];
    // Until 3 ticks after the bump: their spin boosts (MK-108) then drive them back together.
    let after = -1;
    for (let i = 0; i < 40 && after < 3; i += 1) {
      const r = step(state, [input({ throttle: 0.3 }), input({ throttle: 0.3 })]);
      state = r.state;
      events.push(...r.events);
      if (after >= 0 || r.events.some((e) => e.type === 'bump')) after += 1;
    }
    const bump = events.find((e) => e.type === 'bump');
    expect(bump).toBeDefined();
    const [a, b] = state.karts as [KartState, KartState];
    // Pushed apart along the wall (x), still on it: no push into or off the wall.
    expect(b.position.x - a.position.x).toBeGreaterThan(tuning.kartRadius * 2 - 0.05);
    expect(a.velocity.x).toBeLessThan(0);
    expect(b.velocity.x).toBeGreaterThan(0);
    for (const k of [a, b]) {
      expect(k.position.z).toBeCloseTo(WALL_Z, 3);
      expect(Math.abs(k.velocity.z)).toBeLessThan(1e-6);
      expect(k.up?.z).toBeLessThan(-0.99);
    }
  });

  it('karts on the floor and on the ceiling above them don’t bump', () => {
    const s = race([
      { position: v(50, 0, 0), heading: ALONG_A },
      { position: v(50, L.tunnel.height, 0), heading: ALONG_A, up: v(0, -1, 0) },
    ]);
    let state = s;
    for (let i = 0; i < 10; i += 1) {
      const r = step(state, []);
      expect(r.events.some((e) => e.type === 'bump')).toBe(false);
      state = r.state;
    }
  });

  it('off the end of the anti-gravity wall: gravity stays on the wall for a moment, then pulls down and up eases back to +Y', () => {
    const s = race([
      { position: v(L.tunnel.to - 3, 5, WALL_Z), heading: ALONG_A, up: v(0, 0, -1), speed: 25 },
    ]);
    const r = run(s, 70, () => input({ throttle: 1 }));
    const firstAir = r.ticks.findIndex((k) => !k.grounded);
    expect(firstAir).toBeGreaterThan(0);
    const air = r.ticks.slice(firstAir);
    const hold = Math.floor(tuning.mk8.antigravAirHold * 60) - 1;
    expect(air[1]?.gravityDir?.z).toBeCloseTo(1, 5);
    expect(air[hold + 3]?.gravityDir).toEqual(v(0, -1, 0));
    const ups = air.map((k) => k.up?.y ?? 0);
    expect(ups.at(-1)).toBeGreaterThan(0.5);
    expect(ups.at(-1)).toBeGreaterThan(ups[hold + 3] ?? 1);
  });

  it('a fall into the gap puts the kart back at the route’s respawn point, on the road, with its up', () => {
    // Slowly off the top of the glide ramp, down into the void under the gap.
    const s = race([{ position: v(L.glide.to - 4, 0, 0), heading: ALONG_A, speed: 6 }]);
    const r = run(s, 400, () => input({ throttle: 0.2 }));
    expect(r.events.some((e) => e.type === 'respawn')).toBe(true);
    const back = r.ticks.findIndex((k) => k.respawnTimer > 0);
    const placed = r.ticks[back] as KartState;
    expect(placed.position.x).toBeCloseTo(70, 0);
    expect(placed.up).toEqual(expect.objectContaining({ y: expect.closeTo(1, 5) }));
    expect(placed.race.lastT).toBeCloseTo(tOnA(70), 3);
    const landed = r.ticks.slice(back).find((k) => k.respawnTimer === 0);
    expect(landed?.grounded).toBe(true);
    expect(landed?.position.y).toBeCloseTo(0, 3);
  });

  it('is deterministic: the same inputs give the same states', () => {
    const drive = (_: KartState, i: number) =>
      input({ throttle: 1, steer: Math.sin(i / 20), drift: i % 90 > 40 });
    const a = run(race([{ position: v(32, 0, 2), heading: -0.8 * Math.PI }]), 400, drive);
    const b = run(race([{ position: v(32, 0, 2), heading: -0.8 * Math.PI }]), 400, drive);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});

describe('steep plain ground is a wall; steep anti-gravity ground is a road (MK-99)', () => {
  const ID = 'mk99-slopes';

  /** A 40 m floor along +X, then a 70° slope rising out of it, made of `slope`. */
  function slopeTrack(slope: MeshSurface): void {
    const p: number[] = [];
    const s: number[] = [];
    const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, surface: MeshSurface) => {
      p.push(
        a.x,
        a.y,
        a.z,
        b.x,
        b.y,
        b.z,
        c.x,
        c.y,
        c.z,
        a.x,
        a.y,
        a.z,
        c.x,
        c.y,
        c.z,
        d.x,
        d.y,
        d.z,
      );
      s.push(MESH_SURFACES.indexOf(surface), MESH_SURFACES.indexOf(surface));
    };
    quad(v(0, 0, -6), v(0, 0, 6), v(40, 0, 6), v(40, 0, -6), 'road');
    const run = 10 / Math.tan((70 * Math.PI) / 180);
    quad(v(40, 0, -6), v(40, 0, 6), v(40 + run, 10, 6), v(40 + run, 10, -6), slope);
    const def = {
      id: ID,
      kind: 'mesh' as const,
      collision: collisionFromTriangles(new Float32Array(p), new Uint8Array(s), 4),
      route: {
        points: [v(0, 0, 0), v(10, 0, 0), v(20, 0, 0), v(30, 0, 0)].map((q) => ({
          ...q,
          width: 12,
        })),
        checkpoints: [0],
        respawnPoints: [],
        gridSlots: [],
        itemBoxRows: [],
        coinLines: [],
        zones: [],
      },
    };
    tracks.unregister(ID);
    tracks.register({ id: ID, name: ID, order: 0, def, testOnly: true });
  }

  afterAll(() => tracks.unregister(ID));

  const drive = () =>
    run(
      createSimState({
        seed: 1,
        trackId: ID,
        engineClass: 150,
        itemsOn: false,
        karts: [{ position: v(10, 0, 0), heading: ALONG_A }],
      }),
      150,
      () => input({ throttle: 1 }),
    );

  it('plain road at 70° stops the kart like a wall', () => {
    slopeTrack('road');
    const r = drive();
    expect(r.events.some((e) => e.type === 'wallHit')).toBe(true);
    expect(Math.max(...r.ticks.map((k) => k.position.y))).toBeLessThan(0.5);
    expect(Math.max(...r.ticks.map((k) => k.position.x))).toBeLessThan(40);
  });

  it('anti-gravity at 70° is driven up', () => {
    slopeTrack('antigrav');
    const r = drive();
    expect(Math.max(...r.ticks.map((k) => k.position.y))).toBeGreaterThan(5);
    // Stuck to it all the way up (it flies off the top, 10 m up).
    const onSlope = r.ticks.filter((k) => k.position.y > 2 && k.position.y < 9);
    expect(onSlope.every((k) => k.grounded && k.antigrav)).toBe(true);
  });
});
