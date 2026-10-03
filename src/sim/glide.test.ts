import { beforeAll, describe, expect, it } from 'vitest';
import { tracks } from '../content/tracks';
import {
  TEST_RAMP_ID,
  TEST_RAMP_LAYOUT as L,
  testRampTrack,
} from '../mk8/content/courses/test-ramp';
import { registerTestRamp } from '../mk8/content/courses/test-ramp/register';
import { glideStep, inGlideZone, pitchInput } from './glide';
import { MESH_SURFACES, type MeshTrackDef } from './meshTrack';
import type { RouteDef } from './route';
import { createSimState } from './state';
import { step } from './step';
import { DT, tuning, type EngineClass } from './tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type KartState,
  type ShellEntity,
  type SimEvent,
  type SimState,
} from './types';

/**
 * Gliders (MK-106) on the synthetic `mk8-test-ramp`: straight A has a glide ramp (x 90–100, rising
 * 3 m, surface `glide` and a route glide zone) and then a 20 m gap (x 100–120) over a void floor.
 */
const ALONG_A = -Math.PI / 2;
/** The same course with the ramp made plain road and no glide zone: a normal ramp jump. */
const PLAIN_ID = 'mk8-test-ramp-plain';
/** Plain road on the ramp, but the route's glide zone kept: the zone alone opens the glider. */
const ZONE_ONLY_ID = 'mk8-test-ramp-zone-only';

function variant(id: string, keepZone: boolean): MeshTrackDef {
  const base = testRampTrack();
  const glide = MESH_SURFACES.indexOf('glide');
  const road = MESH_SURFACES.indexOf('road');
  const route: RouteDef = keepZone
    ? base.route
    : { ...base.route, zones: base.route.zones.filter((z) => z.kind !== 'glide') };
  return {
    ...base,
    id,
    collision: {
      ...base.collision,
      surfaces: base.collision.surfaces.map((s) => (s === glide ? road : s)),
    },
    route,
  };
}

beforeAll(() => {
  registerTestRamp();
  for (const [id, keepZone] of [
    [PLAIN_ID, false],
    [ZONE_ONLY_ID, true],
  ] as const) {
    if (!tracks.has(id))
      tracks.register({ id, name: id, order: 1001, def: variant(id, keepZone), testOnly: true });
  }
});

/** One kart on A at x = 40 already at top speed, heading for the glide ramp. */
function runUp(trackId = TEST_RAMP_ID, engineClass: EngineClass = 150, itemsOn = false): SimState {
  const state = createSimState({
    seed: 1,
    trackId,
    engineClass,
    itemsOn,
    karts: [{ position: { x: 40, y: 0, z: 0 }, heading: ALONG_A }],
  });
  const kart = state.karts[0] as KartState;
  kart.velocity = { x: tuning.topSpeed[engineClass], y: 0, z: 0 };
  return state;
}

interface Flight {
  state: SimState;
  events: SimEvent[];
  /** Kart 0 after every tick. */
  ticks: KartState[];
  /** Tick the glider opened (−1: never) and the tick the kart landed after launching (−1: never). */
  opened: number;
  landed: number;
}

const kart0 = (s: SimState) => s.karts[0] as KartState;

/**
 * Drives kart 0 at full throttle up to the ramp, then `air(kart, tick)` once it's off the ground,
 * until it has been back on the ground `after` ticks (or `max` ticks).
 */
function fly(
  state: SimState,
  air: (k: KartState, i: number) => Partial<InputFrame> = () => ({ throttle: 1 }),
  after = 0,
  max = 600,
): Flight {
  let s = state;
  const events: SimEvent[] = [];
  const ticks: KartState[] = [];
  let launched = -1;
  let opened = -1;
  let landed = -1;
  for (let i = 0; i < max; i += 1) {
    const k = kart0(s);
    const frame = launched >= 0 && !k.grounded ? air(k, i) : { throttle: 1 };
    const r = step(s, [{ ...NEUTRAL_INPUT, ...frame }]);
    s = r.state;
    events.push(...r.events);
    ticks.push(structuredClone(kart0(s)));
    for (const e of r.events) {
      if (e.type === 'launch' && launched < 0) launched = i;
      if (e.type === 'glideOpen' && opened < 0) opened = i;
      if (e.type === 'land' && launched >= 0 && landed < 0) landed = i;
    }
    if (landed >= 0 && i >= landed + after) break;
  }
  return { state: s, events, ticks, opened, landed };
}

const count = (events: SimEvent[], type: SimEvent['type']) =>
  events.filter((e) => e.type === type).length;

