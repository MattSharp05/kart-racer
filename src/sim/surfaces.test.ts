import { describe, expect, it } from 'vitest';
import { HAZARD_TEST, hazardTest } from '../content/tracks/hazard-test/sim';
import { createSimState } from './state';
import { step } from './step';
import { surfaceEffect } from './surfaces';
import { groundAt, trackGeometry } from './track';
import { tuning } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from './types';

const geometry = trackGeometry(hazardTest);
/** Lap fraction on the back straight (x = −45) at `z`. */
const tAtZ = (z: number) => HAZARD_TEST.tAt(-45, z);
/** A road spot on the back straight between the ice and the sand. */
const ROAD_Z = -27;

function kartAt(z: number, { speed = 0, sideways = 0 } = {}): SimState {
  const t = tAtZ(z);
  const state = createSimState({
    seed: 1,
    trackId: 'hazard-test',
    karts: [{ position: geometry.pointAt(t, 0), heading: geometry.headingAt(t), speed }],
  });
  const kart = state.karts[0]!;
  const { normal } = geometry.project(kart.position);
  kart.velocity = {
    x: kart.velocity.x + normal.x * sideways,
    y: 0,
    z: kart.velocity.z + normal.z * sideways,
  };
  return state;
}

function run(state: SimState, ticks: number, input: InputFrame = NEUTRAL_INPUT): SimState {
  for (let i = 0; i < ticks; i += 1) state = step(state, [input]).state;
  return state;
}

/** Sideways speed of kart 0 relative to the track, m/s. */
function sideways(state: SimState): number {
  const kart = state.karts[0]!;
  const { normal } = geometry.project(kart.position);
  return kart.velocity.x * normal.x + kart.velocity.z * normal.z;
}

const middle = (range: { from: number; to: number }) => (range.from + range.to) / 2;

describe('surface modifiers (MK-49)', () => {
  it('the hazard test track lays ice, sand and a conveyor where it says', () => {
    const at = (z: number) => groundAt(hazardTest, geometry.pointAt(tAtZ(z), 0)).surface;
    expect(at(middle(HAZARD_TEST.ice))).toBe('ice');
    expect(at(middle(HAZARD_TEST.sand))).toBe('sand');
    expect(at(middle(HAZARD_TEST.conveyor))).toBe('conveyor');
    expect(at(ROAD_Z)).toBe('road');
  });

  it('ice: a sideways slide lasts much longer than on road (grip × iceGrip)', () => {
    expect(surfaceEffect('ice').grip).toBe(tuning.surfaces.iceGrip);
    const onIce = sideways(run(kartAt(HAZARD_TEST.ice.from + 2, { speed: 5, sideways: 8 }), 20));
    const onRoad = sideways(run(kartAt(ROAD_Z, { speed: 5, sideways: 8 }), 20));
    expect(onRoad).toBeLessThan(1.5);
    expect(onIce).toBeGreaterThan(5);
  });

  it('sand: slows a kart at full throttle towards sandSpeed × top speed', () => {
    expect(surfaceEffect('sand').speed).toBe(tuning.surfaces.sandSpeed);
    const full = { ...NEUTRAL_INPUT, throttle: 1 };
    const top = tuning.topSpeed[100];
    const onSand = run(kartAt(HAZARD_TEST.sand.from + 1, { speed: top }), 30, full).karts[0]!;
    const onRoad = run(kartAt(-70, { speed: top }), 30, full).karts[0]!;
    expect(onRoad.speed).toBeGreaterThan(top * 0.95);
    expect(onSand.speed).toBeLessThan(top * 0.85);
  });

  it('sand: a held drift wobbles (its turn rate varies; on road it is steady)', () => {
    const drift = { ...NEUTRAL_INPUT, throttle: 1, steer: 1, drift: true };
    /** Spread of the per-tick heading change over ticks 20–40 (after the drift hop has landed). */
    const spread = (z: number) => {
      let state = kartAt(z, { speed: tuning.topSpeed[100] });
      const turns: number[] = [];
      for (let i = 0; i < 40; i += 1) {
        const before = state.karts[0]!.heading;
        state = step(state, [drift]).state;
        if (i >= 20) turns.push(state.karts[0]!.heading - before);
      }
      return Math.max(...turns) - Math.min(...turns);
    };
    expect(spread(HAZARD_TEST.sand.from + 1)).toBeGreaterThan(tuning.surfaces.sandWobble / 60);
    expect(spread(-70)).toBeLessThan(1e-3);
  });

  it('conveyor: carries a stopped kart along the belt (to the right) at conveyorSpeed', () => {
    const start = kartAt(middle(HAZARD_TEST.conveyor));
    const before = geometry.project(start.karts[0]!.position).lateral;
    const after = geometry.project(run(start, 60).karts[0]!.position).lateral;
    expect(after - before).toBeCloseTo(tuning.surfaces.conveyorSpeed, 0);
  });

  it('offroad and deep grass keep their MVP speeds', () => {
    expect(surfaceEffect('offroad').speed).toBe(tuning.offroadSpeed);
    expect(surfaceEffect('rough').speed).toBe(tuning.roughSpeed);
    expect(surfaceEffect('road')).toEqual({});
  });
});
