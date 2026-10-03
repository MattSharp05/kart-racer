import { beforeAll, describe, expect, it } from 'vitest';
import {
  TEST_RAMP_ID,
  TEST_RAMP_LAYOUT as L,
  testRampTrack,
} from '../mk8/content/courses/test-ramp';
import { registerTestRamp } from '../mk8/content/courses/test-ramp/register';
import { kartTopSpeed } from './kart';
import type { RouteDef } from './route';
import { createSimState } from './state';
import { step } from './step';
import { DT, tuning } from './tuning';
import { insideWater, updateWater } from './underwater';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type KartState,
  type SimEvent,
  type SimState,
} from './types';

/**
 * Underwater (MK-107) on the synthetic `mk8-test-ramp`: straight C (z = 2R, driven along −X) dips
 * `water.depth` m into a basin over x 60–100 (10 m slopes each end), inside a route water volume
 * up to y = 0. Flat basin floor (y = −3) over x 70–90; flat land on C over x −40–60.
 */
const ALONG_C = Math.PI / 2;
const Z_C = 2 * L.turnRadius;
const kart0 = (s: SimState) => s.karts[0] as KartState;
const count = (events: SimEvent[], type: SimEvent['type']) =>
  events.filter((e) => e.type === type).length;

beforeAll(() => registerTestRamp());

/** One kart on C at `x`, `height` m up, with `velocity` (default still). */
function kartAt(x: number, y: number, velocity = { x: 0, y: 0, z: 0 }): SimState {
  const state = createSimState({
    seed: 1,
    trackId: TEST_RAMP_ID,
    engineClass: 150,
    itemsOn: false,
    karts: [{ position: { x, y, z: Z_C }, heading: ALONG_C }],
  });
  kart0(state).velocity = velocity;
  return state;
}

interface Run {
  state: SimState;
  events: SimEvent[];
  ticks: KartState[];
}

/** Steps kart 0 with `input` for `n` ticks (or until `until` says stop). */
function run(
  state: SimState,
  n: number,
  input: Partial<InputFrame> = {},
  until?: (k: KartState, i: number) => boolean,
): Run {
  let s = state;
  const events: SimEvent[] = [];
  const ticks: KartState[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = step(s, [{ ...NEUTRAL_INPUT, ...input }]);
    s = r.state;
    events.push(...r.events);
    ticks.push(structuredClone(kart0(s)));
    if (until?.(kart0(s), i)) break;
  }
  return { state: s, events, ticks };
}