describe('gliding off the test ramp (MK-106)', () => {
  it('a 150cc kart opens its glider at the lip, clears the gap and lands on the far side', () => {
    const f = fly(runUp());
    expect(f.opened).toBeGreaterThan(0);
    expect(f.landed).toBeGreaterThan(f.opened);
    const launch = f.ticks[f.opened] as KartState;
    expect(launch.position.x).toBeGreaterThan(L.glide.to);
    expect(launch.position.x).toBeLessThan(L.gap.from + 3);
    const landing = f.ticks[f.landed] as KartState;
    expect(landing.position.x).toBeGreaterThan(L.gap.to + 2);
    expect(landing.position.y).toBeCloseTo(0, 1);
    expect(landing.glide).toBeUndefined();
    // Glides the whole way: opened once, folded once, never respawned.
    expect(count(f.events, 'glideOpen')).toBe(1);
    expect(count(f.events, 'glideClose')).toBe(1);
    expect(count(f.events, 'respawn')).toBe(0);
    for (const k of f.ticks.slice(f.opened, f.landed)) expect(k.glide).toBeDefined();
    // No landing penalty at a normal angle: it keeps nearly all its speed.
    expect(landing.speed).toBeGreaterThan(0.9 * tuning.topSpeed[150]);
  });

  it('every class clears the gap gliding level (neither stick)', () => {
    for (const cc of [100, 150, 200] as const) {
      const f = fly(runUp(TEST_RAMP_ID, cc), () => ({ throttle: 1, brake: 1 }));
      expect((f.ticks[f.landed] as KartState).position.x, `${cc}cc`).toBeGreaterThan(L.gap.to);
    }
  });

  it('gliding floats: it stays up much longer than a plain ramp jump', () => {
    const glide = fly(runUp(), () => ({ throttle: 1, brake: 1 }));
    const jump = fly(runUp(PLAIN_ID));
    const airTicks = (f: Flight) => f.ticks.slice(0, f.landed).filter((k) => !k.grounded).length;
    expect(airTicks(glide)).toBeGreaterThan(1.3 * airTicks(jump));
  });

  it('holding dive lands sooner and faster than holding float', () => {
    const dive = fly(runUp(), () => ({ throttle: 1 }));
    const level = fly(runUp(), () => ({ throttle: 1, brake: 1 }));
    const float = fly(runUp(), () => ({ brake: 1 }));
    const time = (f: Flight) => f.landed - f.opened;
    const speed = (f: Flight) => (f.ticks[f.landed] as KartState).speed;
    expect(time(dive)).toBeLessThan(time(level));
    expect(time(level)).toBeLessThan(time(float));
    expect(speed(dive)).toBeGreaterThan(speed(level));
    expect(speed(level)).toBeGreaterThan(speed(float));
    // Diving still clears the gap.
    expect((dive.ticks[dive.landed] as KartState).position.x).toBeGreaterThan(L.gap.to);
  });

  it('steering turns the flight', () => {
    const straight = fly(runUp(), () => ({ throttle: 1, brake: 1 }));
    const left = fly(runUp(), () => ({ throttle: 1, brake: 1, steer: -1 }));
    // Half a second into the glide: turned left (towards −Z from +X), moving the way it faces.
    const mid = (f: Flight) => f.ticks[f.opened + 30] as KartState;
    const k = mid(left);
    expect(k.glide).toBeDefined();
    expect(k.heading).toBeGreaterThan(ALONG_A + 0.2);
    expect(k.position.z).toBeLessThan(mid(straight).position.z - 1);
    const f = k.forward as { x: number; z: number };
    const v = k.velocity;
    expect((v.x * f.x + v.z * f.z) / Math.hypot(v.x, v.z)).toBeGreaterThan(0.95);
  });

  it('a trick off the glide ramp still boosts on landing', () => {
    const f = fly(runUp(), (_, i) => ({ throttle: 1, brake: 1, drift: i % 2 === 0 }), 1);
    expect(count(f.events, 'trick')).toBe(1);
    expect(f.events.some((e) => e.type === 'boost')).toBe(true);
    expect((f.ticks[f.landed] as KartState).boostTimer).toBeGreaterThan(0);
  });

  it('the route glide zone alone opens the glider (plain road ramp)', () => {
    const f = fly(runUp(ZONE_ONLY_ID));
    expect(f.opened).toBeGreaterThan(0);
  });

  it('a hop on the glide ramp is not a launch', () => {
    // Hop (drift tap, no steer) half-way up the ramp.
    let s = runUp();
    const events: SimEvent[] = [];
    let hopped = false;
    for (let i = 0; i < 200 && kart0(s).position.x < L.glide.to - 1; i += 1) {
      const x = kart0(s).position.x;
      const drift = !hopped && x > L.glide.from + 3;
      if (drift) hopped = true;
      const r = step(s, [{ ...NEUTRAL_INPUT, throttle: 1, drift }]);
      s = r.state;
      events.push(...r.events);
    }
    expect(count(events, 'hop')).toBe(1);
    expect(count(events, 'glideOpen')).toBe(0);
  });
});

describe('hopping off the glide ramp (MK-106)', () => {
  it('a hop just before the lip still opens the glider and clears the gap', () => {
    let s = runUp();
    const events: SimEvent[] = [];
    let hopped = false;
    for (let i = 0; i < 400; i += 1) {
      const k = kart0(s);
      const drift = !hopped && k.grounded && k.position.x > L.glide.to - 2;
      if (drift) hopped = true;
      const r = step(s, [{ ...NEUTRAL_INPUT, throttle: 1, drift }]);
      s = r.state;
      events.push(...r.events);
      if (hopped && kart0(s).grounded && kart0(s).position.x > L.gap.from) break;
    }
    expect(count(events, 'hop')).toBe(1);
    expect(count(events, 'glideOpen')).toBe(1);
    expect(count(events, 'respawn')).toBe(0);
    expect(kart0(s).position.x).toBeGreaterThan(L.gap.to);
  });
});

describe('without a glide ramp (MK-106 regression)', () => {
  it('a ramp jump falls with normal gravity and never opens a glider', () => {
    const f = fly(runUp(PLAIN_ID), () => ({ throttle: 1 }));
    expect(f.landed).toBeGreaterThan(0);
    expect(count(f.events, 'glideOpen')).toBe(0);
    const air = f.ticks.filter((k, i) => i < f.landed && !k.grounded);
    expect(air.length).toBeGreaterThan(20);
    for (const k of air) expect(k.glide).toBeUndefined();
    // Free fall: vertical speed drops by g·dt every airborne tick.
    for (let i = 1; i + 1 < air.length; i += 1) {
      const dv = (air[i] as KartState).velocity.y - (air[i - 1] as KartState).velocity.y;
      expect(dv).toBeCloseTo(-tuning.gravity * DT, 2);
    }
  });
});

describe('ending a glide (MK-106)', () => {
  it('hitting a wall folds the glider and the kart drops with normal gravity', () => {
    // Gliding low beside the right-hand wall on A (lateral 11), drifting into it.
    const state = createSimState({
      seed: 1,
      trackId: TEST_RAMP_ID,
      engineClass: 150,
      itemsOn: false,
      karts: [{ position: { x: 135, y: 1, z: 9.5 }, heading: ALONG_A }],
    });
    const k = kart0(state);
    k.grounded = false;
    k.airTime = 0.5;
    k.glide = { time: 0.5, pitch: 0 };
    k.velocity = { x: 20, y: 0, z: 12 };
    let s = state;
    const events: SimEvent[] = [];
    let closedAt = -1;
    for (let i = 0; i < 20 && closedAt < 0; i += 1) {
      const r = step(s, [{ ...NEUTRAL_INPUT, throttle: 1, brake: 1 }]);
      s = r.state;
      events.push(...r.events);
      if (r.events.some((e) => e.type === 'glideClose')) closedAt = i;
    }
    expect(closedAt).toBeGreaterThanOrEqual(0);
    expect(events.some((e) => e.type === 'wallHit')).toBe(true);
    expect(kart0(s).grounded).toBe(false);
    expect(kart0(s).glide).toBeUndefined();
    const vy = kart0(s).velocity.y;
    const next = step(s, [{ ...NEUTRAL_INPUT, throttle: 1 }]).state;
    if (!kart0(next).grounded)
      expect(kart0(next).velocity.y - vy).toBeCloseTo(-tuning.gravity * DT, 6);
  });

  it('a wall ending a long glide times the fall from the wall, not the launch', () => {
    const state = createSimState({
      seed: 1,
      trackId: TEST_RAMP_ID,
      engineClass: 150,
      itemsOn: false,
      karts: [{ position: { x: 135, y: 1, z: 9.5 }, heading: ALONG_A }],
    });
    const k = kart0(state);
    k.grounded = false;
    k.airTime = tuning.mk8.fallSeconds + 0.5;
    k.glide = { time: k.airTime, pitch: 0 };
    k.velocity = { x: 20, y: 0, z: 12 };
    let s = state;
    const events: SimEvent[] = [];
    for (let i = 0; i < 20; i += 1) {
      const r = step(s, [{ ...NEUTRAL_INPUT, throttle: 1 }]);
      s = r.state;
      events.push(...r.events);
    }
    expect(count(events, 'glideClose')).toBe(1);
    expect(count(events, 'respawn')).toBe(0);
  });

  it('a long glide is not a fall until `glide.fallSeconds`', () => {
    const state = runUp();
    const k = kart0(state);
    // High above the far road: gliding, in the air longer than a fall would be.
    k.position = { x: 125, y: 40, z: 0 };
    k.grounded = false;
    k.airTime = tuning.mk8.fallSeconds + 0.5;
    k.glide = { time: k.airTime, pitch: 0 };
    const r = step(state, [{ ...NEUTRAL_INPUT, throttle: 1 }]);
    expect(r.events.some((e) => e.type === 'respawn')).toBe(false);
    k.airTime = tuning.mk8.glide.fallSeconds + 0.5;
    const late = step(state, [{ ...NEUTRAL_INPUT, throttle: 1 }]);
    expect(late.events.some((e) => e.type === 'respawn')).toBe(true);
    expect(kart0(late.state).glide).toBeUndefined();
  });
});