describe('water volumes (MK-107)', () => {
  const route = testRampTrack().route;

  it('the test ramp basin is inside the route water volume, the road around it is not', () => {
    expect(insideWater(route, { x: 80, y: -3, z: Z_C })).toBe(true);
    expect(insideWater(route, { x: 40, y: 0, z: Z_C })).toBe(false);
    expect(insideWater(route, { x: 80, y: 0.5, z: Z_C })).toBe(false);
    expect(insideWater(route, { x: 80, y: 0.5, z: Z_C }, 1)).toBe(true);
  });

  it('a kart on a track without water never gets the flag', () => {
    const dry: RouteDef = { ...route, zones: route.zones.filter((z) => z.kind !== 'water') };
    const kart = kart0(kartAt(80, -3));
    const events: SimEvent[] = [];
    updateWater(kart, dry, events);
    expect(kart.inWater).toBeUndefined();
    expect(events).toEqual([]);
  });

  it('the first look is silent; then one event per crossing, with no flicker at the surface', () => {
    const kart = kart0(kartAt(80, -1));
    const events: SimEvent[] = [];
    updateWater(kart, route, events);
    expect(kart.inWater).toBe(true);
    expect(events).toEqual([]);
    // Bobbing just above the surface (within the exit margin) stays in the water.
    const margin = tuning.mk8.water.exitMargin;
    for (const y of [margin / 2, -0.1, margin * 0.9, 0]) {
      kart.position = { x: 80, y, z: Z_C };
      updateWater(kart, route, events);
    }
    expect(events).toEqual([]);
    kart.position = { x: 80, y: margin + 0.1, z: Z_C };
    updateWater(kart, route, events);
    kart.position = { x: 80, y: margin + 0.05, z: Z_C };
    updateWater(kart, route, events);
    kart.position = { x: 80, y: -0.01, z: Z_C };
    updateWater(kart, route, events);
    expect(events).toEqual([
      { type: 'waterExit', kartId: 0 },
      { type: 'waterEnter', kartId: 0 },
    ]);
  });

  it('driving through the basin: one waterEnter, one waterExit, slower top speed inside', () => {
    const state = kartAt(130, 0, { x: -tuning.topSpeed[150], y: 0, z: 0 });
    const land = kartTopSpeed(kart0(state), 150);
    const r = run(state, 600, { throttle: 1 }, (k) => k.position.x < 40);
    expect(count(r.events, 'waterEnter')).toBe(1);
    expect(count(r.events, 'waterExit')).toBe(1);
    const enter = r.events.findIndex((e) => e.type === 'waterEnter');
    const exit = r.events.findIndex((e) => e.type === 'waterExit');
    expect(enter).toBeLessThan(exit);
    // On the flat basin floor (after the drag has shed the extra speed) it runs at the water's
    // top speed; before the basin and after it, at the kart's own.
    const floor = r.ticks.filter((k) => k.position.x < 78 && k.position.x > 72);
    expect(floor.length).toBeGreaterThan(0);
    for (const k of floor) {
      expect(k.inWater).toBe(true);
      expect(k.speed).toBeCloseTo(land * tuning.mk8.water.topSpeed, 1);
    }
    const before = r.ticks.find((k) => k.position.x < 110) as KartState;
    expect(before.inWater).toBe(false);
    expect(before.speed).toBeCloseTo(land, 1);
    const after = r.ticks.at(-1) as KartState;
    expect(after.inWater).toBe(false);
    expect(after.position.y).toBeCloseTo(0, 1);
  });

  it('gravity under water is tuning.mk8.water.gravity × the normal pull', () => {
    const fall = (x: number, y: number) => {
      const r = run(kartAt(x, y), 6);
      const a = r.ticks[2] as KartState;
      const b = r.ticks[5] as KartState;
      expect(b.grounded).toBe(false);
      return (b.velocity.y - a.velocity.y) / (3 * DT);
    };
    expect(fall(80, -1.5)).toBeCloseTo(-tuning.gravity * tuning.mk8.water.gravity, 6);
    expect(fall(30, 1.5)).toBeCloseTo(-tuning.gravity, 6);
  });

  it('sinking under water is capped at maxSink', () => {
    const state = kartAt(80, -0.1, { x: 0, y: -20, z: 0 });
    kart0(state).grounded = false;
    const r = run(state, 3);
    for (const k of r.ticks)
      expect(k.velocity.y).toBeGreaterThanOrEqual(-tuning.mk8.water.maxSink - 1e-9);
  });

  it('the same jump travels further under water than on land', () => {
    const launch = { x: -15, y: 6, z: 0 };
    const jump = (x: number, ground: number) => {
      const r = run(kartAt(x, ground + 0.5, launch), 300, {}, (k) => k.grounded);
      const k = r.ticks.at(-1) as KartState;
      expect(k.grounded).toBe(true);
      expect(k.position.y).toBeCloseTo(ground, 1);
      return { distance: x - k.position.x, airTime: r.ticks.length * DT, inWater: k.inWater };
    };
    const water = jump(90, -L.water.depth);
    const land = jump(40, 0);
    expect(water.inWater).toBe(true);
    expect(land.inWater).toBe(false);
    expect(water.distance).toBeGreaterThan(land.distance * 1.5);
    expect(water.airTime).toBeGreaterThan(land.airTime * 1.5);
  });

  it('a hop under water goes higher than on land', () => {
    const peak = (x: number, ground: number) => {
      // Settle on the ground first, then hop (drift button, no steer).
      let s = run(kartAt(x, ground), 10).state;
      let top = ground;
      for (let i = 0; i < 90; i += 1) {
        s = step(s, [{ ...NEUTRAL_INPUT, drift: i < 2 }]).state;
        top = Math.max(top, kart0(s).position.y);
      }
      return top - ground;
    };
    const water = peak(80, -L.water.depth);
    const land = peak(30, 0);
    expect(land).toBeGreaterThan(0.1);
    expect(water).toBeGreaterThan(land * 2);
  });

  it('a respawn looks at the water afresh, without a splash', () => {
    let s = run(kartAt(80, -3), 10).state;
    expect(kart0(s).inWater).toBe(true);
    const events: SimEvent[] = [];
    for (let i = 0; i < 240; i += 1) {
      const r = step(s, [{ ...NEUTRAL_INPUT, respawn: i === 0 }]);
      s = r.state;
      events.push(...r.events);
    }
    expect(count(events, 'respawn')).toBe(1);
    expect(count(events, 'waterEnter') + count(events, 'waterExit')).toBe(0);
    expect(kart0(s).inWater).toBeDefined();
  });
});