describe('items while gliding (MK-106)', () => {
  it('a green shell fired mid-glide flies forward, level', () => {
    let s = runUp(TEST_RAMP_ID, 150, true);
    for (let i = 0; i < 400 && !kart0(s).glide; i += 1)
      s = step(s, [{ ...NEUTRAL_INPUT, throttle: 1 }]).state;
    for (let i = 0; i < 20; i += 1)
      s = step(s, [{ ...NEUTRAL_INPUT, throttle: 1, brake: 1 }]).state;
    const k = kart0(s);
    expect(k.glide).toBeDefined();
    // A ready green shell (the run-up drove through the route's item boxes: no roulette spinning).
    k.item.held = 'green';
    k.item.uses = 1;
    k.item.roulette = 0;
    s = step(s, [{ ...NEUTRAL_INPUT, throttle: 1, brake: 1, item: true }]).state;
    const shell = s.entities.find((e): e is ShellEntity => e.kind === 'shell');
    expect(shell).toBeDefined();
    const y0 = shell!.position.y;
    const x0 = shell!.position.x;
    for (let i = 0; i < 10; i += 1)
      s = step(s, [{ ...NEUTRAL_INPUT, throttle: 1, brake: 1 }]).state;
    const later = s.entities.find((e): e is ShellEntity => e.id === shell!.id);
    expect(later).toBeDefined();
    expect(later!.position.y).toBe(y0);
    expect(later!.position.x).toBeGreaterThan(x0 + 5);
  });
});

describe('launching off a steep slope (MK-106)', () => {
  it('keeps its heading while the kart levels out (no sideways swing)', () => {
    // Facing +X down a 60° slope: up tilted towards +X. No steering: it must fly straight on.
    const k = kart0(runUp());
    const tilt = Math.PI / 3;
    let up = { x: Math.sin(tilt), y: Math.cos(tilt), z: 0.02 };
    let forward = { x: Math.cos(tilt), y: -Math.sin(tilt), z: 0 };
    k.grounded = false;
    k.glide = { time: 0, pitch: 0 };
    k.velocity = { x: 26, y: 7, z: 0 };
    for (let i = 0; i < 60; i += 1) {
      const flight = glideStep(k, NEUTRAL_INPUT, forward, up, 28, 1, DT);
      k.velocity = flight.velocity;
      forward = flight.forward;
      up = flight.up;
    }
    expect(Math.abs(forward.z)).toBeLessThan(1e-6);
    expect(Math.abs(k.velocity.z)).toBeLessThan(1e-6);
    expect(up.y).toBeGreaterThan(0.99);
  });
});

describe('glide helpers (MK-106)', () => {
  it('glide zones may wrap past the start line', () => {
    const route = {
      ...testRampTrack().route,
      zones: [{ kind: 'glide' as const, from: 0.95, to: 0.05 }],
    };
    expect(inGlideZone(route, 0.97)).toBe(true);
    expect(inGlideZone(route, 0.02)).toBe(true);
    expect(inGlideZone(route, 0.5)).toBe(false);
  });

  it('throttle dives, brake floats, both or neither is level', () => {
    const at = (throttle: number, brake: number) =>
      pitchInput({ ...NEUTRAL_INPUT, throttle, brake });
    expect(at(1, 0)).toBe(1);
    expect(at(0, 1)).toBe(-1);
    expect(at(1, 1)).toBe(0);
    expect(at(0, 0)).toBe(0);
  });
});
